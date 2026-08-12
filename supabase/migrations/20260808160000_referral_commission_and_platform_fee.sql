-- Bootcamp revenue split: platform fee, tutor share, referral commission.
--
-- Until now a bootcamp payment moved the full amount from learner to tutor by
-- writing profiles.coins directly. Two problems with that:
--
--   * Zero Club took nothing, so there was no platform revenue.
--   * It bypassed wallet_apply, so the money never reached wallet_transactions.
--     No audit trail, no idempotency, and a failure between the debit and the
--     credit lost money silently.
--
-- Every bootcamp payment is now split three ways:
--
--   platform  10% of the price, always
--   referrer  the tutor's chosen percent of the price, only when the learner
--             arrived through someone's referral link
--   tutor     whatever remains: 90% minus the referral percent
--
-- The referral comes out of the tutor's share, never the platform's. A tutor
-- who sets 50% still keeps 40% of the price.
--
-- Referral money is EARNED immediately but not spendable immediately. It sits
-- as 'pending' until the month closes. That window is what makes a refund
-- recoverable: reversing a pending row costs nothing, chasing money someone
-- has already withdrawn costs everything.

-- ---------------------------------------------------------------- settings ---

alter table public.bootcamps
  add column if not exists referral_percent numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bootcamps_referral_percent_range'
  ) then
    -- Capped at 50 in the database, not just the form. A mistyped 200 would
    -- otherwise pay out more than the learner paid, and a 100% bootcamp is a
    -- way to move money around at no cost.
    alter table public.bootcamps
      add constraint bootcamps_referral_percent_range
      check (referral_percent >= 0 and referral_percent <= 50);
  end if;
end $$;

comment on column public.bootcamps.referral_percent is
  'Share of the price paid to whoever referred the learner, 0-50. Comes out '
  'of the tutor share, not the platform fee.';

-- The platform cut, in one place rather than scattered through functions.
create or replace function public.zero_club_platform_fee_percent()
returns numeric
language sql
immutable
as $$ select 10::numeric $$;

-- ------------------------------------------------------------- attribution ---

-- Who referred whom, for WHICH bootcamp. Deliberately not profiles.referred_by:
-- that records who invited someone to the platform, permanently, so reusing it
-- would pay the same person commission on every bootcamp that learner ever buys,
-- forever. Attribution here is per bootcamp and expires.
create table if not exists public.bootcamp_referral_clicks (
  id uuid primary key default gen_random_uuid(),
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  visitor_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 30 days is long enough for someone to think it over, short enough that a
  -- click a year ago does not earn commission.
  expires_at timestamptz not null default now() + interval '30 days',

  -- A referrer cannot earn from their own purchase.
  constraint bootcamp_referral_no_self check (visitor_id is null or visitor_id <> referrer_id)
);

create index if not exists bootcamp_referral_clicks_lookup
  on public.bootcamp_referral_clicks (bootcamp_id, visitor_id, created_at desc);

alter table public.bootcamp_referral_clicks enable row level security;

drop policy if exists bootcamp_referral_clicks_insert on public.bootcamp_referral_clicks;
create policy bootcamp_referral_clicks_insert
  on public.bootcamp_referral_clicks for insert to authenticated
  with check (visitor_id = auth.uid());

drop policy if exists bootcamp_referral_clicks_select on public.bootcamp_referral_clicks;
create policy bootcamp_referral_clicks_select
  on public.bootcamp_referral_clicks for select to authenticated
  using (referrer_id = auth.uid() or visitor_id = auth.uid());

-- ---------------------------------------------------------------- earnings ---

