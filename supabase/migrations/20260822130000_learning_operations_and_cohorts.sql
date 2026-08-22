-- Cohort and day-to-day learning operations for Tutor Studio and Digital Hub.
--
-- A bootcamp is the product/curriculum. A cohort is a particular intake of
-- learners taking that bootcamp together. Keeping those separate lets an
-- institution run January and April intakes without cloning the curriculum.

create table if not exists public.learning_cohorts (
  id uuid primary key default gen_random_uuid(),
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  lead_tutor_id uuid references public.profiles(id) on delete set null,
  name text not null,
  code text not null default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  status text not null default 'upcoming'
    check (status in ('draft', 'upcoming', 'active', 'completed', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bootcamp_id, code),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists learning_cohorts_bootcamp_idx
  on public.learning_cohorts (bootcamp_id, status, starts_at desc);
create index if not exists learning_cohorts_lead_tutor_idx
  on public.learning_cohorts (lead_tutor_id, status);

create table if not exists public.learning_cohort_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.learning_cohorts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'removed')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  last_activity_at timestamptz,
  unique (cohort_id, profile_id)
);

create index if not exists learning_cohort_members_profile_idx
  on public.learning_cohort_members (profile_id, status);

create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.learning_cohorts(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  meeting_url text,
  location text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index if not exists learning_sessions_cohort_time_idx
  on public.learning_sessions (cohort_id, starts_at);

create table if not exists public.learning_announcements (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.learning_cohorts(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_announcements_cohort_idx
  on public.learning_announcements (cohort_id, is_pinned desc, created_at desc);

alter table public.learning_cohorts enable row level security;
alter table public.learning_cohort_members enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.learning_announcements enable row level security;

-- A tutor or institution that manages the bootcamp must also be able to run
-- its cohort club assessments. This extends the existing helper without
-- changing ordinary permanent-club ownership.
create or replace function public.is_club_admin(p_club_id uuid, p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clubs c
    where c.id = p_club_id and c.creator_id = coalesce(p_profile_id, auth.uid())
  ) or exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.profile_id = coalesce(p_profile_id, auth.uid())
      and m.role = 'Administrator'
  ) or exists (
    select 1 from public.clubs c
    where c.id = p_club_id
      and c.bootcamp_id is not null
      and coalesce(p_profile_id, auth.uid()) = auth.uid()
      and public.can_manage_bootcamp(c.bootcamp_id)
  );
$$;

create or replace function public.can_manage_learning_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.learning_cohorts cohort
    where cohort.id = p_cohort_id
      and public.can_manage_bootcamp(cohort.bootcamp_id)
  );
$$;

revoke all on function public.can_manage_learning_cohort(uuid) from public;
grant execute on function public.can_manage_learning_cohort(uuid) to authenticated;

drop policy if exists learning_cohorts_read on public.learning_cohorts;
create policy learning_cohorts_read on public.learning_cohorts
  for select to authenticated
  using (
    public.can_manage_bootcamp(bootcamp_id)
    or exists (
      select 1 from public.learning_cohort_members member
      where member.cohort_id = id
        and member.profile_id = auth.uid()
        and member.status <> 'removed'
    )
  );

drop policy if exists learning_cohorts_insert on public.learning_cohorts;
create policy learning_cohorts_insert on public.learning_cohorts
  for insert to authenticated
  with check (public.can_manage_bootcamp(bootcamp_id) and created_by = auth.uid());
drop policy if exists learning_cohorts_update on public.learning_cohorts;
create policy learning_cohorts_update on public.learning_cohorts
  for update to authenticated
  using (public.can_manage_bootcamp(bootcamp_id))
  with check (public.can_manage_bootcamp(bootcamp_id));
drop policy if exists learning_cohorts_delete on public.learning_cohorts;
create policy learning_cohorts_delete on public.learning_cohorts
  for delete to authenticated
  using (public.can_manage_bootcamp(bootcamp_id));

drop policy if exists learning_cohort_members_read on public.learning_cohort_members;
create policy learning_cohort_members_read on public.learning_cohort_members
  for select to authenticated
  using (profile_id = auth.uid() or public.can_manage_learning_cohort(cohort_id));

drop policy if exists learning_cohort_members_write on public.learning_cohort_members;
create policy learning_cohort_members_write on public.learning_cohort_members
  for all to authenticated
  using (public.can_manage_learning_cohort(cohort_id))
  with check (public.can_manage_learning_cohort(cohort_id));

drop policy if exists learning_sessions_read on public.learning_sessions;
create policy learning_sessions_read on public.learning_sessions
  for select to authenticated
  using (
    public.can_manage_learning_cohort(cohort_id)
    or exists (
      select 1 from public.learning_cohort_members member
      where member.cohort_id = learning_sessions.cohort_id
        and member.profile_id = auth.uid()
        and member.status <> 'removed'
    )
  );

drop policy if exists learning_sessions_insert on public.learning_sessions;
create policy learning_sessions_insert on public.learning_sessions
  for insert to authenticated
  with check (public.can_manage_learning_cohort(cohort_id) and created_by = auth.uid());
drop policy if exists learning_sessions_update on public.learning_sessions;
create policy learning_sessions_update on public.learning_sessions
  for update to authenticated
  using (public.can_manage_learning_cohort(cohort_id))
  with check (public.can_manage_learning_cohort(cohort_id));
drop policy if exists learning_sessions_delete on public.learning_sessions;
create policy learning_sessions_delete on public.learning_sessions
  for delete to authenticated
  using (public.can_manage_learning_cohort(cohort_id));

drop policy if exists learning_announcements_read on public.learning_announcements;
create policy learning_announcements_read on public.learning_announcements
  for select to authenticated
  using (
    public.can_manage_learning_cohort(cohort_id)
    or exists (
      select 1 from public.learning_cohort_members member
      where member.cohort_id = learning_announcements.cohort_id
        and member.profile_id = auth.uid()
        and member.status <> 'removed'
    )
  );

drop policy if exists learning_announcements_insert on public.learning_announcements;
create policy learning_announcements_insert on public.learning_announcements
  for insert to authenticated
  with check (public.can_manage_learning_cohort(cohort_id) and created_by = auth.uid());
drop policy if exists learning_announcements_update on public.learning_announcements;
create policy learning_announcements_update on public.learning_announcements
  for update to authenticated
  using (public.can_manage_learning_cohort(cohort_id))
  with check (public.can_manage_learning_cohort(cohort_id));
drop policy if exists learning_announcements_delete on public.learning_announcements;
create policy learning_announcements_delete on public.learning_announcements
  for delete to authenticated
  using (public.can_manage_learning_cohort(cohort_id));

-- Give every existing bootcamp a usable first cohort. Institutions and tutors
-- can rename it or create additional intakes from their studio.
insert into public.learning_cohorts (
  bootcamp_id, created_by, lead_tutor_id, name, status, starts_at, ends_at
)
select
  bootcamp.id,
  bootcamp.creator_id,
  bootcamp.assigned_tutor_id,
  bootcamp.title || ' · Cohort 1',
  case
    when bootcamp.ends_at is not null and bootcamp.ends_at < now() then 'completed'
    when bootcamp.starts_at is not null and bootcamp.starts_at > now() then 'upcoming'
    when lower(coalesce(bootcamp.status, '')) = 'active' then 'active'
    else 'draft'
  end,
  bootcamp.starts_at,
  bootcamp.ends_at
from public.bootcamps bootcamp
where not exists (
  select 1 from public.learning_cohorts cohort where cohort.bootcamp_id = bootcamp.id
);

-- Existing learners belong to the first cohort so the new dashboard is useful
-- immediately instead of showing an empty roster after deployment.
insert into public.learning_cohort_members (cohort_id, profile_id, joined_at)
select cohort.id, enrollment.profile_id, coalesce(enrollment.enrolled_at, now())
from public.enrollments enrollment
join lateral (
  select item.id
  from public.learning_cohorts item
  where item.bootcamp_id = enrollment.bootcamp_id
  order by item.created_at asc
  limit 1
) cohort on true
on conflict (cohort_id, profile_id) do nothing;

notify pgrst, 'reload schema';
