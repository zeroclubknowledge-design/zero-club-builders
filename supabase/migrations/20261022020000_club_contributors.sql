-- APPLIED 2026-10-22 (club_contributors + club_contributors_include_cohorts).
-- Club contributors: who is doing the most for a club's growth.
--
-- Points come only from things the club can see happened:
--   invited a member who joined (via the inviter's club link)  25
--   answered someone else's question                            5
--     (a reply in Q&A, or a reply in General to a message with a "?")
--   asked a question in Q&A                                       3
--   submitted an assignment                                       8  (+ up to 4 more by grade)
--   took a quiz                                                   5  (+3 when passed)
--   took part in General chat                                     1  (counted up to 30 per period)
--   was active on a day (any of the above)                        2  per day  (consistency)
-- The club owner runs the club, so they are not ranked.

create table if not exists public.club_invites (
  -- Plain ids: the counts only ever include people who are still members.
  club_id uuid not null,
  invitee_id uuid not null,
  inviter_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (club_id, invitee_id),
  check (invitee_id <> inviter_id)
);
create index if not exists club_invites_inviter on public.club_invites(club_id, inviter_id);
alter table public.club_invites enable row level security;
revoke all on public.club_invites from public, anon, authenticated;

-- Called by the new member's app after they join through someone's link.
-- Only counts for someone who joined in the last 7 days, once per person per
-- club, and only when the inviter belongs to the club.
create or replace function public.record_club_invite(p_club uuid, p_inviter uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); inserted int;
begin
  if me is null or p_inviter is null or p_inviter = me then return false; end if;
  if not exists (select 1 from club_members where club_id = p_club and profile_id = me and joined_at > now() - interval '7 days') then
    return false;
  end if;
  if not exists (select 1 from club_members where club_id = p_club and profile_id = p_inviter)
     and not exists (select 1 from clubs where id = p_club and creator_id = p_inviter) then
    return false;
  end if;
  insert into club_invites (club_id, invitee_id, inviter_id) values (p_club, me, p_inviter)
  on conflict (club_id, invitee_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end $$;
revoke all on function public.record_club_invite(uuid, uuid) from public, anon;
grant execute on function public.record_club_invite(uuid, uuid) to authenticated;

create or replace function public.club_contributors(p_club uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  me uuid := auth.uid();
  owner uuid;
  since timestamptz := case when coalesce(p_days, 0) <= 0 then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
  rows jsonb;
  -- A community counts its cohorts' activity too (cohorts are child clubs).
  scope uuid[];
begin
  if me is null then raise exception 'Sign in to see contributors'; end if;
  select creator_id into owner from clubs where id = p_club;
  if owner is null then raise exception 'Club not found'; end if;
  scope := array(select id from clubs where id = p_club or parent_club_id = p_club);
  if owner <> me and not exists (select 1 from club_members where club_id = any(scope) and profile_id = me) then
    raise exception 'Join this club to see its contributors';
  end if;

  with members as (
    select distinct on (cm.profile_id) cm.profile_id, cm.role, cm.joined_at from club_members cm
    where cm.club_id = any(scope) and cm.profile_id <> owner and coalesce(cm.status, 'active') = 'active'
    order by cm.profile_id, (cm.club_id = p_club) desc
  ),
  msgs as (
    select m.* from club_messages m
    where m.club_id = any(scope) and m.created_at >= since and m.content not like '::ZEROCLUB_CARD::%'
  ),
  asked as (
    select profile_id, count(*) n from msgs
    where room_id = 'q-and-a' and reply_to_id is null and parent_id is null group by 1
  ),
  answered as (
    select m.profile_id, count(*) n from msgs m
    join club_messages o on o.id = coalesce(m.reply_to_id, m.parent_id)
    where o.profile_id <> m.profile_id
      and (m.room_id = 'q-and-a' or (m.room_id = 'general' and o.content like '%?%'))
    group by 1
  ),
  submitted as (
    select profile_id, count(distinct reply_to_id) n from msgs
    where room_id = 'assignments' and reply_to_id is not null group by 1
  ),
  graded as (
    select student_id as profile_id, sum(score / nullif(max_marks, 0)) g from club_assignment_grades
    where club_id = any(scope) and graded_at >= since group by 1
  ),
  quizzes as (
    select a.profile_id, count(distinct a.quiz_id) n,
      count(distinct a.quiz_id) filter (where a.total > 0 and a.score * 100.0 / a.total >= coalesce(q.pass_mark, 50)) passed
    from club_quiz_attempts a join club_quizzes q on q.id = a.quiz_id
    where q.club_id = any(scope) and a.submitted_at >= since group by 1
  ),
  chatted as (
    select profile_id, count(*) n from msgs where room_id = 'general' group by 1
  ),
  invited as (
    select i.inviter_id as profile_id, count(*) n from club_invites i
    join club_members cm on cm.club_id = i.club_id and cm.profile_id = i.invitee_id
    where i.club_id = any(scope) and i.created_at >= since group by 1
  ),
  active_days as (
    select profile_id, count(distinct (created_at at time zone 'Africa/Lagos')::date) n from (
      select profile_id, created_at from msgs
      union all
      select a.profile_id, a.submitted_at from club_quiz_attempts a join club_quizzes q on q.id = a.quiz_id
      where q.club_id = any(scope) and a.submitted_at >= since
    ) x group by 1
  ),
  scored as (
    select mb.profile_id, mb.role, mb.joined_at,
      coalesce(iv.n, 0) invites, coalesce(an.n, 0) answers, coalesce(ak.n, 0) questions,
      coalesce(sb.n, 0) assignments, coalesce(qz.n, 0) quizzes, coalesce(qz.passed, 0) quizzes_passed,
      coalesce(ch.n, 0) messages, coalesce(ad.n, 0) active_days,
      ( coalesce(iv.n, 0) * 25 + coalesce(an.n, 0) * 5 + coalesce(ak.n, 0) * 3
      + coalesce(sb.n, 0) * 8 + round(coalesce(gr.g, 0) * 4)
      + coalesce(qz.n, 0) * 5 + coalesce(qz.passed, 0) * 3
      + least(coalesce(ch.n, 0), 30) + coalesce(ad.n, 0) * 2 )::int points
    from members mb
    left join invited iv on iv.profile_id = mb.profile_id
    left join answered an on an.profile_id = mb.profile_id
    left join asked ak on ak.profile_id = mb.profile_id
    left join submitted sb on sb.profile_id = mb.profile_id
    left join graded gr on gr.profile_id = mb.profile_id
    left join quizzes qz on qz.profile_id = mb.profile_id
    left join chatted ch on ch.profile_id = mb.profile_id
    left join active_days ad on ad.profile_id = mb.profile_id
  ),
  ranked as (
    select s.*, rank() over (order by s.points desc) as place,
      p.full_name, p.username, p.avatar_url
    from scored s join profiles p on p.id = s.profile_id
    where coalesce(p.account_status, 'active') <> 'suspended'
  )
  select jsonb_build_object(
    'period_days', coalesce(p_days, 0),
    'members', (select count(*) from members),
    'active', (select count(*) from ranked where points > 0),
    'totals', jsonb_build_object(
      'invites', (select coalesce(sum(invites), 0) from ranked),
      'answers', (select coalesce(sum(answers), 0) from ranked),
      'questions', (select coalesce(sum(questions), 0) from ranked),
      'assignments', (select coalesce(sum(assignments), 0) from ranked),
      'quizzes', (select coalesce(sum(quizzes), 0) from ranked)),
    'people', coalesce((select jsonb_agg(to_jsonb(r) - 'joined_at' order by r.points desc, r.full_name)
      from (select * from ranked where points > 0 order by points desc limit 50) r), '[]'::jsonb),
    'me', (select to_jsonb(r) - 'joined_at' from ranked r where r.profile_id = me)
  ) into rows;
  return rows;
end $$;
revoke all on function public.club_contributors(uuid, integer) from public, anon;
grant execute on function public.club_contributors(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
