-- ============================================================================
-- One account, three modes: Learner, Tutor and Creator — plus onboarding.
--
-- Until now the choice between learning and teaching was made once, at sign
-- up, as an "account type", and someone who wanted to do both needed a second
-- account. A person now has one account and switches mode, the way a
-- professional switches between their own profile and a page they manage.
--
--   active_mode    which mode the app is showing: learner | tutor | creator
--   tutor_enabled  true once someone has switched into Tutor mode. Their
--                  tutor club allowance stays with them while they browse in
--                  Learner or Creator mode, so switching never shrinks it.
--   interests      fields picked during onboarding, used to personalise Learn
--   onboarded_at   set when onboarding is finished; null sends a new member
--                  through it once
--
-- account_type keeps meaning what the rest of the schema already expects:
-- 'Tutor' in Tutor mode, 'Learner' in Learner and Creator mode, and
-- 'Institution' for organisations, which do not switch.
--
-- Safe to run more than once.
-- ============================================================================

alter table public.profiles add column if not exists active_mode text;
alter table public.profiles add column if not exists tutor_enabled boolean not null default false;
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists onboarded_at timestamptz;

alter table public.profiles drop constraint if exists profiles_active_mode_check;
alter table public.profiles add constraint profiles_active_mode_check
  check (active_mode is null or active_mode in ('learner', 'tutor', 'creator'));

-- Existing members keep exactly what they had and are not sent through
-- onboarding; only accounts created from now on start with onboarded_at null.
update public.profiles
set active_mode = case when lower(coalesce(account_type, 'learner')) = 'tutor' then 'tutor' else 'learner' end
where active_mode is null and lower(coalesce(account_type, 'learner')) <> 'institution';

update public.profiles set tutor_enabled = true
where lower(coalesce(account_type, '')) = 'tutor' and not tutor_enabled;

update public.profiles set onboarded_at = coalesce(created_at, now())
where onboarded_at is null;

-- ----------------------------------------------------------------------------
-- Switch mode. One call, so account_type, active_mode and tutor_enabled can
-- never disagree with each other.
-- ----------------------------------------------------------------------------
create or replace function public.set_active_mode(new_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  current_type text;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if new_mode not in ('learner', 'tutor', 'creator') then raise exception 'Unknown mode'; end if;

  select account_type into current_type from public.profiles where id = caller;
  if lower(coalesce(current_type, '')) = 'institution' then
    raise exception 'Institution accounts do not switch modes';
  end if;

  update public.profiles
  set active_mode = new_mode,
      account_type = case when new_mode = 'tutor' then 'Tutor' else 'Learner' end,
      tutor_enabled = tutor_enabled or new_mode = 'tutor'
  where id = caller;

  return jsonb_build_object('active_mode', new_mode);
end;
$$;

grant execute on function public.set_active_mode(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Plan resolution: identical to the previous definition except that a tutor
-- stays a tutor for club allowance while in another mode (tutor_enabled).
-- ----------------------------------------------------------------------------
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
  if lower(coalesce(profile_row.account_type, 'learner')) = 'tutor'
     or (coalesce(profile_row.tutor_enabled, false) and normalized_tier <> 'creator') then
    if normalized_tier = 'premium+' then return 'tutor_premium_plus'; end if;
    if normalized_tier = 'premium' then return 'tutor_premium'; end if;
    return 'tutor_basic';
  end if;
  if normalized_tier = 'creator' then return 'creator'; end if;
  if normalized_tier in ('premium', 'premium+') then return 'learner_premium'; end if;
  return 'learner_basic';
end;
$$;
