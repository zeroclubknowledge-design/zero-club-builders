-- ===========================================================================
-- Only two things mint ZP from here.
--
--   1. A referral, once, for both people (200 each).
--   2. A quest an admin created and a person completed.
--
-- Everything else stops. This is deliberately enforced in the database rather
-- than by removing buttons: a reward that can still be claimed by a crafted
-- request is a reward that is still switched on, however the app behaves.
--
-- Nothing already awarded is reversed. Taking ZP back off people because the
-- rules moved would be a worse outcome than the inconsistency.
-- ===========================================================================

-- ------------------------------------------------- shipping a project ------
/*
 * The 50 ZP for shipping stops being automatic.
 *
 * It was paid by a quest with criteria_type = 'ship', which only checks that a
 * build post exists. Nothing looks at whether anything was actually shipped,
 * so the reward is one post away for anyone who wants it. Until Zero AI can
 * judge that, a person decides — see zc_award_ship_reward below.
 *
 * Two layers again: the quest is deactivated so it leaves the task list, and
 * claim_daily_xp_quest refuses the criteria outright so re-activating the
 * quest by hand cannot quietly turn the automatic payout back on.
 */
update public.quests
set status = 'inactive'
where criteria_type = 'ship';

create or replace function public.claim_daily_xp_quest(p_quest_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  lagos_today date := (clock_timestamp() at time zone 'Africa/Lagos')::date;
  quest public.quests%rowtype;
  completed boolean := false;
  awarded boolean;
  source_key text;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into quest
  from public.quests
  where status = 'active' and (slug = p_quest_id or id::text = p_quest_id)
  limit 1;
  if quest.id is null then raise exception 'Quest is unavailable'; end if;

  -- Shipping is reviewed, not claimed. Refused here as well as by the quest
  -- being inactive, so the rule survives someone flipping that status back.
  if quest.criteria_type = 'ship' then
    raise exception 'Shipped projects are reviewed by the Zero Club team before the reward is released';
  end if;

  completed := case quest.criteria_type
    when 'login' then true
    when 'post_today' then (
      select count(*) >= quest.criteria_count from public.posts
      where author_id = caller and (created_at at time zone 'Africa/Lagos')::date = lagos_today
    )
    when 'post' then (
      select count(*) >= quest.criteria_count from public.posts where author_id = caller
    )
    when 'comment' then (
      select count(*) >= quest.criteria_count from public.comments
      where profile_id = caller
        and (quest.type <> 'daily' or (created_at at time zone 'Africa/Lagos')::date = lagos_today)
    )
    when 'quote' then (
      select count(*) >= quest.criteria_count from public.posts
      where author_id = caller and quoted_post_id is not null
        and (quest.type <> 'daily' or (created_at at time zone 'Africa/Lagos')::date = lagos_today)
    )
    when 'club' then (
      select count(*) >= quest.criteria_count
      from public.club_members as member
      join public.clubs as club on club.id = member.club_id
      where club.creator_id = caller and coalesce(member.status, 'active') = 'active'
    )
    when 'follow' then (
      select count(*) >= quest.criteria_count from public.follows where follower_id = caller
    )
    when 'profile' then exists (
      select 1 from public.profiles where id = caller and length(btrim(coalesce(bio, ''))) > 0
    )
    when 'enrollment' then (
      select count(*) >= quest.criteria_count from public.enrollments where profile_id = caller
    )
    else false
  end;

  if not completed then raise exception 'Complete this quest before claiming its reward'; end if;

  source_key := case when quest.type = 'daily'
    then quest.slug || ':' || lagos_today::text
    else quest.slug
  end;

  awarded := public.award_profile_zp(
    caller, 'daily_quest', source_key, quest.reward_xp,
    jsonb_build_object('quest_id', quest.id, 'quest_slug', quest.slug, 'frequency', quest.type, 'date', lagos_today)
  );
  if not awarded then raise exception 'Quest reward already claimed'; end if;

  insert into public.quest_completions (profile_id, quest_id, completed_at, claimed_at)
  values (caller, quest.id, now(), now())
  on conflict (profile_id, quest_id)
  do update set completed_at = excluded.completed_at, claimed_at = excluded.claimed_at;

  return jsonb_build_object('success', true, 'reward', quest.reward_xp, 'zp_awarded', true);
end;
$$;

revoke all on function public.claim_daily_xp_quest(text) from public;
grant execute on function public.claim_daily_xp_quest(text) to authenticated;

notify pgrst, 'reload schema';
