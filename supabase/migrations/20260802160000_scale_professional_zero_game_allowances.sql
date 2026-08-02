-- Scale rewarded Zero Games competition allowances for paid professional plans.
-- Learner plans remain the product baseline; Creator, Tutor, and Institution
-- plans receive higher capacity based on price and expected cohort usage.

with allowance_updates(plan_key, previous_feature, next_feature) as (
  values
    ('creator', '5 rewarded Zero Games competitions weekly', '12 rewarded Zero Games competitions weekly, maximum 2 daily'),
    ('tutor_premium', '5 rewarded Zero Games competitions weekly', '8 rewarded Zero Games competitions weekly, maximum 2 daily'),
    ('tutor_premium_plus', '14 rewarded Zero Games competitions weekly, maximum 2 daily', '20 rewarded Zero Games competitions weekly, maximum 3 daily'),
    ('institution_small', '5 rewarded Zero Games competitions weekly', '21 rewarded Zero Games competitions weekly, maximum 3 daily'),
    ('institution_large', '14 rewarded Zero Games competitions weekly, maximum 2 daily', '56 rewarded Zero Games competitions weekly, maximum 8 daily'),
    ('institution_custom', '14 rewarded Zero Games competitions weekly, maximum 2 daily', '84 rewarded Zero Games competitions weekly, maximum 12 daily')
)
update public.subscription_plans as plan
set features = case
      when (coalesce(plan.features, '[]'::jsonb) - allowance_updates.previous_feature) @> jsonb_build_array(allowance_updates.next_feature)
        then coalesce(plan.features, '[]'::jsonb) - allowance_updates.previous_feature
      else (coalesce(plan.features, '[]'::jsonb) - allowance_updates.previous_feature) || jsonb_build_array(allowance_updates.next_feature)
    end,
    updated_at = now()
from allowance_updates
where plan.key = allowance_updates.plan_key;

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

notify pgrst, 'reload schema';
