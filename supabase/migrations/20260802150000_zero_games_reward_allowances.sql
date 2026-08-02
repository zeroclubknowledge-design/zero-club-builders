-- Plan-aware Zero Games reward allowances.
-- Every published rewarded competition counts. A cancelled competition releases
-- its usage because neither the offer nor secured prize can be won.

with reward_features(plan_key, feature) as (
  values
    ('learner_basic', '2 rewarded Zero Games competitions weekly'),
    ('learner_premium', '5 rewarded Zero Games competitions weekly'),
    ('creator', '12 rewarded Zero Games competitions weekly, maximum 2 daily'),
    ('tutor_basic', '3 rewarded Zero Games competitions weekly'),
    ('tutor_premium', '8 rewarded Zero Games competitions weekly, maximum 2 daily'),
    ('tutor_premium_plus', '20 rewarded Zero Games competitions weekly, maximum 3 daily'),
    ('institution_small', '21 rewarded Zero Games competitions weekly, maximum 3 daily'),
    ('institution_large', '56 rewarded Zero Games competitions weekly, maximum 8 daily'),
    ('institution_custom', '84 rewarded Zero Games competitions weekly, maximum 12 daily')
)
update public.subscription_plans as plan
set features = case
      when coalesce(plan.features, '[]'::jsonb) @> jsonb_build_array(reward_features.feature)
        then plan.features
      else coalesce(plan.features, '[]'::jsonb) || jsonb_build_array(reward_features.feature)
    end,
    updated_at = now()
from reward_features
where plan.key = reward_features.plan_key;

create table if not exists public.zero_game_reward_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_type text not null check (period_type in ('week', 'day')),
  period_start date not null,
  used_count integer not null default 0 check (used_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (profile_id, period_type, period_start)
);

alter table public.zero_game_reward_usage enable row level security;

-- Preserve competitions already created in the current and previous periods.
insert into public.zero_game_reward_usage (profile_id, period_type, period_start, used_count)
select creator_id, 'week', date_trunc('week', created_at at time zone 'Africa/Lagos')::date, count(*)::integer
from public.zero_game_competitions
where status <> 'cancelled'
group by creator_id, date_trunc('week', created_at at time zone 'Africa/Lagos')::date
on conflict (profile_id, period_type, period_start) do update
set used_count = greatest(public.zero_game_reward_usage.used_count, excluded.used_count),
    updated_at = now();

insert into public.zero_game_reward_usage (profile_id, period_type, period_start, used_count)
select creator_id, 'day', (created_at at time zone 'Africa/Lagos')::date, count(*)::integer
from public.zero_game_competitions
where status <> 'cancelled'
group by creator_id, (created_at at time zone 'Africa/Lagos')::date
on conflict (profile_id, period_type, period_start) do update
set used_count = greatest(public.zero_game_reward_usage.used_count, excluded.used_count),
    updated_at = now();

