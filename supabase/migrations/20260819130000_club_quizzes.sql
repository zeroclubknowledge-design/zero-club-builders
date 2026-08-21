-- Quizzes and assessments inside a club.
--
-- A cohort club is where a bootcamp actually runs, so the assessment belongs
-- there rather than in a separate tool the learners have to be sent to.
--
-- The one thing that shapes everything below: a learner must never be able to
-- read the answer key. Row-level security cannot express "you may read this
-- column but not that one", so the questions table is closed to members
-- entirely and they receive the paper through a function that leaves the
-- correct answers behind. Grading happens in the database for the same reason
-- — a score the browser calculates is a score the browser can choose.

create table if not exists public.club_quizzes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  description text,
  created_by uuid not null references public.profiles(id) on delete cascade,

  -- A draft is invisible to members, so a half-written paper cannot be sat.
  is_published boolean not null default false,

  -- Null means no window; a closed quiz can still be reviewed, not taken.
  opens_at timestamptz,
  closes_at timestamptz,

  pass_mark integer not null default 50 check (pass_mark between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists club_quizzes_club_idx on public.club_quizzes (club_id, created_at desc);

create table if not exists public.club_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.club_quizzes(id) on delete cascade,
  position integer not null default 0,
  prompt text not null,
  -- ["Option A", "Option B", ...] — two or more.
  options jsonb not null,
  correct_index integer not null check (correct_index >= 0),
  points integer not null default 1 check (points > 0),
  created_at timestamptz not null default now()
);

create index if not exists club_quiz_questions_quiz_idx on public.club_quiz_questions (quiz_id, position);

create table if not exists public.club_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.club_quizzes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- { "<question_id>": <chosen index> }
  answers jsonb not null default '{}'::jsonb,
  score integer not null default 0,
  total integer not null default 0,
  submitted_at timestamptz not null default now(),
  unique (quiz_id, profile_id)
);

alter table public.club_quizzes enable row level security;
alter table public.club_quiz_questions enable row level security;
alter table public.club_quiz_attempts enable row level security;

-- ----------------------------------------------------------------- rules ---

create or replace function public.is_club_member(p_club_id uuid, p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id and m.profile_id = coalesce(p_profile_id, auth.uid())
  ) or public.is_club_admin(p_club_id, coalesce(p_profile_id, auth.uid()))
$$;

grant execute on function public.is_club_member(uuid, uuid) to authenticated;

drop policy if exists club_quizzes_read on public.club_quizzes;
create policy club_quizzes_read
  on public.club_quizzes for select to authenticated
  using (
    public.is_club_admin(club_id)
    or (is_published and public.is_club_member(club_id))
  );

drop policy if exists club_quizzes_write on public.club_quizzes;
create policy club_quizzes_write
  on public.club_quizzes for all to authenticated
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

-- Deliberately admin-only, in every direction. Members never touch this table;
-- they get the paper from get_club_quiz below.
drop policy if exists club_quiz_questions_admin on public.club_quiz_questions;
create policy club_quiz_questions_admin
  on public.club_quiz_questions for all to authenticated
  using (exists (
    select 1 from public.club_quizzes q
    where q.id = quiz_id and public.is_club_admin(q.club_id)
  ))
  with check (exists (
    select 1 from public.club_quizzes q
    where q.id = quiz_id and public.is_club_admin(q.club_id)
  ));

drop policy if exists club_quiz_attempts_read on public.club_quiz_attempts;
create policy club_quiz_attempts_read
  on public.club_quiz_attempts for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.club_quizzes q
      where q.id = quiz_id and public.is_club_admin(q.club_id)
    )
  );

-- No insert or update policy: attempts are only ever written by the grader.

-- ------------------------------------------------------------- functions ---

