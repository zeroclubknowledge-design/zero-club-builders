-- Wallet reliability: money paid always reaches the wallet, and is spendable.
--
-- Two problems this solves:
--   1. Crediting used to happen only when the browser came back after paying.
--      If the person closed the tab, lost signal, or the app crashed, Paystack
--      had taken their money but the wallet was never credited. A webhook now
--      credits independently of the browser, and both paths are idempotent.
--   2. The wallet history was rebuilt from notifications. There is now a real
--      ledger, so every credit and debit has a permanent, auditable record.

-- ---------------------------------------------------------------------------
-- 1. Ledger
-- ---------------------------------------------------------------------------

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric not null check (amount > 0),
  balance_after numeric,
  source text not null,               -- paystack, bootcamp, membership, gift, transfer, zero_form, refund
  description text,
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_transactions_profile_idx
  on public.wallet_transactions (profile_id, created_at desc);
create unique index if not exists wallet_transactions_reference_unique
  on public.wallet_transactions (reference) where reference is not null;

alter table public.wallet_transactions enable row level security;

drop policy if exists wallet_transactions_select_own on public.wallet_transactions;
create policy wallet_transactions_select_own
  on public.wallet_transactions for select to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. One place that moves money. Everything else calls this.
-- ---------------------------------------------------------------------------

create or replace function public.wallet_apply(
  p_profile_id uuid,
  p_direction text,
  p_amount numeric,
  p_source text,
  p_description text default null,
  p_reference text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid amount'; end if;
  if p_direction not in ('credit', 'debit') then raise exception 'Invalid direction'; end if;

  -- A reference that has already been recorded is ignored, so a retry or a
  -- duplicate webhook can never double-credit.
  if p_reference is not null and exists (
    select 1 from public.wallet_transactions where reference = p_reference
  ) then
    select coins into new_balance from public.profiles where id = p_profile_id;
    return new_balance;
  end if;

  if p_direction = 'credit' then
    update public.profiles set coins = coalesce(coins, 0) + p_amount
    where id = p_profile_id
    returning coins into new_balance;
  else
    -- Balance check and deduction happen in one statement, so two requests
    -- cannot both pass the check and overdraw the wallet.
    update public.profiles set coins = coins - p_amount
    where id = p_profile_id and coalesce(coins, 0) >= p_amount
    returning coins into new_balance;

    if new_balance is null then raise exception 'Insufficient wallet balance'; end if;
  end if;

  insert into public.wallet_transactions (
    profile_id, direction, amount, balance_after, source, description, reference, metadata
  ) values (
    p_profile_id, p_direction, p_amount, new_balance, p_source, p_description, p_reference, coalesce(p_metadata, '{}'::jsonb)
  );

  return new_balance;
end;
$$;

revoke all on function public.wallet_apply(uuid, text, numeric, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.wallet_apply(uuid, text, numeric, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Record who a payment belongs to *before* they pay, so the webhook can
--    credit the right wallet even if the browser never comes back.
-- ---------------------------------------------------------------------------

create or replace function public.start_wallet_topup(reference text, amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if amount is null or amount <= 0 then raise exception 'Invalid amount'; end if;

  insert into public.wallet_topups (profile_id, reference, amount, status)
  values (caller, reference, amount, 'pending')
  on conflict (reference) do nothing;

  return jsonb_build_object('reference', reference, 'amount', amount);
end;
$$;

grant execute on function public.start_wallet_topup(text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Crediting a verified Paystack payment.
--    Called by both the browser callback and the webhook; whichever arrives
--    first wins, and the second is ignored.
-- ---------------------------------------------------------------------------

create or replace function public.credit_wallet_from_paystack(
  p_profile_id uuid,
  p_reference text,
  p_amount numeric,
  p_currency text,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := p_profile_id;
  new_balance numeric;
  already boolean;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid payment amount'; end if;

  -- Trust the top-up we recorded before checkout over anything supplied now.
  select profile_id into target from public.wallet_topups where reference = p_reference;
  if target is null then target := p_profile_id; end if;
  if target is null then raise exception 'Could not identify the wallet for this payment'; end if;

  select (status = 'success') into already from public.wallet_topups where reference = p_reference;
  if coalesce(already, false) then
    select coins into new_balance from public.profiles where id = target;
    return jsonb_build_object('credited', false, 'reason', 'already_processed', 'balance', new_balance);
  end if;

  insert into public.wallet_topups (profile_id, reference, amount, currency, status, paystack_response, completed_at)
  values (target, p_reference, p_amount, coalesce(p_currency, 'NGN'), 'success', p_response, now())
  on conflict (reference) do update
    set status = 'success', paystack_response = excluded.paystack_response,
        amount = excluded.amount, completed_at = now();

  new_balance := public.wallet_apply(
    target, 'credit', p_amount, 'paystack',
    'Wallet funded with ' || coalesce(p_currency, 'NGN') || ' ' || p_amount,
    p_reference, p_response
  );

  insert into public.notifications (profile_id, actor_id, type, content)
  values (target, target, 'system',
          'Your wallet has been credited with ' || coalesce(p_currency, 'NGN') || ' ' || p_amount || '.');

  return jsonb_build_object('credited', true, 'balance', new_balance);
end;
$$;

revoke all on function public.credit_wallet_from_paystack(uuid, text, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.credit_wallet_from_paystack(uuid, text, numeric, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Wallet history straight from the ledger
-- ---------------------------------------------------------------------------

create or replace function public.get_my_wallet_history(limit_count integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  return jsonb_build_object(
    'balance', (select coalesce(coins, 0) from public.profiles where id = caller),
    'pending_topups', coalesce((
      select jsonb_agg(jsonb_build_object('reference', reference, 'amount', amount, 'created_at', created_at))
      from public.wallet_topups
      where profile_id = caller and status = 'pending' and created_at > now() - interval '2 hours'
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(row) order by row.created_at desc) from (
        select id, direction, amount, balance_after, source, description, reference, created_at
        from public.wallet_transactions
        where profile_id = caller
        order by created_at desc
        limit greatest(1, least(coalesce(limit_count, 50), 200))
      ) as row
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_my_wallet_history(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Backfill the ledger from top-ups that were already credited, so history
--    is complete for anyone who paid before this change.
-- ---------------------------------------------------------------------------

insert into public.wallet_transactions (profile_id, direction, amount, source, description, reference, created_at)
select topup.profile_id, 'credit', topup.amount, 'paystack',
       'Wallet funded with ' || coalesce(topup.currency, 'NGN') || ' ' || topup.amount,
       topup.reference, coalesce(topup.completed_at, topup.created_at)
from public.wallet_topups topup
where topup.status = 'success'
  and not exists (select 1 from public.wallet_transactions t where t.reference = topup.reference);

-- ---------------------------------------------------------------------------
-- 7. Live balance.
--    The app already listens for changes to the signed-in member's profile
--    row, so the balance updates on screen the moment money lands. That only
--    works if the table is published for realtime, which this guarantees.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception when others then
  raise notice 'Could not add profiles to the realtime publication: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