create or replace function public.zero_game_reward_plan(target_profile uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved_plan text;
  institution_plan text;
begin
  resolved_plan := public.zero_club_plan_key(target_profile);

  if resolved_plan = 'institution' then
    select application.plan into institution_plan
    from public.institution_applications as application
    where application.profile_id = target_profile
    limit 1;

    return case institution_plan
      when 'digital_hub_large' then 'institution_large'
      when 'digital_hub_custom' then 'institution_custom'
      else 'institution_small'
    end;
  end if;

  return resolved_plan;
end;
$$;

create or replace function public.get_zero_game_reward_allowance(target_profile uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  plan_key text := public.zero_game_reward_plan(target_profile);
  weekly_limit integer;
  daily_limit integer;
  weekly_used integer;
  daily_used integer;
  week_started_at timestamptz := date_trunc('week', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
  day_started_at timestamptz := date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
begin
  weekly_limit := case plan_key
    when 'learner_premium' then 5
    when 'tutor_basic' then 3
    when 'creator' then 12
    when 'tutor_premium' then 8
    when 'tutor_premium_plus' then 20
    when 'institution_small' then 21
    when 'institution_large' then 56
    when 'institution_custom' then 84
    when 'administrator' then 84
    else 2
  end;

  daily_limit := case plan_key
    when 'creator' then 2
    when 'tutor_premium' then 2
    when 'tutor_premium_plus' then 3
    when 'institution_small' then 3
    when 'institution_large' then 8
    when 'institution_custom' then 12
    when 'administrator' then 12
    else null
  end;

  select count(*)::integer into weekly_used
  from public.zero_game_competitions
  where creator_id = target_profile
    and status <> 'cancelled'
    and created_at >= week_started_at;

  select count(*)::integer into daily_used
  from public.zero_game_competitions
  where creator_id = target_profile
    and status <> 'cancelled'
    and created_at >= day_started_at;

  return jsonb_build_object(
    'plan_key', plan_key,
    'weekly_limit', weekly_limit,
    'weekly_used', weekly_used,
    'weekly_remaining', greatest(0, weekly_limit - weekly_used),
    'daily_limit', daily_limit,
    'daily_used', daily_used,
    'daily_remaining', case when daily_limit is null then null else greatest(0, daily_limit - daily_used) end,
    'week_started_at', week_started_at,
    'resets_at', week_started_at + interval '7 days',
    'can_create', weekly_used < weekly_limit and (daily_limit is null or daily_used < daily_limit)
  );
end;
$$;

create or replace function public.get_my_zero_game_reward_allowance()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  return public.get_zero_game_reward_allowance(auth.uid());
end;
$$;

create or replace function public.enforce_zero_game_reward_allowance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowance jsonb;
  weekly_limit integer;
  daily_limit integer;
  resulting_count integer;
  weekly_period date := date_trunc('week', now() at time zone 'Africa/Lagos')::date;
  daily_period date := (now() at time zone 'Africa/Lagos')::date;
begin
  if new.status = 'cancelled' then return new; end if;

  allowance := public.get_zero_game_reward_allowance(new.creator_id);
  weekly_limit := (allowance ->> 'weekly_limit')::integer;
  daily_limit := nullif(allowance ->> 'daily_limit', '')::integer;

  insert into public.zero_game_reward_usage as usage (
    profile_id, period_type, period_start, used_count
  ) values (
    new.creator_id, 'week', weekly_period, 1
  )
  on conflict (profile_id, period_type, period_start) do update
  set used_count = usage.used_count + 1, updated_at = now()
  where usage.used_count < weekly_limit
  returning used_count into resulting_count;

  if resulting_count is null then
    raise exception 'Your plan includes % rewarded competitions each week. Your allowance resets on Monday.', weekly_limit;
  end if;

  if daily_limit is not null then
    resulting_count := null;
    insert into public.zero_game_reward_usage as usage (
      profile_id, period_type, period_start, used_count
    ) values (
      new.creator_id, 'day', daily_period, 1
    )
    on conflict (profile_id, period_type, period_start) do update
    set used_count = usage.used_count + 1, updated_at = now()
    where usage.used_count < daily_limit
    returning used_count into resulting_count;

    if resulting_count is null then
      raise exception 'Your plan allows a maximum of % rewarded competitions per day.', daily_limit;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_zero_game_reward_allowance_trigger on public.zero_game_competitions;
create trigger enforce_zero_game_reward_allowance_trigger
before insert on public.zero_game_competitions
for each row execute function public.enforce_zero_game_reward_allowance();

create or replace function public.release_zero_game_reward_allowance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  released_profile uuid := coalesce(old.creator_id, new.creator_id);
  released_at timestamptz := coalesce(old.created_at, new.created_at);
begin
  if tg_op = 'UPDATE' and not (old.status <> 'cancelled' and new.status = 'cancelled') then
    return new;
  end if;
  if tg_op = 'DELETE' and old.status = 'cancelled' then
    return old;
  end if;

  update public.zero_game_reward_usage
  set used_count = greatest(0, used_count - 1), updated_at = now()
  where profile_id = released_profile
    and period_type = 'week'
    and period_start = date_trunc('week', released_at at time zone 'Africa/Lagos')::date;

  update public.zero_game_reward_usage
  set used_count = greatest(0, used_count - 1), updated_at = now()
  where profile_id = released_profile
    and period_type = 'day'
    and period_start = (released_at at time zone 'Africa/Lagos')::date;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists release_zero_game_reward_allowance_trigger on public.zero_game_competitions;
create trigger release_zero_game_reward_allowance_trigger
after update of status or delete on public.zero_game_competitions
for each row execute function public.release_zero_game_reward_allowance();

revoke all on function public.zero_game_reward_plan(uuid) from public;
revoke all on function public.get_zero_game_reward_allowance(uuid) from public;
revoke all on function public.enforce_zero_game_reward_allowance() from public;
revoke all on function public.release_zero_game_reward_allowance() from public;
revoke all on function public.get_my_zero_game_reward_allowance() from public;
grant execute on function public.get_my_zero_game_reward_allowance() to authenticated;

notify pgrst, 'reload schema';