create table if not exists public.referral_earnings (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,

  gross_amount numeric not null check (gross_amount >= 0),
  percent numeric not null check (percent >= 0 and percent <= 50),
  amount numeric not null check (amount >= 0),

  status text not null default 'pending'
    check (status in ('pending', 'released', 'reversed')),

  -- The month this belongs to, as its first day. Payout runs settle a month.
  earned_period date not null default date_trunc('month', now())::date,
  released_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,

  -- One earning per payment. The unique index below is what actually enforces
  -- it, so a retried payment cannot pay commission twice.
  payment_reference text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists referral_earnings_payment_unique
  on public.referral_earnings (payment_reference);

create index if not exists referral_earnings_referrer_idx
  on public.referral_earnings (referrer_id, status, earned_period);

alter table public.referral_earnings enable row level security;

drop policy if exists referral_earnings_select_own on public.referral_earnings;
create policy referral_earnings_select_own
  on public.referral_earnings for select to authenticated
  using (referrer_id = auth.uid());

-- ----------------------------------------------------------- platform ledger ---

create table if not exists public.platform_revenue (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  bootcamp_id uuid references public.bootcamps(id) on delete set null,
  buyer_id uuid references public.profiles(id) on delete set null,
  gross_amount numeric not null,
  fee_amount numeric not null,
  payment_reference text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists platform_revenue_reference_unique
  on public.platform_revenue (payment_reference);

alter table public.platform_revenue enable row level security;
-- No policy: readable only with the service role. Platform revenue is not
-- something any signed-in user should be able to enumerate.

-- ------------------------------------------------------------------ split ---

-- Splits one bootcamp payment and records every leg. Called after the learner
-- has already been debited, so it only distributes.
create or replace function public.settle_bootcamp_payment(
  p_bootcamp_id uuid,
  p_buyer_id uuid,
  p_owner_id uuid,
  p_amount numeric,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fee_percent numeric := public.zero_club_platform_fee_percent();
  ref_percent numeric := 0;
  platform_cut numeric := 0;
  referral_cut numeric := 0;
  tutor_cut numeric := 0;
  referrer uuid;
begin
  if p_amount <= 0 then
    return jsonb_build_object('platform', 0, 'referral', 0, 'tutor', 0);
  end if;

  select coalesce(referral_percent, 0) into ref_percent
  from public.bootcamps where id = p_bootcamp_id;

  -- Most recent unexpired click for this learner and bootcamp. Self-referral
  -- is already excluded by the table constraint, and re-checked here because
  -- rows predating that constraint could exist.
  select referrer_id into referrer
  from public.bootcamp_referral_clicks
  where bootcamp_id = p_bootcamp_id
    and visitor_id = p_buyer_id
    and referrer_id <> p_buyer_id
    and expires_at > now()
  order by created_at desc
  limit 1;

  platform_cut := round(p_amount * fee_percent / 100.0, 2);

  if referrer is not null and ref_percent > 0 then
    referral_cut := round(p_amount * ref_percent / 100.0, 2);
  end if;

  -- Whatever is left. Computed by subtraction so the three legs always sum to
  -- the amount paid, with no rounding drift.
  tutor_cut := p_amount - platform_cut - referral_cut;

  -- Tutor: spendable now.
  perform public.wallet_apply(
    p_owner_id, 'credit', tutor_cut, 'bootcamp',
    'Bootcamp payment received', p_reference || ':tutor',
    jsonb_build_object('bootcamp_id', p_bootcamp_id, 'gross', p_amount)
  );

  -- Platform: recorded, not credited to anyone's wallet.
  insert into public.platform_revenue (
    source, bootcamp_id, buyer_id, gross_amount, fee_amount, payment_reference
  ) values (
    'bootcamp', p_bootcamp_id, p_buyer_id, p_amount, platform_cut, p_reference
  )
  on conflict (payment_reference) do nothing;

  -- Referrer: earned now, spendable after the month closes.
  if referral_cut > 0 then
    insert into public.referral_earnings (
      referrer_id, buyer_id, bootcamp_id, gross_amount, percent, amount, payment_reference
    ) values (
      referrer, p_buyer_id, p_bootcamp_id, p_amount, ref_percent, referral_cut, p_reference
    )
    on conflict (payment_reference) do nothing;

    insert into public.notifications (profile_id, actor_id, type, content)
    values (
      referrer, p_buyer_id, 'system',
      'You earned a referral bonus. It becomes available at the end of the month.'
    );
  end if;

  return jsonb_build_object(
    'platform', platform_cut,
    'referral', referral_cut,
    'tutor', tutor_cut,
    'referrer_id', referrer
  );
end;
$$;

revoke all on function public.settle_bootcamp_payment(uuid, uuid, uuid, numeric, text) from public;

-- ----------------------------------------------------------------- payout ---

-- Releases everything earned before the current month. Idempotent: a row moves
-- from pending to released once, and wallet_apply's unique reference stops a
-- second run crediting again even if this is called twice.
create or replace function public.release_referral_earnings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  row_earning record;
  released integer := 0;
begin
  for row_earning in
    select * from public.referral_earnings
    where status = 'pending'
      and earned_period < date_trunc('month', now())::date
    order by created_at
  loop
    perform public.wallet_apply(
      row_earning.referrer_id, 'credit', row_earning.amount, 'referral',
      'Referral bonus released', 'referral_release:' || row_earning.id::text,
      jsonb_build_object('bootcamp_id', row_earning.bootcamp_id, 'period', row_earning.earned_period)
    );

    update public.referral_earnings
    set status = 'released', released_at = now()
    where id = row_earning.id;

    released := released + 1;
  end loop;

  return released;
end;
$$;

revoke all on function public.release_referral_earnings() from public;

-- Cancels a pending commission, for a refunded or reversed purchase. Only
-- pending rows can be reversed - once released the money is spent, and taking
-- it back would push a wallet negative.
create or replace function public.reverse_referral_earning(
  p_payment_reference text,
  p_reason text default 'Purchase refunded'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.referral_earnings
  set status = 'reversed', reversed_at = now(), reversal_reason = p_reason
  where payment_reference = p_payment_reference
    and status = 'pending';

  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.reverse_referral_earning(text, text) from public;

-- ------------------------------------------------- rewire the payment path ---

-- submit_zero_form previously moved money with two bare UPDATEs on
-- profiles.coins: debit the learner, credit the owner the full amount. It is
-- replaced below so the debit goes through wallet_apply (ledgered, idempotent,
-- and it refuses to overdraw) and the credit goes through
-- settle_bootcamp_payment (split three ways).
--
-- Everything before the payment step is unchanged.
create or replace function public.submit_zero_form(form_slug text, answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  form public.zero_forms;
  bootcamp public.bootcamps;
  state text;
  payable numeric;
  balance numeric;
  existing public.zero_form_registrations;
  new_registration public.zero_form_registrations;
  reference text;
  split jsonb;
begin
  if caller is null then raise exception 'Please sign in to register'; end if;

  select * into form from public.zero_forms where slug = form_slug;
  if form.id is null then raise exception 'This Zero Form no longer exists'; end if;

  select * into bootcamp from public.bootcamps where id = form.bootcamp_id;

  perform public.process_zero_form_launch(form.bootcamp_id);
  select * into form from public.zero_forms where id = form.id;

  state := public.zero_form_state(form, bootcamp);
  if state = 'draft' then raise exception 'This form has not been published yet'; end if;
  if state = 'closed' or state = 'deadline_passed' then raise exception 'Registration for this bootcamp has closed'; end if;
  if state = 'bootcamp_started' then raise exception 'This bootcamp has already started. Join it directly instead'; end if;
  if state = 'full' then raise exception 'All seats for this bootcamp have been taken'; end if;

  if exists (select 1 from public.enrollments where bootcamp_id = form.bootcamp_id and profile_id = caller) then
    raise exception 'You are already enrolled in this bootcamp';
  end if;

  select * into existing from public.zero_form_registrations
  where zero_form_id = form.id and user_id = caller;

  payable := form.early_bird_price;

  if existing.id is not null then
    if existing.registration_status in ('confirmed', 'enrolled') then
      return jsonb_build_object('status', 'already_registered', 'registration', to_jsonb(existing));
    end if;
    update public.zero_form_registrations
    set registration_data = answers, amount = payable, updated_at = now()
    where id = existing.id
    returning * into new_registration;
  else
    insert into public.zero_form_registrations (
      zero_form_id, bootcamp_id, user_id, registration_data, amount,
      payment_status, registration_status
    ) values (
      form.id, form.bootcamp_id, caller, answers, payable,
      case when payable > 0 then 'pending' else 'not_required' end,
      case when payable > 0 then 'payment_pending' else 'pending' end
    )
    returning * into new_registration;
  end if;

  if payable <= 0 then
    update public.zero_form_registrations
    set registration_status = 'confirmed', payment_status = 'not_required',
        confirmed_at = now(), updated_at = now()
    where id = new_registration.id
    returning * into new_registration;

    insert into public.notifications (profile_id, actor_id, type, content)
    values (caller, form.owner_id, 'system',
            'You are registered for "' || bootcamp.title || '". It starts soon.');

    return jsonb_build_object('status', 'confirmed', 'registration', to_jsonb(new_registration));
  end if;

  select coalesce(coins, 0) into balance from public.profiles where id = caller;
  if balance < payable then
    return jsonb_build_object(
      'status', 'insufficient_funds',
      'amount', payable,
      'balance', balance,
      'shortfall', payable - balance,
      'registration', to_jsonb(new_registration)
    );
  end if;

  reference := 'zf_' || replace(gen_random_uuid()::text, '-', '');

  -- Debit through the ledger. wallet_apply refuses to take a wallet negative,
  -- so this doubles as the final balance check under concurrency.
  perform public.wallet_apply(
    caller, 'debit', payable, 'zero_form',
    'Bootcamp registration: ' || bootcamp.title, reference || ':buyer',
    jsonb_build_object('bootcamp_id', form.bootcamp_id, 'zero_form_id', form.id)
  );

  -- Distribute: platform fee, referral commission, tutor remainder.
  split := public.settle_bootcamp_payment(
    form.bootcamp_id, caller, form.owner_id, payable, reference
  );

  update public.zero_form_registrations
  set payment_status = 'paid', registration_status = 'confirmed',
      payment_reference = reference, confirmed_at = now(), updated_at = now()
  where id = new_registration.id
  returning * into new_registration;

  insert into public.notifications (profile_id, actor_id, type, content)
  values
    (caller, form.owner_id, 'system',
     'Registration confirmed for "' || bootcamp.title || '".'),
    (form.owner_id, caller, 'system',
     'New Zero Form registration for "' || bootcamp.title || '".');

  return jsonb_build_object(
    'status', 'confirmed',
    'registration', to_jsonb(new_registration),
    'split', split
  );
end;
$$;

grant execute on function public.submit_zero_form(text, jsonb) to authenticated;
