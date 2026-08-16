-- Earned money and topped-up money are not the same money.
--
-- A Zero Club balance has two origins:
--
--   Earned   referral commission, Zero Store sales, bootcamp revenue. This is
--            proof of work turned into income, and it is the money a member
--            has a real claim to take out.
--
--   Funded   a card top-up, or someone else paying into a fund link. This is
--            float. It came in to be spent on the platform, and paying it back
--            out to a bank account is a refund, not a withdrawal.
--
-- Keeping them apart is not bookkeeping fussiness. Card in, bank out is the
-- oldest laundering route there is: top up with a stolen card, withdraw to
-- your own account, and the chargeback lands on Zero Club weeks later — the
-- deposit is clawed back and the payout is gone. Fund links make it neater
-- still, because the card and the bank account need not belong to one person.
--
-- So withdrawals are limited to what was earned. Nothing here moves money; it
-- only answers "how much of this balance came from work".

-- Sources that represent income to the member. Anything not in this list is
-- treated as float, which is the safe default for a source added later.
create or replace function public.earning_wallet_sources()
returns text[]
language sql
immutable
as $$ select array['referral', 'store', 'bootcamp', 'zero_form']::text[] $$;

create or replace function public.get_withdrawable_balance(p_profile_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_profile_id, auth.uid());
  total numeric := 0;
  earned numeric := 0;
  withdrawn numeric := 0;
  available numeric := 0;
begin
  if target is null then raise exception 'Not authenticated'; end if;
  -- Only ever your own figures.
  if target <> auth.uid() then raise exception 'Not allowed'; end if;

  select coalesce(coins, 0) into total from public.profiles where id = target;

  -- Credits from work.
  select coalesce(sum(amount), 0) into earned
  from public.wallet_transactions
  where profile_id = target
    and direction = 'credit'
    and source = any(public.earning_wallet_sources());

  -- Everything already taken out, plus anything spent from the earned pot.
  -- Debits are not tagged by which pot they came from, so the conservative
  -- reading is that spending draws down earnings first. That can only ever
  -- understate what is withdrawable, never overstate it.
  select coalesce(sum(amount), 0) into withdrawn
  from public.wallet_transactions
  where profile_id = target
    and direction = 'debit'
    and source in ('withdrawal', 'refund');

  available := greatest(earned - withdrawn, 0);

  -- Never offer more than is actually in the wallet: someone can earn and then
  -- spend it on a bootcamp, and the earned total alone would still show it.
  available := least(available, total);

  return jsonb_build_object(
    'balance', total,
    'earned', earned,
    'withdrawn', withdrawn,
    'withdrawable', available
  );
end;
$$;

grant execute on function public.get_withdrawable_balance(uuid) to authenticated;

comment on function public.get_withdrawable_balance(uuid) is
  'Splits a wallet into total balance and the part that came from earnings. '
  'Withdrawals should be limited to the withdrawable figure.';

notify pgrst, 'reload schema';
