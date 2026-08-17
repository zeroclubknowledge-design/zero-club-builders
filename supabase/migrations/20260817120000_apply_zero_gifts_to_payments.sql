-- Apply restricted Zero Gifts at the matching checkout.

-- One internal funding primitive for every cash service payment. It applies
-- restricted gift value first when requested, then charges only the remainder
-- to the member's ordinary wallet.
create or replace function public.fund_zero_service_payment(
  p_profile_id uuid,
  p_service text,
  p_total numeric,
  p_apply_gift boolean,
  p_source text,
  p_description text,
  p_reference text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric := greatest(0, coalesce(p_total, 0));
  wallet_balance numeric := 0;
  balance_after numeric := 0;
  gift_available numeric := 0;
  gift_to_use numeric := 0;
  gift_used numeric := 0;
  wallet_due numeric := 0;
begin
  select coalesce(coins, 0) into wallet_balance
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then raise exception 'Profile not found'; end if;

  if coalesce(p_apply_gift, false) then
    gift_available := public.zero_gift_balance_for(p_profile_id, p_service);
    gift_to_use := least(total, gift_available);
  end if;

  wallet_due := total - gift_to_use;

  if wallet_balance < wallet_due then
    return jsonb_build_object(
      'status', 'insufficient_funds',
      'amount', total,
      'gift_available', gift_available,
      'gift_applied', gift_to_use,
      'wallet_due', wallet_due,
      'balance', wallet_balance,
      'shortfall', wallet_due - wallet_balance
    );
  end if;

  if gift_to_use > 0 then
    gift_used := public.consume_zero_gift(
      p_profile_id,
      p_service,
      gift_to_use,
      p_reference,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', p_source)
    );

    -- Every integrated checkout locks the member's wallet before looking at
    -- gifts, so this can only differ if the gift data is corrupt. Raising rolls
    -- the whole payment back instead of silently charging the wallet more.
    if gift_used <> gift_to_use then
      raise exception 'Zero Gift balance changed. Please try again';
    end if;
  end if;

  wallet_due := total - gift_used;
  if wallet_due > 0 then
    balance_after := public.wallet_apply(
      p_profile_id,
      'debit',
      wallet_due,
      p_source,
      p_description,
      p_reference || ':wallet',
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'zero_gift_applied', gift_used,
        'total_price', total
      )
    );
  else
    balance_after := wallet_balance;
  end if;

  return jsonb_build_object(
    'status', 'paid',
    'amount', total,
    'gift_applied', gift_used,
    'wallet_charged', wallet_due,
    'balance', balance_after
  );
end;
$$;

revoke all on function public.fund_zero_service_payment(
  uuid, text, numeric, boolean, text, text, text, jsonb
) from public, anon, authenticated;

-- -------------------------------------------------------------- bootcamps ---

drop function if exists public.enroll_in_bootcamp(uuid);
drop function if exists public.enroll_in_bootcamp(uuid, text);

