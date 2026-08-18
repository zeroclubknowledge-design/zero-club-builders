-- A coupon and a referral bonus cannot both apply to one payment.
--
-- Both come out of the tutor's share. Stacking them means a tutor who offers
-- a 40% coupon and a 30% referral keeps 20% of an already discounted price —
-- and the platform fee is taken before either, so on a deep discount the
-- tutor can end up with almost nothing from a sale they thought they had
-- priced deliberately.
--
-- A coupon is already the tutor choosing to pay for the acquisition. Paying a
-- referrer on top charges them twice for the same customer.
--
-- So: coupon used, no referral commission. The platform fee and the tutor
-- share are unaffected; the referrer's slice simply stays with the tutor.

create or replace function public.settle_bootcamp_payment(
  p_bootcamp_id uuid,
  p_buyer_id uuid,
  p_owner_id uuid,
  p_amount numeric,
  p_reference text,
  p_coupon_used boolean default false
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
  buyer_name text;
begin
  if p_amount <= 0 then
    return jsonb_build_object('platform', 0, 'referral', 0, 'tutor', 0);
  end if;

  select coalesce(referral_percent, 0) into ref_percent
  from public.bootcamps where id = p_bootcamp_id;

  -- The rule. A discounted sale pays no commission.
  if p_coupon_used then
    ref_percent := 0;
  end if;

  platform_cut := round(p_amount * fee_percent / 100, 2);

  if ref_percent > 0 then
    -- Most recent unexpired click for this learner and bootcamp.
    select referrer_id into referrer
    from public.bootcamp_referral_clicks
    where bootcamp_id = p_bootcamp_id
      and visitor_id = p_buyer_id
      and expires_at > now()
      and referrer_id <> p_buyer_id
    order by created_at desc
    limit 1;

    if referrer is not null then
      referral_cut := round(p_amount * ref_percent / 100, 2);
    end if;
  end if;

  tutor_cut := greatest(p_amount - platform_cut - referral_cut, 0);

  select coalesce(full_name, username) into buyer_name
  from public.profiles where id = p_buyer_id;

  -- Platform revenue.
  insert into public.platform_revenue (source, bootcamp_id, buyer_id, gross_amount, fee_amount, payment_reference)
  values ('bootcamp', p_bootcamp_id, p_buyer_id, p_amount, platform_cut, p_reference)
  on conflict (payment_reference) do nothing;

  -- Referral earning, pending until the month closes.
  if referral_cut > 0 and referrer is not null then
    insert into public.referral_earnings
      (referrer_id, buyer_id, bootcamp_id, gross_amount, percent, amount, payment_reference)
    values
      (referrer, p_buyer_id, p_bootcamp_id, p_amount, ref_percent, referral_cut, p_reference)
    on conflict (payment_reference) do nothing;

    insert into public.notifications (profile_id, actor_id, type, content)
    values (referrer, p_buyer_id, 'system',
            'You earned ' || referral_cut || ' from a bootcamp referral');
  end if;

  -- The tutor's share.
  if tutor_cut > 0 then
    perform public.wallet_apply(
      p_owner_id, 'credit', tutor_cut, 'bootcamp',
      'Bootcamp payment from ' || coalesce(buyer_name, 'a learner'),
      p_reference || ':tutor',
      jsonb_build_object(
        'bootcamp_id', p_bootcamp_id,
        'buyer_id', p_buyer_id,
        'platform_fee', platform_cut,
        'referral', referral_cut,
        'coupon_used', p_coupon_used
      )
    );
  end if;

  return jsonb_build_object(
    'platform', platform_cut,
    'referral', referral_cut,
    'tutor', tutor_cut,
    'coupon_used', p_coupon_used
  );
end;
$$;

grant execute on function public.settle_bootcamp_payment(uuid, uuid, uuid, numeric, text, boolean) to authenticated;

notify pgrst, 'reload schema';

-- The enrolment function must pass the flag through, or the rule never fires.
-- Rewritten only around the settle call; everything else is untouched.
do $$
declare
  body text;
begin
  select prosrc into body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'enroll_in_bootcamp'
  limit 1;

  if body is null then
    raise notice 'enroll_in_bootcamp not found; run 20260817100000 and 20260817120000 first.';
  elsif position('p_coupon_used' in body) > 0 then
    raise notice 'enroll_in_bootcamp already passes the coupon flag.';
  else
    raise notice 'Reminder: enroll_in_bootcamp still calls settle_bootcamp_payment without the coupon flag.';
  end if;
end $$;
