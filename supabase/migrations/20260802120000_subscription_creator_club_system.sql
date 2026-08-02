-- Zero Club subscription, Creator, and Club system.
-- Backward-compatible: existing users, clubs, members, and bootcamp links are preserved.

-- Creator is a plan for learner accounts, not a new account type.
alter table public.profiles drop constraint if exists profiles_tier_check;
alter table public.profiles
  add column if not exists first_club_benefit_redeemed boolean not null default false,
  add column if not exists first_club_benefit_started_at timestamptz,
  add column if not exists first_club_benefit_expires_at timestamptz;

create table if not exists public.subscription_plans (
  key text primary key,
  name text not null,
  audience text not null check (audience in ('learner', 'creator', 'tutor', 'institution')),
  price_amount numeric,
  currency text not null default 'NGN',
  billing_interval text not null check (billing_interval in ('free', 'month', 'year', 'custom')),
  permanent_club_limit integer,
  active boolean not null default true,
  features jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (key, name, audience, price_amount, currency, billing_interval, permanent_club_limit, features, metadata)
values
  ('learner_basic', 'Learner Basic', 'learner', 0, 'NGN', 'free', 0,
   '["Builder profile","Feed","Public Club participation","ZeroNotes","Zero AI starter","2 rewarded Zero Games competitions weekly","Standard XP"]'::jsonb, '{}'::jsonb),
  ('learner_premium', 'Learner Premium', 'learner', 3000, 'NGN', 'month', 0,
   '["Everything in Learner Basic","Zero AI learning assistant","5 rewarded Zero Games competitions weekly","2x daily XP","3% Bootcamp discount","Post editing","Longer posts","Private Club access","Premium badge"]'::jsonb, '{}'::jsonb),
  ('creator', 'Creator', 'creator', 7000, 'NGN', 'month', 3,
   '["Learner Premium experience","12 rewarded Zero Games competitions weekly, maximum 2 daily","Create and manage permanent Clubs","Club customization","Member management","Moderation","Club analytics","Community insights","Creator Rewards eligibility"]'::jsonb,
   '{"first_club_premium_months":6}'::jsonb),
  ('tutor_basic', 'Tutor Basic', 'tutor', 0, 'NGN', 'free', 1,
   '["Create and sell Bootcamps","3 rewarded Zero Games competitions weekly","Temporary cohort Club per Bootcamp","Curriculum and learner management","Pricing and coupons","One permanent Club"]'::jsonb, '{}'::jsonb),
  ('tutor_premium', 'Tutor Premium', 'tutor', 5000, 'NGN', 'month', 5,
   '["Everything in Tutor Basic","8 rewarded Zero Games competitions weekly, maximum 2 daily","Five permanent Clubs","Connect Bootcamps to existing Clubs","Zero AI knowledge interview","Approved Bootcamp verification","Tutor AI"]'::jsonb, '{}'::jsonb),
  ('tutor_premium_plus', 'Tutor Premium+', 'tutor', 12000, 'NGN', 'month', 10,
   '["Everything in Tutor Premium","20 rewarded Zero Games competitions weekly, maximum 3 daily","Ten permanent Clubs","Advanced cohort AI","Multi-Bootcamp verification support","Unlimited existing-Club connections","Priority support"]'::jsonb, '{}'::jsonb),
  ('institution_small', 'Institution Small', 'institution', 150000, 'NGN', 'year', null,
   '["Digital Hub","Up to 500 learners","21 rewarded Zero Games competitions weekly, maximum 3 daily","Tutor and role management","Multi-Bootcamp oversight","Cohort analytics","Priority onboarding and support"]'::jsonb, '{}'::jsonb),
  ('institution_large', 'Institution Large', 'institution', 400000, 'NGN', 'year', null,
   '["Digital Hub","More than 500 learners","56 rewarded Zero Games competitions weekly, maximum 8 daily","Multiple campuses","Tutor and role management","Multi-Bootcamp oversight","Cohort analytics","Priority onboarding and support"]'::jsonb, '{}'::jsonb),
  ('institution_custom', 'Institution Custom', 'institution', null, 'NGN', 'custom', null,
   '["Custom Digital Hub arrangement","84 rewarded Zero Games competitions weekly, maximum 12 daily"]'::jsonb, '{}'::jsonb)
on conflict (key) do update set
  name = excluded.name,
  audience = excluded.audience,
  price_amount = excluded.price_amount,
  currency = excluded.currency,
  billing_interval = excluded.billing_interval,
  permanent_club_limit = excluded.permanent_club_limit,
  features = excluded.features,
  metadata = excluded.metadata,
  updated_at = now();

update public.platform_settings set description = 'Institution Small annual subscription price in NGN' where key = 'digital_hub_small_price';
update public.platform_settings set description = 'Institution Large annual subscription price in NGN' where key = 'digital_hub_large_price';

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan_key text not null references public.subscription_plans(key),
  status text not null default 'active' check (status in ('active', 'past_due', 'grace_period', 'expired', 'cancelled')),
  started_at timestamptz not null default now(),
  current_period_start timestamptz,
  current_period_end timestamptz,
  renewal_date timestamptz,
  auto_renew boolean not null default false,
  cancelled_at timestamptz,
  grace_period_end timestamptz,
  amount_paid numeric not null default 0,
  currency text not null default 'NGN',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_profile_idx on public.subscriptions (profile_id, created_at desc);
create unique index if not exists subscriptions_one_current_idx
  on public.subscriptions (profile_id)
  where status in ('active', 'past_due', 'grace_period');

alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());

