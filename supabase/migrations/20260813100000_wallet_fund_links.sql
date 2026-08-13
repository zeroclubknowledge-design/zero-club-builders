-- Fund links: let someone else put money into your wallet.
--
-- A fund link is a shareable URL that credits ITS OWNER's wallet, whoever
-- pays. Two kinds of payer:
--
--   On Zero Club   pays from their own wallet, or by card. Either way the
--                  money lands in the owner's wallet.
--   Off Zero Club  has no account and no wallet, so card only.
--
-- The important design decision is that the card path needs NO change to the
-- Paystack Edge Functions. credit_wallet_from_paystack already decides whose
-- wallet to credit by looking up wallet_topups by reference, preferring that
-- over anything the browser claims. So a fund link payment simply writes a
-- wallet_topups row whose profile_id is the LINK OWNER before checkout. The
-- existing webhook then credits the right person, even if the payer closes
-- the tab, and even though the payer may not have an account at all.
--
-- A trigger on wallet_topups closes the loop: when a top-up tied to a fund
-- link succeeds, the payment row is marked paid and the owner is notified.

-- ------------------------------------------------------------------ tables ---

create table if not exists public.fund_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  -- Short, random, and the only thing standing between a stranger and this
  -- link, so it is derived from a random uuid rather than from anything to do
  -- with the owner.
  slug text not null unique,

  -- Null means "payer decides". A fixed amount is stored in base wallet units,
  -- the same units as profiles.coins, so no conversion happens at pay time.
  amount numeric check (amount is null or amount > 0),
  note text,

  status text not null default 'active' check (status in ('active', 'closed')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists fund_links_owner_idx
  on public.fund_links (owner_id, created_at desc);

create table if not exists public.fund_link_payments (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.fund_links(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,

  -- Null for someone paying from outside Zero Club, who has no account.
  payer_id uuid references public.profiles(id) on delete set null,
  payer_label text,

  amount numeric not null check (amount > 0),
  method text not null check (method in ('wallet', 'gateway')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),

  -- Shared with wallet_topups.reference for gateway payments, which is how the
  -- trigger below ties a confirmed Paystack payment back to this row.
  reference text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists fund_link_payments_link_idx
  on public.fund_link_payments (link_id, created_at desc);

alter table public.fund_links enable row level security;
alter table public.fund_link_payments enable row level security;

-- Only the owner reads their own links and the payments against them. Everyone
-- else goes through get_fund_link_public, which returns strictly less.
drop policy if exists fund_links_select_own on public.fund_links;
create policy fund_links_select_own
  on public.fund_links for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists fund_link_payments_select_own on public.fund_link_payments;
create policy fund_link_payments_select_own
  on public.fund_link_payments for select to authenticated
  using (owner_id = auth.uid() or payer_id = auth.uid());

-- No insert or update policies at all. Every write happens inside a
-- security-definer function below, so the browser can never invent a payment.

-- ------------------------------------------------------------------- slugs ---

create or replace function public.generate_fund_link_slug()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  attempts integer := 0;
begin
  loop
    attempts := attempts + 1;
    -- gen_random_uuid rather than gen_random_bytes: the former is core
    -- Postgres, the latter lives in pgcrypto, which sits in the `extensions`
    -- schema on Supabase and is therefore invisible to a function pinned to
    -- search_path = public. Same randomness, no extension dependency.
    candidate := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    exit when length(candidate) = 12
      and not exists (select 1 from public.fund_links where slug = candidate);
    if attempts > 20 then
      raise exception 'Could not generate a fund link code';
    end if;
  end loop;
  return candidate;
end;
$$;

-- ------------------------------------------------------------------ create ---

create or replace function public.create_fund_link(
  p_amount numeric default null,
  p_note text default null,
  p_expires_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_slug text;
  new_id uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if p_amount is not null and p_amount <= 0 then
    raise exception 'Amount must be more than zero';
  end if;

  -- A cap, so a typo cannot create a link asking for a fortune.
  if p_amount is not null and p_amount > 10000000 then
    raise exception 'That amount is too large for a fund link';
  end if;

  new_slug := public.generate_fund_link_slug();

  insert into public.fund_links (owner_id, slug, amount, note, expires_at)
  values (
    caller,
    new_slug,
    p_amount,
    nullif(btrim(coalesce(p_note, '')), ''),
    case when p_expires_days is null then null
         else now() + make_interval(days => greatest(1, least(365, p_expires_days))) end
  )
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'slug', new_slug);
end;
$$;

grant execute on function public.create_fund_link(numeric, text, integer) to authenticated;

create or replace function public.close_fund_link(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  affected integer;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  update public.fund_links
  set status = 'closed'
  where slug = p_slug and owner_id = caller;

  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'Fund link not found'; end if;

  return jsonb_build_object('closed', true);
end;
$$;

grant execute on function public.close_fund_link(text) to authenticated;

-- ------------------------------------------------------------------ lookup ---

-- Readable by anyone holding the link, including signed-out payers and the
-- crawlers that build link previews. Returns only what a payment page needs:
-- who is being funded, how much, and whether the link still works. No email,
-- no balance, no payment history.
create or replace function public.get_fund_link_public(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.fund_links;
  owner public.profiles;
begin
  select * into link from public.fund_links where slug = p_slug;
  if link.id is null then
    return jsonb_build_object('found', false);
  end if;

  select * into owner from public.profiles where id = link.owner_id;

  return jsonb_build_object(
    'found', true,
    'slug', link.slug,
    'amount', link.amount,
    'note', link.note,
    'status', link.status,
    'expired', link.expires_at is not null and link.expires_at <= now(),
    'owner_id', owner.id,
    'owner_name', coalesce(owner.full_name, owner.username),
    'owner_username', owner.username,
    'owner_avatar', owner.avatar_url
  );
end;
$$;

grant execute on function public.get_fund_link_public(text) to anon, authenticated;

-- Whether a given gateway payment has landed yet. A signed-out payer has no
-- rows they are allowed to read, so this is how their page confirms.
create or replace function public.get_fund_link_payment_status(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payment public.fund_link_payments;
begin
  select * into payment from public.fund_link_payments where reference = p_reference;
  if payment.id is null then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'status', payment.status,
    'amount', payment.amount
  );
end;
$$;

grant execute on function public.get_fund_link_payment_status(text) to anon, authenticated;

-- --------------------------------------------------------------- validation ---

-- Shared by both payment paths so the rules cannot drift apart.
create or replace function public.assert_fund_link_payable(p_slug text, p_amount numeric)
returns public.fund_links
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.fund_links;
begin
  select * into link from public.fund_links where slug = p_slug;

  if link.id is null then raise exception 'This fund link does not exist'; end if;
  if link.status <> 'active' then raise exception 'This fund link has been closed'; end if;
  if link.expires_at is not null and link.expires_at <= now() then
    raise exception 'This fund link has expired';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount'; end if;

  -- A fixed-amount link is fixed. Otherwise the amount shown on the page and
  -- the amount actually charged could differ.
  if link.amount is not null and p_amount <> link.amount then
    raise exception 'This link is for a fixed amount';
  end if;

  return link;
end;
$$;

-- ------------------------------------------------------------ pay: wallet ---

create or replace function public.pay_fund_link_from_wallet(
  p_slug text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  link public.fund_links;
  payer public.profiles;
  base_ref text;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  link := public.assert_fund_link_payable(p_slug, p_amount);

  if link.owner_id = caller then
    raise exception 'This is your own fund link';
  end if;

  select * into payer from public.profiles where id = caller;
  if coalesce(payer.coins, 0) < p_amount then
    raise exception 'Your wallet balance is too low';
  end if;

  -- One reference per leg: wallet_transactions has a unique index on
  -- reference, so the debit and the credit cannot share one.
  base_ref := 'fund_' || link.slug || '_' || replace(gen_random_uuid()::text, '-', '');

  perform public.wallet_apply(
    caller, 'debit', p_amount, 'fund_link',
    'Funded ' || coalesce((select coalesce(full_name, username) from public.profiles where id = link.owner_id), 'a member'),
    base_ref || ':out',
    jsonb_build_object('fund_link', link.slug, 'owner_id', link.owner_id)
  );

  perform public.wallet_apply(
    link.owner_id, 'credit', p_amount, 'fund_link',
    'Wallet funded by ' || coalesce(payer.full_name, payer.username, 'a member'),
    base_ref || ':in',
    jsonb_build_object('fund_link', link.slug, 'payer_id', caller)
  );

  insert into public.fund_link_payments
    (link_id, owner_id, payer_id, payer_label, amount, method, status, reference, paid_at)
  values
    (link.id, link.owner_id, caller, coalesce(payer.full_name, payer.username),
     p_amount, 'wallet', 'paid', base_ref, now());

  insert into public.notifications (profile_id, actor_id, type, content)
  values (link.owner_id, caller, 'system',
          coalesce(payer.full_name, payer.username, 'Someone')
          || ' funded your wallet with ' || p_amount);

  return jsonb_build_object('paid', true, 'amount', p_amount);
end;
$$;

grant execute on function public.pay_fund_link_from_wallet(text, numeric) to authenticated;

-- ----------------------------------------------------------- pay: gateway ---

-- Records the intent to pay by card, BEFORE checkout opens.
--
-- Callable by anon on purpose: the whole point of a fund link is that someone
-- without a Zero Club account can pay. This writes no money. It only says
-- "if Paystack later confirms this reference, the money belongs to this
-- wallet", which is exactly what credit_wallet_from_paystack reads.
create or replace function public.start_fund_link_topup(
  p_slug text,
  p_amount numeric,
  p_reference text,
  p_payer_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.fund_links;
begin
  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'A payment reference is required';
  end if;

  link := public.assert_fund_link_payable(p_slug, p_amount);

  -- profile_id is the LINK OWNER, not the payer. This single line is what
  -- makes the existing webhook credit the right wallet.
  insert into public.wallet_topups (profile_id, reference, amount, status)
  values (link.owner_id, p_reference, p_amount, 'pending')
  on conflict (reference) do nothing;

  insert into public.fund_link_payments
    (link_id, owner_id, payer_id, payer_label, amount, method, status, reference)
  values
    (link.id, link.owner_id, auth.uid(),
     nullif(btrim(coalesce(p_payer_label, '')), ''),
     p_amount, 'gateway', 'pending', p_reference)
  on conflict (reference) do nothing;

  return jsonb_build_object('reference', p_reference, 'amount', p_amount);
end;
$$;

grant execute on function public.start_fund_link_topup(text, numeric, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- the loop ---

-- When a top-up tied to a fund link succeeds, finish the payment row and tell
-- the owner. Sits on wallet_topups so it fires no matter which path confirmed
-- the payment — the browser callback or the webhook — and fires exactly once
-- because it only reacts to the transition into 'success'.
create or replace function public.complete_fund_link_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment public.fund_link_payments;
begin
  if new.status <> 'success' then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'success' then return null; end if;

  select * into payment from public.fund_link_payments where reference = new.reference;
  if payment.id is null or payment.status = 'paid' then return null; end if;

  update public.fund_link_payments
  set status = 'paid', amount = new.amount, paid_at = now()
  where id = payment.id;

  insert into public.notifications (profile_id, actor_id, type, content)
  values (payment.owner_id, coalesce(payment.payer_id, payment.owner_id), 'system',
          coalesce(payment.payer_label, 'Someone')
          || ' funded your wallet with ' || new.amount || ' through your fund link');

  return null;
end;
$$;

drop trigger if exists on_fund_link_topup_success on public.wallet_topups;
create trigger on_fund_link_topup_success
  after insert or update of status on public.wallet_topups
  for each row execute function public.complete_fund_link_payment();

notify pgrst, 'reload schema';
