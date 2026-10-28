begin;
alter table public.bootcamps add column if not exists assigned_tutor_ids uuid[] not null default '{}';
update public.bootcamps set assigned_tutor_ids=array_prepend(assigned_tutor_id,assigned_tutor_ids)
where assigned_tutor_id is not null and not(assigned_tutor_id=any(assigned_tutor_ids));
create index if not exists bootcamps_assigned_tutors_idx on public.bootcamps using gin(assigned_tutor_ids);

create or replace function public.guard_bootcamp_tutor_assignments()
returns trigger language plpgsql security definer set search_path=public as $$
declare chosen uuid[];
begin
  if tg_op='UPDATE' then
    if new.assigned_tutor_ids is distinct from old.assigned_tutor_ids then chosen:=new.assigned_tutor_ids;
    elsif new.assigned_tutor_id is distinct from old.assigned_tutor_id then
      -- Older clients change the primary tutor. Retain other assigned tutors.
      chosen:=case when new.assigned_tutor_id is null then '{}'::uuid[] else
        array_prepend(new.assigned_tutor_id,array_remove(old.assigned_tutor_ids,old.assigned_tutor_id)) end;
    else return new;
    end if;
  else chosen:=coalesce(new.assigned_tutor_ids,'{}');
    if new.assigned_tutor_id is not null then chosen:=array_prepend(new.assigned_tutor_id,chosen); end if;
  end if;
  if auth.uid() is not null and auth.uid() is distinct from new.creator_id then
    raise exception 'Only the bootcamp creator can assign tutors';
  end if;
  select coalesce(array_agg(id order by position),'{}') into chosen from (
    select id,min(position) position from unnest(coalesce(chosen,'{}')) with ordinality ids(id,position)
    where id is not null group by id
  ) clean;
  if cardinality(chosen)>100 then raise exception 'Choose no more than 100 tutors'; end if;
  if exists(select 1 from unnest(chosen) chosen_tutor(id) where not exists(
    select 1 from public.institution_tutors link where link.institution_id=new.creator_id and link.tutor_id=chosen_tutor.id
  )) then raise exception 'Choose tutors who belong to your organization'; end if;
  new.assigned_tutor_ids:=chosen;new.assigned_tutor_id:=chosen[1];
  return new;
end $$;
drop trigger if exists bootcamp_tutor_assignments_guard on public.bootcamps;
create trigger bootcamp_tutor_assignments_guard before insert or update on public.bootcamps
for each row execute function public.guard_bootcamp_tutor_assignments();

-- Remember the previous club role so removing an assignment cannot revoke
-- independently granted administrator access or leave automatic grants behind.
create table if not exists public.bootcamp_tutor_club_access (
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  previous_role text, previous_status text, new_membership boolean not null,
  primary key(bootcamp_id,club_id,tutor_id)
);
alter table public.bootcamp_tutor_club_access enable row level security;
revoke all on public.bootcamp_tutor_club_access from public,anon,authenticated;

create or replace function public.sync_bootcamp_tutor_club_access()
returns trigger language plpgsql security definer set search_path=public as $$
declare access_row record; club_row record; tutor uuid; member_row record; member_exists boolean;
begin
  for access_row in select * from public.bootcamp_tutor_club_access
    where bootcamp_id=new.id and not(tutor_id=any(new.assigned_tutor_ids))
  loop
    if access_row.new_membership then
      delete from public.club_members where club_id=access_row.club_id and profile_id=access_row.tutor_id and role='Administrator';
    else
      update public.club_members set role=access_row.previous_role,status=access_row.previous_status
      where club_id=access_row.club_id and profile_id=access_row.tutor_id and role='Administrator';
    end if;
    delete from public.bootcamp_tutor_club_access where bootcamp_id=new.id and club_id=access_row.club_id and tutor_id=access_row.tutor_id;
  end loop;
  for club_row in select id from public.clubs where bootcamp_id=new.id and creator_id=new.creator_id order by id
  loop
    foreach tutor in array new.assigned_tutor_ids loop
      select role,status into member_row from public.club_members where club_id=club_row.id and profile_id=tutor for update;
      member_exists:=found;
      insert into public.bootcamp_tutor_club_access(bootcamp_id,club_id,tutor_id,previous_role,previous_status,new_membership)
      values(new.id,club_row.id,tutor,member_row.role,member_row.status,not member_exists)
      on conflict do nothing;
      if member_exists then
        update public.club_members set role='Administrator',status='active'
        where club_id=club_row.id and profile_id=tutor and (role,status) is distinct from ('Administrator','active');
      else
        insert into public.club_members(club_id,profile_id,role,status) values(club_row.id,tutor,'Administrator','active');
      end if;
    end loop;
  end loop;
  return new;
end $$;
drop trigger if exists bootcamp_tutor_club_access_sync on public.bootcamps;
create trigger bootcamp_tutor_club_access_sync after insert or update of assigned_tutor_id,assigned_tutor_ids on public.bootcamps
for each row execute function public.sync_bootcamp_tutor_club_access();

create or replace function public.set_bootcamp_tutors(p_bootcamp uuid,p_tutor_ids uuid[])
returns public.bootcamps language plpgsql security definer set search_path=public as $$
declare camp public.bootcamps;
begin
  if auth.uid() is null then raise exception 'Sign in to assign tutors'; end if;
  select * into camp from public.bootcamps where id=p_bootcamp for update;
  if camp.id is null or camp.creator_id is distinct from auth.uid() then
    raise exception 'Only the bootcamp creator can assign tutors';
  end if;
  update public.bootcamps set assigned_tutor_ids=coalesce(p_tutor_ids,'{}'),assigned_tutor_id=p_tutor_ids[1]
  where id=p_bootcamp returning * into camp;
  return camp;
end $$;
revoke all on function public.set_bootcamp_tutors(uuid,uuid[]) from public,anon;
grant execute on function public.set_bootcamp_tutors(uuid,uuid[]) to authenticated;

-- Teaching access covers every assigned tutor. Editing the bootcamp itself
-- remains an owner-only action, independently of club administrator roles.
create or replace function public.can_manage_bootcamp(p_bootcamp_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.bootcamps b where b.id=p_bootcamp_id and (
    b.creator_id=auth.uid() or auth.uid()=any(b.assigned_tutor_ids) or b.assigned_tutor_id=auth.uid()
    or exists(select 1 from public.clubs c join public.club_members m on m.club_id=c.id
      where c.bootcamp_id=b.id and m.profile_id=auth.uid() and m.role='Administrator')
    or exists(select 1 from public.institution_tutors link where link.institution_id=auth.uid()
      and (link.tutor_id=b.creator_id or link.tutor_id=any(b.assigned_tutor_ids)))
    or exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_admin,false))
  ));
$$;
revoke all on function public.can_manage_bootcamp(uuid) from public;
grant execute on function public.can_manage_bootcamp(uuid) to authenticated;
drop policy if exists bootcamps_update_creator_only on public.bootcamps;
create policy bootcamps_update_creator_only on public.bootcamps as restrictive for update to authenticated
using(creator_id=auth.uid()) with check(creator_id=auth.uid());

notify pgrst,'reload schema';
commit;