create or replace function public.enroll_in_bootcamp(
  p_bootcamp_id uuid,
  p_coupon_code text default null,
  p_apply_gift boolean default false
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
  base_price numeric := 0;
  tier_discount numeric := 0;
  coupon_discount numeric := 0;
  payable numeric := 0;
  coupon_id uuid;
  payment_reference text;
  payment jsonb;
  split jsonb;
begin
  if caller is null then raise exception 'Please sign in to enroll'; end if;

  select * into bootcamp from public.bootcamps where id = p_bootcamp_id;
  if bootcamp.id is null then raise exception 'That bootcamp does not exist'; end if;

  if exists (
    select 1 from public.enrollments
    where bootcamp_id = p_bootcamp_id and profile_id = caller
  ) then
    return jsonb_build_object('status', 'enrolled', 'enrolled', true, 'already', true, 'charged', 0);
  end if;

  select coalesce(tier, 'Basic') into learner_tier
  from public.profiles where id = caller for update;
  if not found then raise exception 'Your profile could not be found'; end if;

  if exists (
    select 1 from public.enrollments
    where bootcamp_id = p_bootcamp_id and profile_id = caller
  ) then
    return jsonb_build_object('status', 'enrolled', 'enrolled', true, 'already', true, 'charged', 0);
  end if;

  base_price := greatest(0, coalesce(bootcamp.price, 0));
  if lower(learner_tier) = 'premium' then tier_discount := 3;
  elsif lower(learner_tier) = 'premium+' then tier_discount := 5;
  end if;

  payable := round(base_price * (100 - tier_discount) / 100.0);

  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    select valid_coupon.id, valid_coupon.discount_percent
    into coupon_id, coupon_discount
    from public.validate_bootcamp_coupon(p_bootcamp_id, p_coupon_code) as valid_coupon;

    if coupon_id is null then raise exception 'This coupon is no longer valid'; end if;
    coupon_discount := least(100, greatest(0, coalesce(coupon_discount, 0)));
    payable := round(payable * (100 - coupon_discount) / 100.0);
  end if;

  payment_reference := 'bootcamp_' || replace(gen_random_uuid()::text, '-', '');
  payment := public.fund_zero_service_payment(
    caller,
    'bootcamps',
    payable,
    p_apply_gift,
    'bootcamp',
    'Bootcamp enrollment: ' || bootcamp.title,
    payment_reference,
    jsonb_build_object(
      'bootcamp_id', p_bootcamp_id,
      'base_price', base_price,
      'tier_discount_percent', tier_discount,
      'coupon_discount_percent', coupon_discount
    )
  );

  if payment ->> 'status' = 'insufficient_funds' then return payment; end if;

  if coupon_id is not null and not public.redeem_bootcamp_coupon(coupon_id) then
    raise exception 'This coupon is no longer available';
  end if;

  if payable > 0 then
    split := public.settle_bootcamp_payment(
      p_bootcamp_id, caller, bootcamp.creator_id, payable, payment_reference
    );
  else
    split := jsonb_build_object('platform', 0, 'referral', 0, 'tutor', 0);
  end if;

  insert into public.enrollments (bootcamp_id, profile_id)
  values (p_bootcamp_id, caller);

  insert into public.notifications (profile_id, actor_id, type, content)
  values (
    bootcamp.creator_id,
    caller,
    'system',
    coalesce((select coalesce(full_name, username) from public.profiles where id = caller), 'Someone')
      || ' enrolled in ' || bootcamp.title
  );

  return payment || jsonb_build_object(
    'status', 'enrolled',
    'enrolled', true,
    'already', false,
    'charged', payable,
    'split', split
  );
end;
$$;

revoke all on function public.enroll_in_bootcamp(uuid, text, boolean) from public, anon;
grant execute on function public.enroll_in_bootcamp(uuid, text, boolean) to authenticated;

-- ------------------------------------------------------------- membership ---

drop function if exists public.activate_membership(text, boolean);

create or replace function public.activate_membership(
  requested_plan text,
  enable_auto_renew boolean default false,
  p_apply_gift boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  profile_row public.profiles;
  plan_row public.subscription_plans;
  period_end timestamptz;
  new_subscription public.subscriptions;
  payment_reference text;
  payment jsonb;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  select * into profile_row from public.profiles where id = caller for update;
  select * into plan_row from public.subscription_plans where key = requested_plan and active = true;
  if plan_row.key is null then raise exception 'That membership plan is unavailable'; end if;
  if plan_row.billing_interval in ('free', 'custom') then raise exception 'Use the appropriate onboarding or downgrade flow for this plan'; end if;
  if plan_row.price_amount is null then raise exception 'Pricing for this plan has not been configured'; end if;
  if plan_row.audience = 'tutor' and lower(coalesce(profile_row.account_type, '')) <> 'tutor' then raise exception 'This plan is for Tutor accounts'; end if;
  if plan_row.audience in ('learner', 'creator') and lower(coalesce(profile_row.account_type, 'learner')) not in ('learner', 'builder', 'user') then raise exception 'This plan is for Learner accounts'; end if;

  payment_reference := 'membership_' || replace(gen_random_uuid()::text, '-', '');
  payment := public.fund_zero_service_payment(
    caller,
    'membership',
    plan_row.price_amount,
    p_apply_gift,
    'membership',
    plan_row.name || ' membership',
    payment_reference,
    jsonb_build_object('plan_key', requested_plan)
  );
  if payment ->> 'status' = 'insufficient_funds' then return payment; end if;

  period_end := case when plan_row.billing_interval = 'year'
    then now() + interval '1 year' else now() + interval '1 month' end;

  update public.subscriptions
  set status = 'cancelled', cancelled_at = now(), auto_renew = false, updated_at = now()
  where profile_id = caller and status in ('active', 'past_due', 'grace_period');

  update public.profiles
  set tier = case requested_plan
    when 'creator' then 'Creator'
    when 'tutor_premium_plus' then 'Premium+'
    else 'Premium'
  end
  where id = caller;

  insert into public.subscriptions (
    profile_id, plan_key, status, current_period_start, current_period_end,
    renewal_date, auto_renew, amount_paid, currency
  ) values (
    caller, requested_plan, 'active', now(), period_end, period_end,
    enable_auto_renew, plan_row.price_amount, plan_row.currency
  ) returning * into new_subscription;

  perform public.refresh_owned_club_continuity(caller);
  return payment || jsonb_build_object(
    'status', 'active',
    'subscription', to_jsonb(new_subscription),
    'club_capacity', public.get_my_club_capacity()
  );
end;
$$;

drop function if exists public.renew_my_membership();

create or replace function public.renew_my_membership(p_apply_gift boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  current_sub public.subscriptions;
  plan_row public.subscription_plans;
  next_end timestamptz;
  payment_reference text;
  payment jsonb;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  select * into current_sub
  from public.subscriptions
  where profile_id = caller
  order by created_at desc limit 1 for update;
  if current_sub.id is null then raise exception 'No membership is available to renew'; end if;

  select * into plan_row from public.subscription_plans where key = current_sub.plan_key;
  if plan_row.price_amount is null or plan_row.price_amount <= 0 then raise exception 'This plan cannot be renewed here'; end if;

  payment_reference := 'membership_renewal_' || replace(gen_random_uuid()::text, '-', '');
  payment := public.fund_zero_service_payment(
    caller, 'membership', plan_row.price_amount, p_apply_gift,
    'membership', plan_row.name || ' membership renewal', payment_reference,
    jsonb_build_object('plan_key', current_sub.plan_key, 'subscription_id', current_sub.id)
  );
  if payment ->> 'status' = 'insufficient_funds' then return payment; end if;

  next_end := greatest(coalesce(current_sub.current_period_end, now()), now())
    + case when plan_row.billing_interval = 'year' then interval '1 year' else interval '1 month' end;

  update public.subscriptions
  set status = 'active', current_period_start = now(), current_period_end = next_end,
      renewal_date = next_end, grace_period_end = null, cancelled_at = null,
      amount_paid = amount_paid + plan_row.price_amount, updated_at = now()
  where id = current_sub.id
  returning * into current_sub;

  perform public.refresh_owned_club_continuity(caller);
  return payment || jsonb_build_object('status', 'active', 'subscription', to_jsonb(current_sub));
end;
$$;

revoke all on function public.activate_membership(text, boolean, boolean) from public, anon;
grant execute on function public.activate_membership(text, boolean, boolean) to authenticated;
revoke all on function public.renew_my_membership(boolean) from public, anon;
grant execute on function public.renew_my_membership(boolean) to authenticated;

-- ----------------------------------------------- institutional membership ---

drop function if exists public.activate_digital_hub();

create or replace function public.activate_digital_hub(p_apply_gift boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  app public.institution_applications;
  price numeric;
  payment_reference text;
  payment jsonb;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  select * into app from public.institution_applications where profile_id = caller for update;
  if app.id is null then raise exception 'Complete the Digital Hub form first'; end if;

  price := public.digital_hub_price(app.plan);
  payment_reference := 'digital_hub_' || replace(gen_random_uuid()::text, '-', '');
  payment := public.fund_zero_service_payment(
    caller, 'membership', price, p_apply_gift,
    'membership', 'Digital Hub membership', payment_reference,
    jsonb_build_object('institution_application_id', app.id, 'plan', app.plan)
  );
  if payment ->> 'status' = 'insufficient_funds' then return payment; end if;

  update public.institution_applications
  set status = 'active',
      activated_at = now(),
      active_until = greatest(coalesce(active_until, now()), now()) + interval '12 months',
      updated_at = now()
  where profile_id = caller
  returning * into app;

  insert into public.notifications (profile_id, actor_id, type, content)
  values (caller, caller, 'system', 'Digital Hub activated for 12 months');

  return payment || jsonb_build_object(
    'status', 'active', 'activated', true,
    'active_until', app.active_until, 'charged', price
  );
end;
$$;

revoke all on function public.activate_digital_hub(boolean) from public, anon;
grant execute on function public.activate_digital_hub(boolean) to authenticated;

-- -------------------------------------------------------------- Zero Store ---

drop function if exists public.purchase_store_item(uuid);
drop function if exists public.purchase_store_item(uuid, text);

create or replace function public.purchase_store_item(
  item_id uuid,
  coupon text default null,
  p_apply_gift boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.store_items%rowtype;
  buyer public.profiles%rowtype;
  effective_price numeric;
  coupon_applied boolean := false;
  payment_reference text;
  payment jsonb := jsonb_build_object('gift_applied', 0, 'wallet_charged', 0);
begin
  select * into item from public.store_items where id = item_id;
  if not found then raise exception 'Item not found'; end if;

  select * into buyer from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Not authenticated'; end if;
  if buyer.id = item.seller_id then raise exception 'You cannot buy your own product'; end if;

  effective_price := item.price;
  if coalesce(item.discount_percent, 0) > 0 then
    effective_price := round(effective_price * (100 - item.discount_percent) / 100);
  end if;
  if coupon is not null
    and item.coupon_code is not null
    and upper(trim(coupon)) = upper(item.coupon_code)
    and coalesce(item.coupon_discount_percent, 0) > 0
  then
    effective_price := round(effective_price * (100 - item.coupon_discount_percent) / 100);
    coupon_applied := true;
  end if;

  payment_reference := 'store_' || replace(gen_random_uuid()::text, '-', '');

  if item.price_type = 'ZP' then
    if coalesce(buyer.zp, 0) < effective_price then raise exception 'Not enough ZP'; end if;
    update public.profiles set zp = zp - effective_price where id = buyer.id;
    update public.profiles set zp = coalesce(zp, 0) + effective_price where id = item.seller_id;
    payment := jsonb_build_object(
      'status', 'paid', 'gift_applied', 0,
      'wallet_charged', 0, 'zp_charged', effective_price
    );
  elsif item.price_type = 'Coins' then
    payment := public.fund_zero_service_payment(
      buyer.id, 'zero-store', effective_price, p_apply_gift,
      'store', 'Zero Store purchase: ' || item.name, payment_reference,
      jsonb_build_object('item_id', item.id, 'seller_id', item.seller_id)
    );
    if payment ->> 'status' = 'insufficient_funds' then return payment; end if;

    if effective_price > 0 then
      perform public.wallet_apply(
        item.seller_id, 'credit', effective_price, 'store',
        'Zero Store sale: ' || item.name, payment_reference || ':seller',
        jsonb_build_object('item_id', item.id, 'buyer_id', buyer.id)
      );
    end if;
  else
    raise exception 'Unsupported payment type';
  end if;

  return payment || jsonb_build_object(
    'success', true,
    'file_url', item.file_url,
    'paid', effective_price,
    'coupon_applied', coupon_applied
  );
end;
$$;

revoke all on function public.purchase_store_item(uuid, text, boolean) from public, anon;
grant execute on function public.purchase_store_item(uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
