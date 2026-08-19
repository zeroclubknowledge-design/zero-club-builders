-- ZP becomes money that can be spent.
--
-- The rate is fixed and public: 1000 ZP = ₦100, which is 10 ZP to the naira.
-- It lives in a function rather than in application code so that the browser
-- can never be the thing that decides what a point is worth.
--
-- Direction is deliberately one-way. ZP converts into wallet balance; wallet
-- balance never converts back into ZP. Points are issued by the platform for
-- playing, referring and taking part, so a two-way door would let anyone mint
-- points with a card and hand them to another account as if they had earned
-- them.
--
-- The credit is written with source 'zp', which is not in
-- earning_wallet_sources(), so converted points are spendable anywhere on Zero
-- Club but never withdrawable to a bank account. That is the whole point of
-- the earned/funded split: rewards are for using the platform, not a payout
-- channel. Anyone converting a large balance and expecting to cash it out
-- would otherwise be turning game rewards into money Zero Club has to find.

create or replace function public.zp_per_naira()
returns numeric
language sql
immutable
as $$ select 10::numeric $$;

create or replace function public.redeem_zp_to_wallet(p_zp integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  rate numeric := public.zp_per_naira();
  credit_amount numeric;
  zp_used integer;
  new_balance numeric;
  reference text;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if p_zp is null or p_zp <= 0 then raise exception 'Enter a valid ZP amount'; end if;

  -- Convert whole naira only, and take just the points that paid for them.
  -- Redeeming 155 ZP gives ₦15 and leaves 5 ZP behind rather than quietly
  -- swallowing the remainder.
  credit_amount := floor(p_zp / rate);
  if credit_amount < 1 then
    raise exception 'You need at least % ZP to convert', rate::integer;
  end if;
  zp_used := (credit_amount * rate)::integer;

  -- One statement, so a double tap cannot spend the same points twice: the
  -- balance check and the deduction happen under the same row lock.
  update public.profiles
  set zp = zp - zp_used
  where id = caller and coalesce(zp, 0) >= zp_used;

  if not found then
    raise exception 'You do not have enough ZP for that';
  end if;

  reference := 'zp:' || gen_random_uuid()::text;

  new_balance := public.wallet_apply(
    caller,
    'credit',
    credit_amount,
    'zp',
    'Converted ' || zp_used || ' ZP',
    reference,
    jsonb_build_object('zp_used', zp_used, 'rate', rate)
  );

  return jsonb_build_object(
    'zp_used', zp_used,
    'credited', credit_amount,
    'balance', new_balance,
    'reference', reference
  );
end;
$$;

grant execute on function public.zp_per_naira() to authenticated, anon;
grant execute on function public.redeem_zp_to_wallet(integer) to authenticated;

-- Plain English for the ledger row, so the transaction detail page does not
-- fall back to showing the raw source string.
comment on function public.redeem_zp_to_wallet(integer) is
  'Converts ZP into spendable (non-withdrawable) wallet balance at zp_per_naira().';

notify pgrst, 'reload schema';

-- A converted-ZP credit must never count as an earning, or it becomes
-- withdrawable and the one-way door is pointless. This restates the list
-- rather than assuming: if a later migration widened it, this makes the
-- omission of 'zp' explicit.
create or replace function public.earning_wallet_sources()
returns text[]
language sql
immutable
as $$ select array['referral', 'store', 'bootcamp', 'zero_form']::text[] $$;
