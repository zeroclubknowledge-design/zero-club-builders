-- ===========================================================================
-- Tasks can now be aimed at Zero Ambassadors.
--
-- Ambassadors are a ZeroStart concept, but their tasks are created here, in the
-- Zero Club admin under Quests. That is deliberate: quests already have an
-- admin screen, a reward, a status, a completion table and a claim path that
-- pays through the one ledger. Building a second, parallel task system for
-- ambassadors would mean two definitions of "a task", two places to create
-- one, and eventually two answers to how much a task is worth.
--
-- So a quest gains an audience, and ZeroStart reads the ambassador ones.
-- ===========================================================================

alter table public.quests
  add column if not exists audience text not null default 'everyone';

alter table public.quests drop constraint if exists quests_audience_check;
alter table public.quests
  add constraint quests_audience_check check (audience in ('everyone', 'ambassador'));

comment on column public.quests.audience is
  'everyone = the Zero Club task list. ambassador = shown to Zero Ambassadors in ZeroStart.';

create index if not exists quests_audience_idx on public.quests (audience, status, sort_order);

/*
 * Ambassador tasks are reviewed, not self-claimed.
 *
 * A quest like "post today" can be verified by counting posts. "Run a campus
 * meetup" cannot — there is no row in this database that proves it happened.
 * So ambassador tasks use the 'manual' criteria, which claim_daily_xp_quest
 * refuses outright; they are completed by an admin marking them done.
 */
alter table public.quests drop constraint if exists quests_criteria_type_check;

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

  if quest.criteria_type = 'ship' then
    raise exception 'Shipped projects are reviewed by the Zero Club team before the reward is released';
  end if;

  -- Anything a person has to witness is reviewed, never self-claimed.
  if quest.criteria_type = 'manual' or quest.audience = 'ambassador' then
    raise exception 'This task is confirmed by the Zero Club team';
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

-- The admin list needs the new column, or the screen cannot show or edit it.
create or replace function public.get_admin_xp_quests()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(quest_row) order by quest_row.sort_order, quest_row.created_at desc)
    from (
      select id, slug, title, description, type, reward_xp, criteria_type,
             criteria_count, icon_name, status, sort_order, audience,
             created_at, updated_at
      from public.quests
    ) as quest_row
  ), '[]'::jsonb);
end;
$$;

/*
 * Creating and editing a quest, with the audience included.
 *
 * Separate functions rather than more optional parameters on the originals:
 * the existing ones are called by the current admin screen and changing their
 * signature would break it mid-deploy.
 */
create or replace function public.admin_save_quest(
  p_id uuid,
  p_title text,
  p_description text,
  p_type text,
  p_reward integer,
  p_criteria_type text,
  p_criteria_count integer,
  p_icon_name text,
  p_status text,
  p_sort_order integer,
  p_audience text default 'everyone'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  quest_id uuid := p_id;
  base_slug text;
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if length(btrim(coalesce(p_title, ''))) < 3 then raise exception 'Task title is too short'; end if;
  if length(btrim(coalesce(p_description, ''))) < 10 then raise exception 'Task description is too short'; end if;
  if p_type not in ('daily', 'one-time', 'milestone') then raise exception 'Invalid frequency'; end if;
  if p_status not in ('draft', 'active', 'archived', 'inactive') then raise exception 'Invalid status'; end if;
  if p_audience not in ('everyone', 'ambassador') then raise exception 'Invalid audience'; end if;
  if p_reward not between 1 and 10000 then raise exception 'Reward must be between 1 and 10,000 ZP'; end if;
  if p_criteria_count not between 1 and 10000 then raise exception 'Target must be between 1 and 10,000'; end if;

  -- An ambassador task is witnessed, so its requirement is always 'manual'.
  if p_audience = 'ambassador' and p_criteria_type <> 'manual' then
    p_criteria_type := 'manual';
  end if;

  if quest_id is null then
    base_slug := regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g');
    base_slug := btrim(base_slug, '-') || '-' || substr(gen_random_uuid()::text, 1, 6);
    insert into public.quests (
      slug, title, description, type, reward_xp, criteria_type, criteria_count,
      icon_name, status, sort_order, audience, created_by
    ) values (
      base_slug, btrim(p_title), btrim(p_description), p_type, p_reward, p_criteria_type,
      p_criteria_count, coalesce(p_icon_name, 'Trophy'), p_status, coalesce(p_sort_order, 0),
      p_audience, auth.uid()
    )
    returning id into quest_id;
  else
    update public.quests
    set title = btrim(p_title), description = btrim(p_description), type = p_type,
        reward_xp = p_reward, criteria_type = p_criteria_type, criteria_count = p_criteria_count,
        icon_name = coalesce(p_icon_name, icon_name), status = p_status,
        sort_order = coalesce(p_sort_order, sort_order), audience = p_audience,
        updated_at = now()
    where id = quest_id;
    if not found then raise exception 'Task not found'; end if;
  end if;

  return quest_id;
end;
$$;

grant execute on function public.admin_save_quest(uuid, text, text, text, integer, text, integer, text, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
