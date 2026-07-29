-- Let bootcamp creators, assigned tutors, and administrators of the linked
-- bootcamp club manage the bootcamp and its curriculum.

alter table public.bootcamps
  add column if not exists assigned_tutor_id uuid references public.profiles(id) on delete set null;

alter table public.clubs
  add column if not exists bootcamp_id uuid references public.bootcamps(id) on delete cascade;

create index if not exists clubs_bootcamp_id_idx on public.clubs (bootcamp_id);

-- Link legacy temporary clubs where the original title and creator still match.
update public.clubs as club
set bootcamp_id = bootcamp.id
from public.bootcamps as bootcamp
where club.bootcamp_id is null
  and club.category = 'Bootcamp'
  and club.creator_id = bootcamp.creator_id
  and club.name = bootcamp.title;

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
      )
  );
$$;

revoke all on function public.can_manage_bootcamp(uuid) from public;
grant execute on function public.can_manage_bootcamp(uuid) to authenticated;

drop policy if exists clubs_update_bootcamp_managers on public.clubs;
create policy clubs_update_bootcamp_managers
  on public.clubs for update to authenticated
  using (bootcamp_id is not null and public.can_manage_bootcamp(bootcamp_id))
  with check (bootcamp_id is not null and public.can_manage_bootcamp(bootcamp_id));

drop policy if exists bootcamps_select_public on public.bootcamps;
create policy bootcamps_select_public
  on public.bootcamps for select
  using (status = 'active' or public.can_manage_bootcamp(id));

drop policy if exists bootcamps_update_tutor on public.bootcamps;
create policy bootcamps_update_tutor
  on public.bootcamps for update to authenticated
  using (public.can_manage_bootcamp(id))
  with check (public.can_manage_bootcamp(id));

drop policy if exists modules_select_public on public.modules;
create policy modules_select_public
  on public.modules for select
  using (
    exists (
      select 1 from public.bootcamps as bootcamp
      where bootcamp.id = modules.bootcamp_id
        and (bootcamp.status = 'active' or public.can_manage_bootcamp(bootcamp.id))
    )
  );

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

drop policy if exists lessons_select_enrolled on public.lessons;
create policy lessons_select_enrolled
  on public.lessons for select
  using (
    exists (
      select 1
      from public.enrollments as enrollment
      join public.modules as module on module.bootcamp_id = enrollment.bootcamp_id
      where module.id = lessons.module_id
        and enrollment.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.modules as module
      where module.id = lessons.module_id
        and public.can_manage_bootcamp(module.bootcamp_id)
    )
  );

drop policy if exists lessons_insert_tutor on public.lessons;
create policy lessons_insert_tutor
  on public.lessons for insert to authenticated
  with check (
    exists (
      select 1 from public.modules as module
      where module.id = lessons.module_id
        and public.can_manage_bootcamp(module.bootcamp_id)
    )
  );

drop policy if exists lessons_update_tutor on public.lessons;
create policy lessons_update_tutor
  on public.lessons for update to authenticated
  using (
    exists (
      select 1 from public.modules as module
      where module.id = lessons.module_id
        and public.can_manage_bootcamp(module.bootcamp_id)
    )
  )
  with check (
    exists (
      select 1 from public.modules as module
      where module.id = lessons.module_id
        and public.can_manage_bootcamp(module.bootcamp_id)
    )
  );

drop policy if exists lessons_delete_tutor on public.lessons;
create policy lessons_delete_tutor
  on public.lessons for delete to authenticated
  using (
    exists (
      select 1 from public.modules as module
      where module.id = lessons.module_id
        and public.can_manage_bootcamp(module.bootcamp_id)
    )
  );
