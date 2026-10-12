-- Admin-funded membership gifts. Claim deadlines use database time; clients
-- cannot grant themselves a plan or claim another member's gift.
create table public.membership_gifts (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  plan_key text not null references public.subscription_plans(key),
  duration_days integer not null check (duration_days between 1 and 366),
  claim_deadline timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'expired')),
  claimed_at timestamptz,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index membership_gifts_recipient_idx on public.membership_gifts(recipient_id, created_at desc);
alter table public.membership_gifts enable row level security;
revoke all on public.membership_gifts from anon, authenticated;
grant select on public.membership_gifts to authenticated;
create policy membership_gifts_read on public.membership_gifts for select to authenticated
using (recipient_id = auth.uid() or public.is_zero_club_admin());
alter table public.notifications add column membership_gift_id uuid references public.membership_gifts(id) on delete cascade;

create function public.admin_gift_membership(p_username text, p_plan_key text, p_duration_days integer, p_claim_deadline timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare recipient public.profiles; plan public.subscription_plans; gift public.membership_gifts;
begin
  if not coalesce(public.is_zero_club_admin(), false) then raise exception 'Only Zero Club admins can gift memberships'; end if;
  if p_duration_days is null or p_duration_days not between 1 and 366 then raise exception 'Choose a subscription length between 1 and 366 days'; end if;
  if p_claim_deadline is null or p_claim_deadline <= now() or p_claim_deadline > now() + interval '1 year' then raise exception 'Choose a future claim deadline within one year'; end if;
  select * into recipient from public.profiles where lower(username) = lower(ltrim(btrim(p_username), '@'));
  if recipient.id is null then raise exception 'No user has that username'; end if;
  if recipient.account_status <> 'active' then raise exception 'This account is not active'; end if;
  select * into plan from public.subscription_plans where key = p_plan_key and active and billing_interval in ('month', 'year') and price_amount > 0;
  if plan.key is null then raise exception 'Choose an available paid membership plan'; end if;
  if (plan.audience = 'institution' and lower(recipient.account_type) <> 'institution')
    or (plan.audience = 'tutor' and not (lower(recipient.account_type) = 'tutor' or coalesce(recipient.tutor_enabled, false)))
    or (plan.audience in ('learner', 'creator') and lower(recipient.account_type) not in ('learner', 'builder', 'user', 'creator')) then
    raise exception 'This plan does not match the recipient account';
  end if;
  insert into public.membership_gifts(admin_id, recipient_id, plan_key, duration_days, claim_deadline)
  values(auth.uid(), recipient.id, plan.key, p_duration_days, p_claim_deadline) returning * into gift;
  insert into public.notifications(recipient_id, actor_id, type, entity_id, content, membership_gift_id)
  values(recipient.id, auth.uid(), 'system', gift.id,
    'Zero Club gifted you ' || p_duration_days || ' days of ' || plan.name || '. Open Membership to claim before the deadline.', gift.id);
  insert into public.admin_audit_logs(admin_id, action, target_type, target_id, details)
  values(auth.uid(), 'gift_membership', 'membership_gift', gift.id, to_jsonb(gift));
  return to_jsonb(gift) || jsonb_build_object('username', recipient.username, 'plan_name', plan.name);
end $$;

create function public.claim_membership_gift(p_gift_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); recipient public.profiles; gift public.membership_gifts;
  plan public.subscription_plans; current_sub public.subscriptions; benefit_end timestamptz;
begin
  if caller is null then raise exception 'Please sign in to claim your gift'; end if;
  -- Serializes claims for this member, including simultaneous different gifts.
  select * into recipient from public.profiles where id = caller for update;
  if recipient.id is null or recipient.account_status <> 'active' then raise exception 'This account is not active'; end if;
  select * into gift from public.membership_gifts where id = p_gift_id and recipient_id = caller for update;
  if gift.id is null then raise exception 'Gift not found for this account'; end if;
  if gift.status = 'claimed' then return jsonb_build_object('status', 'already_claimed', 'subscription_id', gift.subscription_id); end if;
  if gift.status = 'expired' or gift.claim_deadline <= now() then
    update public.membership_gifts set status = 'expired' where id = gift.id;
    return jsonb_build_object('status', 'expired');
  end if;
  select * into plan from public.subscription_plans where key = gift.plan_key and active;
  if plan.key is null then raise exception 'This membership plan is no longer available'; end if;
  if (plan.audience = 'institution' and lower(recipient.account_type) <> 'institution')
    or (plan.audience = 'tutor' and not (lower(recipient.account_type) = 'tutor' or coalesce(recipient.tutor_enabled, false)))
    or (plan.audience in ('learner', 'creator') and lower(recipient.account_type) not in ('learner', 'builder', 'user', 'creator')) then
    raise exception 'This plan no longer matches your account';
  end if;
  select * into current_sub from public.subscriptions
  where profile_id = caller and status in ('active', 'past_due', 'grace_period') for update;
  if current_sub.id is not null and current_sub.plan_key <> gift.plan_key
    and (current_sub.current_period_end is null or current_sub.current_period_end > now()
      or (current_sub.status = 'grace_period' and current_sub.grace_period_end > now())) then
    raise exception 'You have a different active plan. This gift will not replace it';
  end if;
  benefit_end := now() + make_interval(days => gift.duration_days);
  if current_sub.id is not null and current_sub.plan_key = gift.plan_key then
    if current_sub.current_period_end is null then raise exception 'Your existing plan has no end date and does not need extending'; end if;
    benefit_end := greatest(current_sub.current_period_end, now()) + make_interval(days => gift.duration_days);
    update public.subscriptions set status = 'active', current_period_end = benefit_end, renewal_date = benefit_end,
      grace_period_end = null, updated_at = now(), metadata = metadata || jsonb_build_object('last_membership_gift', gift.id)
    where id = current_sub.id returning * into current_sub;
  else
    update public.subscriptions set status = 'expired', auto_renew = false, updated_at = now()
    where profile_id = caller and status in ('active', 'past_due', 'grace_period');
    insert into public.subscriptions(profile_id, plan_key, status, current_period_start, current_period_end, renewal_date, auto_renew, amount_paid, currency, metadata)
    values(caller, gift.plan_key, 'active', now(), benefit_end, benefit_end, false, 0, plan.currency,
      jsonb_build_object('membership_gift', gift.id, 'gifted_by', gift.admin_id)) returning * into current_sub;
  end if;
  update public.profiles set tier = case gift.plan_key when 'creator' then 'Creator' when 'tutor_premium_plus' then 'Premium+' else 'Premium' end where id = caller;
  update public.membership_gifts set status = 'claimed', claimed_at = now(), subscription_id = current_sub.id where id = gift.id;
  perform public.refresh_owned_club_continuity(caller);
  return jsonb_build_object('status', 'claimed', 'subscription', to_jsonb(current_sub));
end $$;
revoke all on function public.admin_gift_membership(text, text, integer, timestamptz) from public, anon;
revoke all on function public.claim_membership_gift(uuid) from public, anon;
grant execute on function public.admin_gift_membership(text, text, integer, timestamptz) to authenticated;
grant execute on function public.claim_membership_gift(uuid) to authenticated;