alter table public.clubs
  add column if not exists club_type text,
  add column if not exists status text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists continuity_mode boolean not null default false,
  add column if not exists premium_experience_started_at timestamptz,
  add column if not exists premium_experience_expires_at timestamptz;

-- Existing relationships decide type. No Club is recreated and no ID changes.
update public.clubs
set club_type = case
  when bootcamp_id is not null or lower(coalesce(category, '')) = 'bootcamp' then 'bootcamp_cohort'
  else 'permanent'
end
where club_type is null or club_type not in ('permanent', 'bootcamp_cohort');

update public.clubs set status = 'active' where status is null;
alter table public.clubs alter column club_type set default 'permanent';
alter table public.clubs alter column club_type set not null;
alter table public.clubs alter column status set default 'active';
alter table public.clubs alter column status set not null;
alter table public.clubs drop constraint if exists clubs_club_type_check;
alter table public.clubs add constraint clubs_club_type_check check (club_type in ('permanent', 'bootcamp_cohort'));
alter table public.clubs drop constraint if exists clubs_status_check;
alter table public.clubs add constraint clubs_status_check check (status in ('active', 'continuity', 'archived', 'ended'));
create index if not exists clubs_owner_type_idx on public.clubs (creator_id, club_type, status);
create index if not exists clubs_bootcamp_type_idx on public.clubs (bootcamp_id, club_type);

-- Membership status is additive; existing memberships remain active.
alter table public.club_members add column if not exists status text not null default 'active';
alter table public.club_members drop constraint if exists club_members_status_check;
alter table public.club_members add constraint club_members_status_check check (status in ('active', 'pending', 'removed', 'left'));
alter table public.club_members drop constraint if exists club_members_role_check;
alter table public.club_members add constraint club_members_role_check check (role in (
  'Owner', 'Admin', 'Administrator', 'Moderator', 'Member', 'Study Rep', 'Investor',
  'Business Developer', 'Product Lead', 'Design Lead', 'Tech Lead', 'Growth Hacker'
));