/* The paper, without the answer key. */
create or replace function public.get_club_quiz(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  quiz public.club_quizzes;
  is_admin boolean;
  attempt public.club_quiz_attempts;
  questions jsonb;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into quiz from public.club_quizzes where id = p_quiz_id;
  if quiz.id is null then return jsonb_build_object('found', false); end if;

  is_admin := public.is_club_admin(quiz.club_id);

  if not is_admin then
    if not public.is_club_member(quiz.club_id) then
      raise exception 'Join this club to take its quizzes';
    end if;
    if not quiz.is_published then
      raise exception 'This quiz is not open yet';
    end if;
  end if;

  select * into attempt
  from public.club_quiz_attempts
  where quiz_id = p_quiz_id and profile_id = caller;

  -- The correct answer is included only for the club's admins, and only ever
  -- for them: this is the single place the key can leave the database.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'position', q.position,
      'prompt', q.prompt,
      'options', q.options,
      'points', q.points
    ) || case when is_admin then jsonb_build_object('correct_index', q.correct_index) else '{}'::jsonb end
    order by q.position, q.created_at
  ), '[]'::jsonb)
  into questions
  from public.club_quiz_questions q
  where q.quiz_id = p_quiz_id;

  return jsonb_build_object(
    'found', true,
    'is_admin', is_admin,
    'quiz', jsonb_build_object(
      'id', quiz.id,
      'club_id', quiz.club_id,
      'title', quiz.title,
      'description', quiz.description,
      'pass_mark', quiz.pass_mark,
      'is_published', quiz.is_published,
      'opens_at', quiz.opens_at,
      'closes_at', quiz.closes_at
    ),
    'questions', questions,
    'attempt', case when attempt.id is null then null else jsonb_build_object(
      'score', attempt.score,
      'total', attempt.total,
      'submitted_at', attempt.submitted_at,
      'answers', attempt.answers
    ) end
  );
end;
$$;

/* Marks the paper. One attempt per person: a quiz you can retake until you
   pass is a quiz that measures persistence, not knowledge. */
create or replace function public.submit_club_quiz(p_quiz_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  quiz public.club_quizzes;
  question record;
  chosen integer;
  earned integer := 0;
  possible integer := 0;
  percent integer;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into quiz from public.club_quizzes where id = p_quiz_id;
  if quiz.id is null then raise exception 'Quiz not found'; end if;
  if not quiz.is_published then raise exception 'This quiz is not open'; end if;
  if not public.is_club_member(quiz.club_id) then
    raise exception 'Join this club to take its quizzes';
  end if;
  if quiz.opens_at is not null and now() < quiz.opens_at then
    raise exception 'This quiz has not opened yet';
  end if;
  if quiz.closes_at is not null and now() > quiz.closes_at then
    raise exception 'This quiz has closed';
  end if;
  if exists (select 1 from public.club_quiz_attempts where quiz_id = p_quiz_id and profile_id = caller) then
    raise exception 'You have already taken this quiz';
  end if;

  for question in
    select id, correct_index, points from public.club_quiz_questions where quiz_id = p_quiz_id
  loop
    possible := possible + question.points;
    begin
      chosen := (p_answers ->> question.id::text)::integer;
    exception when others then
      chosen := null;
    end;
    if chosen is not null and chosen = question.correct_index then
      earned := earned + question.points;
    end if;
  end loop;

  if possible = 0 then raise exception 'This quiz has no questions yet'; end if;

  insert into public.club_quiz_attempts (quiz_id, profile_id, answers, score, total)
  values (p_quiz_id, caller, coalesce(p_answers, '{}'::jsonb), earned, possible);

  percent := round((earned::numeric / possible) * 100);

  return jsonb_build_object(
    'score', earned,
    'total', possible,
    'percent', percent,
    'passed', percent >= quiz.pass_mark
  );
end;
$$;

/* Every quiz in a club, with where this person stands on each. */
create or replace function public.list_club_quizzes(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  is_admin boolean;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if not public.is_club_member(p_club_id) then
    return jsonb_build_object('is_admin', false, 'quizzes', '[]'::jsonb);
  end if;

  is_admin := public.is_club_admin(p_club_id);

  return jsonb_build_object(
    'is_admin', is_admin,
    'quizzes', coalesce((
      select jsonb_agg(row order by row->>'created_at' desc)
      from (
        select jsonb_build_object(
          'id', q.id,
          'title', q.title,
          'description', q.description,
          'is_published', q.is_published,
          'pass_mark', q.pass_mark,
          'closes_at', q.closes_at,
          'created_at', q.created_at,
          'question_count', (select count(*) from public.club_quiz_questions x where x.quiz_id = q.id),
          'attempt_count', (select count(*) from public.club_quiz_attempts a where a.quiz_id = q.id),
          'my_score', (select a.score from public.club_quiz_attempts a where a.quiz_id = q.id and a.profile_id = caller),
          'my_total', (select a.total from public.club_quiz_attempts a where a.quiz_id = q.id and a.profile_id = caller)
        ) as row
        from public.club_quizzes q
        where q.club_id = p_club_id
          and (is_admin or q.is_published)
      ) rows
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_club_quiz(uuid) to authenticated;
grant execute on function public.submit_club_quiz(uuid, jsonb) to authenticated;
grant execute on function public.list_club_quizzes(uuid) to authenticated;

notify pgrst, 'reload schema';
