-- ===========================================================================
-- ZeroStart becomes the Zero Ambassador platform.
--
-- The old model asked a builder to list an MVP and recruit testers. The new
-- one asks an ambassador to pick the growth levers they will pull for Zero
-- Club, in their own place, and then tracks what they actually did.
--
-- The zs_mvps / zs_campaigns tables are left in place rather than dropped.
-- Nothing reads them any more, but dropping tables that may hold real rows is
-- a one-way door, and there is no cost to leaving them until it is certain
-- they are empty.
-- ===========================================================================

-- ------------------------------------------------------ growth levers ------
/*
 * The things an ambassador can choose to do.
 *
 * A table rather than an enum, so the list can change from the admin side
 * without a migration — the whole point of the pivot is that Zero Club will
 * learn which levers actually move growth and will want to reweight them.
 */
create table if not exists public.zs_focus_areas (
  slug text primary key,
  label text not null,
  description text not null,
  icon text,
  sort_order integer not null default 0,
  active boolean not null default true
);

insert into public.zs_focus_areas (slug, label, description, icon, sort_order) values
  ('builders',     'Bring builders',        'Get people signed up and actually posting their work.',            'users',        10),
  ('bootcamps',    'Fill bootcamps',        'Push specific bootcamps to people near you and get them enrolled.', 'graduation',   20),
  ('clubs',        'Grow clubs',            'Start or grow a focused club and keep the conversation alive.',     'message',      30),
  ('campus',       'Represent on campus',   'Be the Zero Club face at your school or campus community.',         'school',       40),
  ('content',      'Create and share',      'Make content about Zero Club and put it where your people are.',    'megaphone',    50),
  ('events',       'Run meetups',           'Organise local sessions, workshops, and build nights.',             'calendar',     60),
  ('tutors',       'Recruit tutors',        'Find people who can teach and bring them in to run bootcamps.',     'presentation', 70),
  ('institutions', 'Open institutions',     'Introduce schools, hubs, and organisations to Zero Club.',          'building',     80)
on conflict (slug) do update
  set label = excluded.label,
      description = excluded.description,
      icon = excluded.icon,
      sort_order = excluded.sort_order;

alter table public.zs_focus_areas enable row level security;

drop policy if exists zs_focus_areas_read on public.zs_focus_areas;
create policy zs_focus_areas_read on public.zs_focus_areas
  for select to anon, authenticated using (true);

-- -------------------------------------------------------- ambassadors ------
create table if not exists public.zs_ambassadors (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  -- Where they represent. Free text on purpose: "Yaba, Lagos" and "Nsukka" are
  -- both useful, and a fixed list of regions would be wrong within a month.
  location text not null check (length(btrim(location)) between 2 and 120),
  country text,
  bio text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'removed')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* The levers this ambassador picked. */
create table if not exists public.zs_ambassador_focus (
  profile_id uuid not null references public.zs_ambassadors(profile_id) on delete cascade,
  focus_slug text not null references public.zs_focus_areas(slug) on delete cascade,
  primary key (profile_id, focus_slug)
);

/* Bootcamps they have committed to push locally. */
create table if not exists public.zs_ambassador_bootcamps (
  profile_id uuid not null references public.zs_ambassadors(profile_id) on delete cascade,
  bootcamp_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (profile_id, bootcamp_id)
);

/*
 * Task completions, decided by an admin.
 *
 * The task itself lives in Zero Club's quests table with audience = ambassador.
 * This records who did it and when it was signed off, because nothing in the
 * database can prove a meetup happened.
 */
create table if not exists public.zs_ambassador_task_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.zs_ambassadors(profile_id) on delete cascade,
  quest_id uuid not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected')),
  evidence text,
  evidence_url text,
  note text,
  reviewed_by uuid references public.profiles(id),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  zp_awarded integer not null default 0,
  -- One submission per task per ambassador. Re-doing a repeatable task is a
  -- later problem; letting the same one be submitted five times is not.
  unique (profile_id, quest_id)
);

create index if not exists zs_task_log_pending_idx
  on public.zs_ambassador_task_log (status, submitted_at);

alter table public.zs_ambassadors           enable row level security;
alter table public.zs_ambassador_focus      enable row level security;
alter table public.zs_ambassador_bootcamps  enable row level security;
alter table public.zs_ambassador_task_log   enable row level security;

/* An ambassador roster is public — that is rather the point of being one. */
drop policy if exists zs_ambassadors_read on public.zs_ambassadors;
create policy zs_ambassadors_read on public.zs_ambassadors
  for select to anon, authenticated using (status = 'active' or profile_id = auth.uid() or public.is_zero_club_admin());

drop policy if exists zs_ambassadors_self_write on public.zs_ambassadors;
create policy zs_ambassadors_self_write on public.zs_ambassadors
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists zs_ambassadors_self_update on public.zs_ambassadors;
create policy zs_ambassadors_self_update on public.zs_ambassadors
  for update to authenticated
  using (profile_id = auth.uid())
  -- They can pause themselves, but not un-remove themselves.
  with check (profile_id = auth.uid() and status in ('active', 'paused'));

drop policy if exists zs_focus_read on public.zs_ambassador_focus;
create policy zs_focus_read on public.zs_ambassador_focus
  for select to anon, authenticated using (true);

drop policy if exists zs_focus_self on public.zs_ambassador_focus;
create policy zs_focus_self on public.zs_ambassador_focus
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists zs_amb_bootcamps_read on public.zs_ambassador_bootcamps;
create policy zs_amb_bootcamps_read on public.zs_ambassador_bootcamps
  for select to anon, authenticated using (true);

drop policy if exists zs_amb_bootcamps_self on public.zs_ambassador_bootcamps;
create policy zs_amb_bootcamps_self on public.zs_ambassador_bootcamps
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

/* A task log is between the ambassador and the reviewers. */
drop policy if exists zs_task_log_read on public.zs_ambassador_task_log;
create policy zs_task_log_read on public.zs_ambassador_task_log
  for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());

drop policy if exists zs_task_log_submit on public.zs_ambassador_task_log;
create policy zs_task_log_submit on public.zs_ambassador_task_log
  for insert to authenticated
  with check (profile_id = auth.uid() and status = 'submitted');

-- ------------------------------------------------------------- levels ------
/*
 * Level is derived from approved tasks, never stored.
 *
 * Stored levels go stale the moment the thresholds move and then need
 * backfilling. This is the same reasoning the tester levels used, and the same
 * function shape, so the two agree.
 */
create or replace function public.zs_ambassador_level(p_approved integer)
returns text
language sql
immutable
as $$
  select case
    when p_approved >= 40 then 'Regional Lead'
    when p_approved >= 20 then 'Lead Ambassador'
    when p_approved >= 8  then 'Active Ambassador'
    when p_approved >= 1  then 'Ambassador'
    else 'New Ambassador'
  end;
$$;

notify pgrst, 'reload schema';
