-- Paystack wallet top-ups.
-- Payments are verified server-side by the `paystack-verify` Edge Function,
-- which is the only thing allowed to credit a wallet.

create table if not exists public.wallet_topups (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null unique,
  amount numeric not null check (amount > 0),
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  paystack_response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists wallet_topups_profile_idx on public.wallet_topups (profile_id, created_at desc);

alter table public.wallet_topups enable row level security;

-- Members can see their own top-up history; nobody can write from the browser.
drop policy if exists wallet_topups_select_own on public.wallet_topups;
create policy wallet_topups_select_own
  on public.wallet_topups for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());

-- Credits a wallet exactly once for a given Paystack reference.
-- Called by the Edge Function using the service role key.
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
  already_done boolean;
  new_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payment amount';
  end if;

  -- Idempotency: a reference that already succeeded must never credit twice.
  select true into already_done
  from public.wallet_topups
  where reference = p_reference and status = 'success';

  if already_done then
    select coins into new_balance from public.profiles where id = p_profile_id;
    return jsonb_build_object('credited', false, 'reason', 'already_processed', 'balance', new_balance);
  end if;

  insert into public.wallet_topups (profile_id, reference, amount, currency, status, paystack_response, completed_at)
  values (p_profile_id, p_reference, p_amount, coalesce(p_currency, 'NGN'), 'success', p_response, now())
  on conflict (reference) do update
    set status = 'success', paystack_response = excluded.paystack_response,
        amount = excluded.amount, completed_at = now();

  update public.profiles
  set coins = coalesce(coins, 0) + p_amount
  where id = p_profile_id
  returning coins into new_balance;

  insert into public.notifications (profile_id, actor_id, type, content)
  values (p_profile_id, p_profile_id, 'system',
          'Wallet funded with ' || p_amount || ' ' || coalesce(p_currency, 'NGN'));

  return jsonb_build_object('credited', true, 'balance', new_balance);
end;
$$;

revoke all on function public.credit_wallet_from_paystack(uuid, text, numeric, text, jsonb) from public;
revoke all on function public.credit_wallet_from_paystack(uuid, text, numeric, text, jsonb) from authenticated;
grant execute on function public.credit_wallet_from_paystack(uuid, text, numeric, text, jsonb) to service_role;

notify pgrst, 'reload schema';
