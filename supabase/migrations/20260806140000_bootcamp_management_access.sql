-- Let tutors and institutions fully manage the bootcamps they own.
--
-- The earlier collaborator migration added SELECT and UPDATE policies to
-- public.bootcamps but never added INSERT or DELETE. With row security on,
-- that silently blocked creators from publishing a new bootcamp or removing
-- an old one, and the app showed an empty studio instead of an error.

alter table public.bootcamps enable row level security;

-- Read: anyone can see an active bootcamp; owners also see their drafts.
drop policy if exists bootcamps_select_public on public.bootcamps;
create policy bootcamps_select_public
  on public.bootcamps for select
  using (status = 'active' or public.can_manage_bootcamp(id));

-- Create: a signed-in member may create a bootcamp they own.
drop policy if exists bootcamps_insert_own on public.bootcamps;
create policy bootcamps_insert_own
  on public.bootcamps for insert to authenticated
  with check (creator_id = auth.uid());

-- Update: creator, assigned tutor, or the cohort club's administrator.
drop policy if exists bootcamps_update_tutor on public.bootcamps;
create policy bootcamps_update_tutor
  on public.bootcamps for update to authenticated
  using (public.can_manage_bootcamp(id))
  with check (public.can_manage_bootcamp(id));

-- Delete: only the person who created it.
drop policy if exists bootcamps_delete_own on public.bootcamps;
create policy bootcamps_delete_own
  on public.bootcamps for delete to authenticated
  using (creator_id = auth.uid());

-- Institutions manage bootcamps run by the tutors linked to them, as well as
-- the ones they created themselves.
create or replace function public.can_manage_bootcamp(p_bootcamp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bootcamps as bootcamp
    where bootcamp.id = p_bootcamp_id
      and (
        bootcamp.creator_id = auth.uid()
        or bootcamp.assigned_tutor_id = auth.uid()
        or exists (
          select 1
          from public.clubs as club
          join public.club_members as member on member.club_id = club.id
          where club.bootcamp_id = bootcamp.id
            and member.profile_id = auth.uid()
            and member.role = 'Administrator'
        )
        -- An institution can manage bootcamps belonging to its tutors.
        or (
          to_regclass('public.institution_tutors') is not null
          and exists (
            select 1 from public.institution_tutors link
            where link.institution_id = auth.uid()
              and link.tutor_id in (bootcamp.creator_id, bootcamp.assigned_tutor_id)
          )
        )
        or exists (
          select 1 from public.profiles admin
          where admin.id = auth.uid() and coalesce(admin.is_admin, false)
        )
      )
  );
$$;

revoke all on function public.can_manage_bootcamp(uuid) from public;
grant execute on function public.can_manage_bootcamp(uuid) to authenticated;

-- Modules and lessons must follow the same ownership rules, otherwise the
-- curriculum editor saves nothing.
alter table public.modules enable row level security;
alter table public.lessons enable row level security;

drop policy if exists modules_insert_tutor on public.modules;
create policy modules_insert_tutor
  on public.modules for insert to authenticated
  with check (public.can_manage_bootcamp(bootcamp_id));

drop policy if exists modules_update_tutor on public.modules;
create policy modules_update_tutor
  on public.modules for update to authenticated
  using (public.can_manage_bootcamp(bootcamp_id))
  with check (public.can_manage_bootcamp(bootcamp_id));

drop policy if exists modules_delete_tutor on public.modules;
create policy modules_delete_tutor
  on public.modules for delete to authenticated
  using (public.can_manage_bootcamp(bootcamp_id));

drop policy if exists lessons_insert_tutor on public.lessons;
create policy lessons_insert_tutor
  on public.lessons for insert to authenticated
  with check (exists (
    select 1 from public.modules m
    where m.id = module_id and public.can_manage_bootcamp(m.bootcamp_id)
  ));

drop policy if exists lessons_update_tutor on public.lessons;
create policy lessons_update_tutor
  on public.lessons for update to authenticated
  using (exists (
    select 1 from public.modules m
    where m.id = module_id and public.can_manage_bootcamp(m.bootcamp_id)
  ))
  with check (exists (
    select 1 from public.modules m
    where m.id = module_id and public.can_manage_bootcamp(m.bootcamp_id)
  ));

drop policy if exists lessons_delete_tutor on public.lessons;
create policy lessons_delete_tutor
  on public.lessons for delete to authenticated
  using (exists (
    select 1 from public.modules m
    where m.id = module_id and public.can_manage_bootcamp(m.bootcamp_id)
  ));

notify pgrst, 'reload schema';