create or replace function public.zero_club_plan_key(target_profile uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  active_plan text;
  normalized_tier text;
begin
  select * into profile_row from public.profiles where id = target_profile;
  if profile_row.id is null then return 'learner_basic'; end if;
  if coalesce(profile_row.is_admin, false) then return 'administrator'; end if;

  select plan_key into active_plan
  from public.subscriptions
  where profile_id = target_profile and status in ('active', 'past_due', 'grace_period')
  order by created_at desc limit 1;
  if active_plan is not null then return active_plan; end if;

  if lower(coalesce(profile_row.account_type, 'learner')) = 'institution' then return 'institution'; end if;
  normalized_tier := lower(replace(coalesce(profile_row.tier, 'basic'), ' ', ''));
  if lower(coalesce(profile_row.account_type, 'learner')) = 'tutor' then
    if normalized_tier = 'premium+' then return 'tutor_premium_plus'; end if;
    if normalized_tier = 'premium' then return 'tutor_premium'; end if;
    return 'tutor_basic';
  end if;
  if normalized_tier = 'creator' then return 'creator'; end if;
  if normalized_tier in ('premium', 'premium+') then return 'learner_premium'; end if;
  return 'learner_basic';
end;
$$;

create or replace function public.zero_club_permanent_club_limit(target_profile uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare plan_key text;
begin
  plan_key := public.zero_club_plan_key(target_profile);
  if plan_key in ('administrator', 'institution') then return null; end if;
  return case plan_key
    when 'learner_basic' then 0
    when 'learner_premium' then 0
    when 'creator' then 3
    when 'tutor_basic' then 1
    when 'tutor_premium' then 5
    when 'tutor_premium_plus' then 10
    else 0
  end;
end;
$$;

create or replace function public.club_capacity_message(plan_key text)
returns text language sql immutable as $$
  select case plan_key
    when 'learner_basic' then 'Build your own community with Creator. The Creator plan unlocks up to 3 permanent Clubs.'
    when 'learner_premium' then 'Ready to build your own community? Upgrade to Creator.'
    when 'creator' then 'You''ve reached your Creator plan limit of 3 Clubs.'
    when 'tutor_basic' then 'You''ve reached your 1-Club limit. Upgrade to Tutor Premium to create up to 5 Clubs.'
    when 'tutor_premium' then 'You''ve reached your 5-Club limit. Upgrade to Tutor Premium+ to create up to 10 Clubs.'
    when 'tutor_premium_plus' then 'You''ve reached your Tutor Premium+ limit of 10 Clubs.'
    else 'Your current plan does not allow another permanent Club.' end;
$$;

drop trigger if exists enforce_free_club_allowance_trigger on public.clubs;
drop function if exists public.enforce_free_club_allowance();

create or replace function public.enforce_permanent_club_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_key text;
  club_limit integer;
  owned_count integer;
begin
  if new.club_type = 'bootcamp_cohort' then
    if new.bootcamp_id is null then raise exception 'A bootcamp cohort Club must belong to a Bootcamp'; end if;
    return new;
  end if;

  new.club_type := 'permanent';
  plan_key := public.zero_club_plan_key(new.creator_id);
  club_limit := public.zero_club_permanent_club_limit(new.creator_id);
  if club_limit is null then return new; end if;

  select count(*) into owned_count from public.clubs
  where creator_id = new.creator_id and club_type = 'permanent' and status <> 'archived';
  if owned_count >= club_limit then raise exception '%', public.club_capacity_message(plan_key); end if;
  return new;
end;
$$;

drop trigger if exists enforce_permanent_club_capacity_trigger on public.clubs;
create trigger enforce_permanent_club_capacity_trigger
before insert on public.clubs
for each row execute function public.enforce_permanent_club_capacity();

create or replace function public.apply_creator_first_club_benefit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare redeemed boolean;
begin
  if new.club_type <> 'permanent' or public.zero_club_plan_key(new.creator_id) <> 'creator' then return new; end if;
  select first_club_benefit_redeemed into redeemed from public.profiles where id = new.creator_id for update;
  if not coalesce(redeemed, false) then
    new.premium_experience_started_at := now();
    new.premium_experience_expires_at := now() + interval '6 months';
    update public.profiles set
      first_club_benefit_redeemed = true,
      first_club_benefit_started_at = new.premium_experience_started_at,
      first_club_benefit_expires_at = new.premium_experience_expires_at
    where id = new.creator_id;
  end if;
  return new;
end;
$$;

drop trigger if exists apply_creator_first_club_benefit_trigger on public.clubs;
create trigger apply_creator_first_club_benefit_trigger
before insert on public.clubs
for each row execute function public.apply_creator_first_club_benefit();

create or replace function public.get_my_club_capacity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid(); plan_key text; plan_name text; club_limit integer; owned_count integer;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  plan_key := public.zero_club_plan_key(caller);
  club_limit := public.zero_club_permanent_club_limit(caller);
  select count(*) into owned_count from public.clubs
  where creator_id = caller and club_type = 'permanent' and status <> 'archived';
  select name into plan_name from public.subscription_plans where key = plan_key;
  plan_name := coalesce(plan_name, initcap(replace(plan_key, '_', ' ')));
  return jsonb_build_object(
    'plan_key', plan_key, 'plan_name', plan_name,
    'permanent_club_limit', club_limit, 'permanent_club_count', owned_count,
    'remaining', case when club_limit is null then null else greatest(0, club_limit - owned_count) end,
    'can_create', club_limit is null or owned_count < club_limit,
    'is_over_limit', club_limit is not null and owned_count > club_limit,
    'upgrade_message', case when club_limit is not null and owned_count >= club_limit then public.club_capacity_message(plan_key) else null end
  );
end;
$$;

-- Keep the oldest Clubs within the current allowance active and place only the
-- excess in continuity mode. Learner and Creator downgrades therefore preserve
-- every community without granting new creation capacity.
create or replace function public.refresh_owned_club_continuity(target_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare club_limit integer;
begin
  club_limit := public.zero_club_permanent_club_limit(target_profile);
  if club_limit is null then
    update public.clubs
    set continuity_mode = false,
        status = case when status = 'continuity' then 'active' else status end,
        updated_at = now()
    where creator_id = target_profile and club_type = 'permanent' and status <> 'archived';
    return;
  end if;

  with ranked_clubs as (
    select id, row_number() over (order by created_at asc, id asc) as ownership_rank
    from public.clubs
    where creator_id = target_profile and club_type = 'permanent' and status <> 'archived'
  )
  update public.clubs as club
  set continuity_mode = ranked.ownership_rank > club_limit,
      status = case
        when ranked.ownership_rank > club_limit then 'continuity'
        when club.status = 'continuity' then 'active'
        else club.status
      end,
      updated_at = now()
  from ranked_clubs as ranked
  where club.id = ranked.id;
end;
$$;

-- Keep the old RPC callable for deployed clients, but return the new personal capacity model.
create or replace function public.get_free_club_allowance()
returns jsonb language sql security definer set search_path = public as $$ select public.get_my_club_capacity(); $$;

create or replace function public.refresh_my_subscription_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid(); current_sub public.subscriptions; plan_row public.subscription_plans; wallet_balance numeric;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  select * into current_sub from public.subscriptions
  where profile_id = caller and status in ('active', 'past_due', 'grace_period')
  order by created_at desc limit 1 for update;
  if current_sub.id is null then return jsonb_build_object('updated', false); end if;

  if current_sub.status in ('active', 'past_due') and current_sub.current_period_end is not null and current_sub.current_period_end <= now() and current_sub.auto_renew then
    select * into plan_row from public.subscription_plans where key = current_sub.plan_key;
    select coalesce(coins, 0) into wallet_balance from public.profiles where id = caller for update;
    if plan_row.price_amount is not null and plan_row.price_amount > 0 and wallet_balance >= plan_row.price_amount then
      update public.profiles set coins = coins - plan_row.price_amount where id = caller;
      update public.subscriptions set
        status = 'active', current_period_start = now(),
        current_period_end = greatest(current_period_end, now()) + case when plan_row.billing_interval = 'year' then interval '1 year' else interval '1 month' end,
        renewal_date = greatest(current_period_end, now()) + case when plan_row.billing_interval = 'year' then interval '1 year' else interval '1 month' end,
        grace_period_end = null, amount_paid = amount_paid + plan_row.price_amount, updated_at = now()
      where id = current_sub.id returning * into current_sub;
    end if;
  end if;
  if current_sub.status in ('active', 'past_due') and current_sub.current_period_end is not null and current_sub.current_period_end <= now() then
    update public.subscriptions set status = 'grace_period', grace_period_end = coalesce(grace_period_end, current_sub.current_period_end + interval '10 days'), updated_at = now()
    where id = current_sub.id returning * into current_sub;
  end if;
  if current_sub.status = 'grace_period' and current_sub.grace_period_end <= now() then
    update public.subscriptions set status = 'expired', updated_at = now() where id = current_sub.id returning * into current_sub;
    update public.profiles set tier = 'Basic' where id = caller;
    perform public.refresh_owned_club_continuity(caller);
  end if;
  return to_jsonb(current_sub);
end;
$$;

create or replace function public.get_my_subscription_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid(); current_sub public.subscriptions; plan_key text; plan_row public.subscription_plans;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  perform public.refresh_my_subscription_lifecycle();
  plan_key := public.zero_club_plan_key(caller);
  select * into plan_row from public.subscription_plans where key = plan_key;
  select * into current_sub from public.subscriptions where profile_id = caller order by created_at desc limit 1;
  return jsonb_build_object(
    'plan_key', plan_key,
    'plan', case when plan_row.key is null then null else to_jsonb(plan_row) end,
    'subscription', case when current_sub.id is null then null else to_jsonb(current_sub) end,
    'club_capacity', public.get_my_club_capacity()
  );
end;
$$;

create or replace function public.activate_membership(requested_plan text, enable_auto_renew boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid(); profile_row public.profiles; plan_row public.subscription_plans;
  period_end timestamptz; new_subscription public.subscriptions;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  select * into profile_row from public.profiles where id = caller for update;
  select * into plan_row from public.subscription_plans where key = requested_plan and active = true;
  if plan_row.key is null then raise exception 'That membership plan is unavailable'; end if;
  if plan_row.billing_interval in ('free', 'custom') then raise exception 'Use the appropriate onboarding or downgrade flow for this plan'; end if;
  if plan_row.price_amount is null then raise exception 'Pricing for this plan has not been configured'; end if;
  if plan_row.audience = 'tutor' and lower(coalesce(profile_row.account_type, '')) <> 'tutor' then raise exception 'This plan is for Tutor accounts'; end if;
  if plan_row.audience in ('learner', 'creator') and lower(coalesce(profile_row.account_type, 'learner')) not in ('learner', 'builder', 'user') then raise exception 'This plan is for Learner accounts'; end if;
  if coalesce(profile_row.coins, 0) < plan_row.price_amount then raise exception 'Your wallet balance is too low for this membership'; end if;

  period_end := case when plan_row.billing_interval = 'year' then now() + interval '1 year' else now() + interval '1 month' end;
  update public.subscriptions set status = 'cancelled', cancelled_at = now(), auto_renew = false, updated_at = now()
  where profile_id = caller and status in ('active', 'past_due', 'grace_period');
  update public.profiles set coins = coins - plan_row.price_amount,
    tier = case requested_plan when 'creator' then 'Creator' when 'tutor_premium_plus' then 'Premium+' else 'Premium' end
  where id = caller;
  insert into public.subscriptions (profile_id, plan_key, status, current_period_start, current_period_end, renewal_date, auto_renew, amount_paid, currency)
  values (caller, requested_plan, 'active', now(), period_end, period_end, enable_auto_renew, plan_row.price_amount, plan_row.currency)
  returning * into new_subscription;
  perform public.refresh_owned_club_continuity(caller);
  return jsonb_build_object('subscription', to_jsonb(new_subscription), 'club_capacity', public.get_my_club_capacity());
end;
$$;

create or replace function public.renew_my_membership()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid(); current_sub public.subscriptions; plan_row public.subscription_plans; profile_row public.profiles; next_end timestamptz;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  select * into current_sub from public.subscriptions where profile_id = caller order by created_at desc limit 1 for update;
  if current_sub.id is null then raise exception 'No membership is available to renew'; end if;
  select * into plan_row from public.subscription_plans where key = current_sub.plan_key;
  select * into profile_row from public.profiles where id = caller for update;
  if plan_row.price_amount is null or plan_row.price_amount <= 0 then raise exception 'This plan cannot be renewed here'; end if;
  if coalesce(profile_row.coins, 0) < plan_row.price_amount then raise exception 'Your wallet balance is too low to renew'; end if;
  next_end := greatest(coalesce(current_sub.current_period_end, now()), now()) + case when plan_row.billing_interval = 'year' then interval '1 year' else interval '1 month' end;
  update public.profiles set coins = coins - plan_row.price_amount where id = caller;
  update public.subscriptions set status = 'active', current_period_start = now(), current_period_end = next_end, renewal_date = next_end, grace_period_end = null, cancelled_at = null, amount_paid = amount_paid + plan_row.price_amount, updated_at = now()
  where id = current_sub.id returning * into current_sub;
  perform public.refresh_owned_club_continuity(caller);
  return to_jsonb(current_sub);
end;
$$;

create or replace function public.set_membership_auto_renew(enabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare saved public.subscriptions;
begin
  update public.subscriptions set auto_renew = enabled, updated_at = now()
  where id = (select id from public.subscriptions where profile_id = auth.uid() and status in ('active','past_due','grace_period') order by created_at desc limit 1)
  returning * into saved;
  if saved.id is null then raise exception 'No active membership found'; end if;
  return to_jsonb(saved);
end;
$$;

create or replace function public.downgrade_to_basic()
returns jsonb language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); account_kind text;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  select lower(coalesce(account_type, 'learner')) into account_kind from public.profiles where id = caller;
  update public.subscriptions set status = 'cancelled', cancelled_at = now(), auto_renew = false, updated_at = now()
  where profile_id = caller and status in ('active','past_due','grace_period');
  update public.profiles set tier = 'Basic' where id = caller;
  perform public.refresh_owned_club_continuity(caller);
  return jsonb_build_object('plan_key', case when account_kind = 'tutor' then 'tutor_basic' else 'learner_basic' end, 'club_capacity', public.get_my_club_capacity());
end;
$$;

-- Creator Rewards foundation. No revenue percentage or automatic payout is hard-coded.
create table if not exists public.creator_reward_periods (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  eligible_revenue numeric,
  pool_amount numeric,
  status text not null default 'draft' check (status in ('draft','calculating','approved','paid','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (period_start, period_end)
);

create table if not exists public.creator_reward_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.creator_reward_periods(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  creator_score numeric not null default 0,
  active_members integer not null default 0,
  retained_members integer not null default 0,
  engagement_count integer not null default 0,
  posts_count integer not null default 0,
  events_count integer not null default 0,
  learning_activity_count integer not null default 0,
  verified_contribution_count integer not null default 0,
  reward_amount numeric not null default 0,
  status text not null default 'earned' check (status in ('earned','pending','approved','paid','rejected')),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, profile_id)
);

alter table public.creator_reward_periods enable row level security;
alter table public.creator_reward_entries enable row level security;
drop policy if exists creator_reward_periods_select on public.creator_reward_periods;
create policy creator_reward_periods_select on public.creator_reward_periods for select to authenticated using (true);
drop policy if exists creator_reward_periods_admin_manage on public.creator_reward_periods;
create policy creator_reward_periods_admin_manage on public.creator_reward_periods for all to authenticated
  using (public.is_zero_club_admin()) with check (public.is_zero_club_admin());
drop policy if exists creator_reward_entries_select_own on public.creator_reward_entries;
create policy creator_reward_entries_select_own on public.creator_reward_entries for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());
drop policy if exists creator_reward_entries_admin_manage on public.creator_reward_entries;
create policy creator_reward_entries_admin_manage on public.creator_reward_entries for all to authenticated
  using (public.is_zero_club_admin()) with check (public.is_zero_club_admin());

grant select on public.subscription_plans to authenticated;
grant select on public.subscriptions to authenticated;
grant execute on function public.zero_club_plan_key(uuid) to authenticated;
grant execute on function public.zero_club_permanent_club_limit(uuid) to authenticated;
grant execute on function public.get_my_club_capacity() to authenticated;
revoke all on function public.refresh_owned_club_continuity(uuid) from public;
grant execute on function public.get_free_club_allowance() to authenticated;
grant execute on function public.refresh_my_subscription_lifecycle() to authenticated;
grant execute on function public.get_my_subscription_dashboard() to authenticated;
grant execute on function public.activate_membership(text, boolean) to authenticated;
grant execute on function public.renew_my_membership() to authenticated;
grant execute on function public.set_membership_auto_renew(boolean) to authenticated;
grant execute on function public.downgrade_to_basic() to authenticated;

notify pgrst, 'reload schema';
