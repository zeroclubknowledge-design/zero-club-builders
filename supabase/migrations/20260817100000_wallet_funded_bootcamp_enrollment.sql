-- Direct bootcamp enrollment is paid from the learner's Zero Club wallet.
--
-- The previous enroll_in_bootcamp function rejected every paid bootcamp and
-- left the app with the unhelpful "This bootcamp requires payment" message.
-- This replacement calculates the payable amount on the server, checks and
-- debits the wallet atomically, records the ledger entry, distributes the
-- payment through the existing platform/referral/tutor split, and only then
-- creates the enrollment.

drop function if exists public.enroll_in_bootcamp(uuid);

create or replace function public.enroll_in_bootcamp(
  p_bootcamp_id uuid,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  bootcamp public.bootcamps;
  learner_tier text;
  wallet_balance numeric := 0;
  balance_after numeric := 0;
  base_price numeric := 0;
  tier_discount numeric := 0;
  coupon_discount numeric := 0;
  payable numeric := 0;
  coupon_id uuid;
  payment_reference text;
  split jsonb;
begin
  if caller is null then raise exception 'Please sign in to enroll'; end if;

  select * into bootcamp
  from public.bootcamps
  where id = p_bootcamp_id;

  if bootcamp.id is null then raise exception 'That bootcamp does not exist'; end if;

  if exists (
    select 1 from public.enrollments
    where bootcamp_id = p_bootcamp_id and profile_id = caller
  ) then
    return jsonb_build_object(
      'status', 'enrolled',
      'enrolled', true,
      'already', true,
      'charged', 0
    );
  end if;

  -- Lock the learner's wallet row for the rest of this transaction. This
  -- prevents two simultaneous enrollments from both spending the same funds.
  select coalesce(coins, 0), coalesce(tier, 'Basic')
  into wallet_balance, learner_tier
  from public.profiles
  where id = caller
  for update;

  if not found then raise exception 'Your profile could not be found'; end if;

  -- Re-check after acquiring the wallet lock in case a concurrent request
  -- completed while this request was waiting.
  if exists (
    select 1 from public.enrollments
    where bootcamp_id = p_bootcamp_id and profile_id = caller
  ) then
    return jsonb_build_object(
      'status', 'enrolled',
      'enrolled', true,
      'already', true,
      'charged', 0,
      'balance', wallet_balance
    );
  end if;

  base_price := greatest(0, coalesce(bootcamp.price, 0));

  if lower(learner_tier) = 'premium' then
    tier_discount := 3;
  elsif lower(learner_tier) = 'premium+' then
    tier_discount := 5;
  end if;

  payable := round(base_price * (100 - tier_discount) / 100.0);

  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    select valid_coupon.id, valid_coupon.discount_percent
    into coupon_id, coupon_discount
    from public.validate_bootcamp_coupon(p_bootcamp_id, p_coupon_code) as valid_coupon;

    if coupon_id is null then
      raise exception 'This coupon is no longer valid';
    end if;

    coupon_discount := least(100, greatest(0, coalesce(coupon_discount, 0)));
    payable := round(payable * (100 - coupon_discount) / 100.0);
  end if;

  if wallet_balance < payable then
    return jsonb_build_object(
      'status', 'insufficient_funds',
      'amount', payable,
      'balance', wallet_balance,
      'shortfall', payable - wallet_balance
    );
  end if;

  -- Claim a limited coupon only after the learner has enough to complete the
  -- purchase. Any later failure rolls this redemption back with the payment.
  if coupon_id is not null and not public.redeem_bootcamp_coupon(coupon_id) then
    raise exception 'This coupon is no longer available';
  end if;

  if payable > 0 then
    payment_reference := 'bootcamp_' || replace(gen_random_uuid()::text, '-', '');

    balance_after := public.wallet_apply(
      caller,
      'debit',
      payable,
      'bootcamp',
      'Bootcamp enrollment: ' || bootcamp.title,
      payment_reference || ':buyer',
      jsonb_build_object(
        'bootcamp_id', p_bootcamp_id,
        'base_price', base_price,
        'tier_discount_percent', tier_discount,
        'coupon_discount_percent', coupon_discount
      )
    );

    split := public.settle_bootcamp_payment(
      p_bootcamp_id,
      caller,
      bootcamp.creator_id,
      payable,
      payment_reference
    );
  else
    balance_after := wallet_balance;
    split := jsonb_build_object('platform', 0, 'referral', 0, 'tutor', 0);
  end if;

  insert into public.enrollments (bootcamp_id, profile_id)
  values (p_bootcamp_id, caller);

  insert into public.notifications (profile_id, actor_id, type, content)
  values (
    bootcamp.creator_id,
    caller,
    'system',
    coalesce(
      (select coalesce(full_name, username) from public.profiles where id = caller),
      'Someone'
    ) || ' enrolled in ' || bootcamp.title
  );

  return jsonb_build_object(
    'status', 'enrolled',
    'enrolled', true,
    'already', false,
    'charged', payable,
    'balance', balance_after,
    'split', split
  );
end;
$$;

revoke all on function public.enroll_in_bootcamp(uuid, text) from public, anon;
grant execute on function public.enroll_in_bootcamp(uuid, text) to authenticated;

notify pgrst, 'reload schema';
