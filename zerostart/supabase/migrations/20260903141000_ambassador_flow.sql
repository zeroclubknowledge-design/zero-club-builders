-- ===========================================================================
-- The ambassador loop: join, pick levers, do a task, get signed off, get paid.
--
-- The payment is the part that matters. It runs through Zero Club's
-- award_profile_zp, keyed on the task-log id, so the same task cannot pay
-- twice however many times an admin clicks. And it is gated behind an admin —
-- which is exactly the rule Zero Club now runs on: only a referral and an
-- admin-created task mint ZP.
-- ===========================================================================

/*
 * Join, or update your details.
 *
 * One call does both, because "am I already an ambassador" is a question the
 * client should not have to ask before it can save a form.
 */
create or replace function public.zs_save_ambassador(
  p_location text,
  p_country text default null,
  p_bio text default null,
  p_focus text[] default '{}',
  p_bootcamps uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if length(btrim(coalesce(p_location, ''))) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'location_required');
  end if;
  if coalesce(array_length(p_focus, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'focus_required');
  end if;

  insert into public.zs_ambassadors (profile_id, location, country, bio)
  values (caller, btrim(p_location), nullif(btrim(coalesce(p_country, '')), ''), nullif(btrim(coalesce(p_bio, '')), ''))
  on conflict (profile_id) do update
    set location = excluded.location,
        country = excluded.country,
        bio = excluded.bio,
        status = case when public.zs_ambassadors.status = 'removed'
                      then public.zs_ambassadors.status   -- a removal is not self-reversible
                      else 'active' end,
        updated_at = now();

  -- Replace rather than merge: the form shows the full set, so what it sends
  -- is the full set. Merging would make unticking a lever impossible.
  delete from public.zs_ambassador_focus where profile_id = caller;
  insert into public.zs_ambassador_focus (profile_id, focus_slug)
  select caller, slug from public.zs_focus_areas
  where slug = any(p_focus) and active
  on conflict do nothing;

  delete from public.zs_ambassador_bootcamps where profile_id = caller;
  if coalesce(array_length(p_bootcamps, 1), 0) > 0 then
    insert into public.zs_ambassador_bootcamps (profile_id, bootcamp_id)
    select caller, unnest(p_bootcamps)
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.zs_save_ambassador(text, text, text, text[], uuid[]) to authenticated;

/*
 * Everything the dashboard shows, in one call.
 *
 * Level is computed here rather than in the browser so the number on screen
 * and the number the database would agree with cannot drift apart.
 */
create or replace function public.zs_ambassador_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  amb public.zs_ambassadors;
  approved integer;
begin
  if caller is null then
    return jsonb_build_object('found', false);
  end if;

  select * into amb from public.zs_ambassadors where profile_id = caller;
  if amb.profile_id is null then
    return jsonb_build_object('found', false);
  end if;

  select count(*) into approved
  from public.zs_ambassador_task_log
  where profile_id = caller and status = 'approved';

  return jsonb_build_object(
    'found', true,
    'location', amb.location,
    'country', amb.country,
    'bio', amb.bio,
    'status', amb.status,
    'joined_at', amb.joined_at,
    'focus', coalesce((
      select jsonb_agg(focus_slug order by focus_slug)
      from public.zs_ambassador_focus where profile_id = caller
    ), '[]'::jsonb),
    'bootcamps', coalesce((
      select jsonb_agg(bootcamp_id)
      from public.zs_ambassador_bootcamps where profile_id = caller
    ), '[]'::jsonb),
    'tasks_approved', approved,
    'tasks_submitted', (
      select count(*) from public.zs_ambassador_task_log
      where profile_id = caller and status = 'submitted'
    ),
    'zp_earned', coalesce((
      select sum(zp_awarded) from public.zs_ambassador_task_log
      where profile_id = caller and status = 'approved'
    ), 0),
    'level', public.zs_ambassador_level(approved)
  );
end;
$$;

grant execute on function public.zs_ambassador_me() to authenticated;

/*
 * The task list: active ambassador quests, with this person's status on each.
 *
 * The quests live in Zero Club's table. Reading them through a function keeps
 * ZeroStart from needing a policy on a table it does not own.
 */
create or replace function public.zs_ambassador_tasks()
returns table (
  quest_id uuid,
  title text,
  description text,
  reward integer,
  icon_name text,
  frequency text,
  my_status text,
  submitted_at timestamptz,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.title, q.description, q.reward_xp, q.icon_name, q.type,
         coalesce(l.status, 'available'), l.submitted_at, l.note
  from public.quests q
  left join public.zs_ambassador_task_log l
    on l.quest_id = q.id and l.profile_id = auth.uid()
  where q.audience = 'ambassador' and q.status = 'active'
  order by q.sort_order, q.created_at desc;
$$;

grant execute on function public.zs_ambassador_tasks() to authenticated;

/* Submitting a task for review, with whatever evidence they have. */
create or replace function public.zs_submit_ambassador_task(
  p_quest_id uuid,
  p_evidence text default null,
  p_evidence_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if not exists (select 1 from public.zs_ambassadors where profile_id = caller and status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'not_an_ambassador');
  end if;
  if not exists (
    select 1 from public.quests
    where id = p_quest_id and audience = 'ambassador' and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'task_unavailable');
  end if;

  insert into public.zs_ambassador_task_log (profile_id, quest_id, evidence, evidence_url)
  values (caller, p_quest_id, nullif(btrim(coalesce(p_evidence, '')), ''), nullif(btrim(coalesce(p_evidence_url, '')), ''))
  on conflict (profile_id, quest_id) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.zs_submit_ambassador_task(uuid, text, text) to authenticated;

/*
 * The sign-off, and the only place an ambassador task pays.
 *
 * Admin only, idempotent through the ledger, and it refuses to act on a log
 * row that has already been decided — so a second click reports the decision
 * rather than repeating it.
 */
create or replace function public.zs_review_ambassador_task(
  p_log_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewer uuid := auth.uid();
  log public.zs_ambassador_task_log;
  reward integer;
  paid boolean := false;
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into log from public.zs_ambassador_task_log where id = p_log_id for update;
  if log.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if log.status <> 'submitted' then
    return jsonb_build_object('ok', false, 'reason',
      case log.status when 'approved' then 'already_approved' else 'already_rejected' end);
  end if;

  select reward_xp into reward from public.quests where id = log.quest_id;

  if p_approve then
    paid := public.award_profile_zp(
      log.profile_id, 'ambassador_task', p_log_id::text, coalesce(reward, 0),
      jsonb_build_object('quest_id', log.quest_id, 'reviewed_by', reviewer, 'source', 'ZeroStart')
    );
  end if;

  update public.zs_ambassador_task_log
  set status = case when p_approve then 'approved' else 'rejected' end,
      note = p_note,
      reviewed_by = reviewer,
      reviewed_at = now(),
      zp_awarded = case when paid then coalesce(reward, 0) else 0 end
  where id = p_log_id;

  return jsonb_build_object('ok', true, 'approved', p_approve,
                            'zp_awarded', case when paid then coalesce(reward, 0) else 0 end);
end;
$$;

grant execute on function public.zs_review_ambassador_task(uuid, boolean, text) to authenticated;

/* The admin queue of submissions waiting on a decision. */
create or replace function public.zs_pending_ambassador_tasks()
returns table (
  log_id uuid,
  profile_id uuid,
  ambassador_name text,
  ambassador_username text,
  ambassador_avatar text,
  location text,
  quest_title text,
  reward integer,
  evidence text,
  evidence_url text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then return; end if;

  return query
    select l.id, l.profile_id,
           coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'An ambassador'),
           pr.username, pr.avatar_url, a.location,
           q.title, q.reward_xp, l.evidence, l.evidence_url, l.submitted_at
    from public.zs_ambassador_task_log l
    join public.zs_ambassadors a on a.profile_id = l.profile_id
    join public.profiles pr on pr.id = l.profile_id
    join public.quests q on q.id = l.quest_id
    where l.status = 'submitted'
    order by l.submitted_at asc;
end;
$$;

grant execute on function public.zs_pending_ambassador_tasks() to authenticated;

/* The public roster, for the leaderboard. */
create or replace function public.zs_ambassador_roster(p_limit integer default 50)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  avatar_url text,
  location text,
  focus text[],
  tasks_approved integer,
  level text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.profile_id,
         coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'An ambassador'),
         pr.username, pr.avatar_url, a.location,
         coalesce(array_agg(f.focus_slug) filter (where f.focus_slug is not null), '{}'),
         count(l.id) filter (where l.status = 'approved')::integer,
         public.zs_ambassador_level(count(l.id) filter (where l.status = 'approved')::integer)
  from public.zs_ambassadors a
  join public.profiles pr on pr.id = a.profile_id
  left join public.zs_ambassador_focus f on f.profile_id = a.profile_id
  left join public.zs_ambassador_task_log l on l.profile_id = a.profile_id
  where a.status = 'active'
  group by a.profile_id, pr.full_name, pr.username, pr.avatar_url, a.location
  order by count(l.id) filter (where l.status = 'approved') desc, a.joined_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.zs_ambassador_roster(integer) to anon, authenticated;

notify pgrst, 'reload schema';
