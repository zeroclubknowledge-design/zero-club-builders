-- Club members already have a seat. Never charge them again, including
-- requests from older clients or a direct RPC call.
begin;

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
  ) or exists (
    select 1 from public.clubs club
    join public.club_members member on member.club_id = club.id
    where club.bootcamp_id = p_bootcamp_id and member.profile_id = caller
  ) then
    return jsonb_build_object('status', 'enrolled', 'enrolled', true, 'already', true, 'charged', 0);
  end if;

  select coalesce(tier, 'Basic') into learner_tier
  from public.profiles where id = caller for update;
  if not found then raise exception 'Your profile could not be found'; end if;

  if exists (
    select 1 from public.enrollments
    where bootcamp_id = p_bootcamp_id and profile_id = caller
  ) or exists (
    select 1 from public.clubs club
    join public.club_members member on member.club_id = club.id
    where club.bootcamp_id = p_bootcamp_id and member.profile_id = caller
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

notify pgrst, 'reload schema';
commit;
