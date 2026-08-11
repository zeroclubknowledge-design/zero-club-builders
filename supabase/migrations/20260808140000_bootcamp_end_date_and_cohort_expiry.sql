-- Bootcamps: an end date, and what it means for the cohort club.
--
-- A bootcamp already had starts_at but no end, so its cohort club lived
-- forever. That quietly consumes the creator's club allowance and leaves
-- finished cohorts sitting in Discover as if they were still running.
--
-- After ends_at the cohort club becomes a read-only archive that only the
-- people who took the bootcamp can still open. Nobody loses their notes or
-- chat history - they paid for the course and the material is their proof -
-- but it stops appearing to strangers and stops accepting new posts.
--
-- Expiry is evaluated when a club is read, not by a scheduled job. Supabase
-- projects do not have pg_cron enabled by default, and a nightly job that
-- silently stops running would leave clubs in the wrong state indefinitely.
-- Deriving it from ends_at cannot drift.

alter table public.bootcamps
  add column if not exists ends_at timestamptz;

comment on column public.bootcamps.ends_at is
  'When the bootcamp finishes. After this the cohort club is read-only and '
  'visible only to enrolled learners. Null means no scheduled end.';

-- A bootcamp cannot end before it starts.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bootcamps_end_after_start'
  ) then
    alter table public.bootcamps
      add constraint bootcamps_end_after_start
      check (ends_at is null or starts_at is null or ends_at >= starts_at)
      not valid; -- existing rows are not re-checked
  end if;
end $$;

-- ------------------------------------------------------------- helpers ---

-- True once a cohort club's bootcamp has finished. Permanent clubs and
-- bootcamps with no end date are never expired.
create or replace function public.is_cohort_club_expired(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clubs club
    join public.bootcamps camp on camp.id = club.bootcamp_id
    where club.id = p_club_id
      and club.club_type = 'bootcamp_cohort'
      and camp.ends_at is not null
      and camp.ends_at < now()
  );
$$;

-- True when the caller took the bootcamp behind this club, created it, or
-- teaches it. Used to decide who may still open an expired cohort club.
create or replace function public.can_view_expired_cohort_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clubs club
    left join public.bootcamps camp on camp.id = club.bootcamp_id
    where club.id = p_club_id
      and (
        club.creator_id = auth.uid()
        or camp.creator_id = auth.uid()
        or camp.assigned_tutor_id = auth.uid()
        or exists (
          select 1 from public.enrollments e
          where e.bootcamp_id = club.bootcamp_id
            and e.profile_id = auth.uid()
        )
        or exists (
          select 1 from public.club_members m
          where m.club_id = club.id
            and m.profile_id = auth.uid()
            and m.status = 'active'
        )
      )
  );
$$;

-- --------------------------------------------------------------- rls ---

-- Clubs were readable by everyone. That stays true for every club except an
-- expired cohort, which narrows to the people who were part of it.
-- The conditions are written inline rather than as calls to the helper
-- functions above. A policy runs once per candidate row, and a SECURITY
-- DEFINER function call per row defeats the planner - noticeable as soon as a
-- club listing returns more than a handful of rows. The helpers stay for the
-- application to use; this expression is what the database evaluates.
drop policy if exists "clubs_select_public" on public.clubs;
create policy "clubs_select_public"
  on public.clubs for select
  using (
    -- Not an expired cohort: unchanged, readable by anyone.
    not exists (
      select 1
      from public.bootcamps camp
      where camp.id = clubs.bootcamp_id
        and clubs.club_type = 'bootcamp_cohort'
        and camp.ends_at is not null
        and camp.ends_at < now()
    )
    -- Expired, but the caller was part of it.
    or clubs.creator_id = auth.uid()
    or exists (
      select 1 from public.bootcamps camp
      where camp.id = clubs.bootcamp_id
        and (camp.creator_id = auth.uid() or camp.assigned_tutor_id = auth.uid())
    )
    or exists (
      select 1 from public.enrollments e
      where e.bootcamp_id = clubs.bootcamp_id
        and e.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.club_members m
      where m.club_id = clubs.id
        and m.profile_id = auth.uid()
        and m.status = 'active'
    )
  );

comment on function public.is_cohort_club_expired(uuid) is
  'A cohort club is expired once its bootcamp ends_at has passed. Derived on '
  'read so it cannot fall out of step with the bootcamp.';
