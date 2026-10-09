-- A tutor approval is a decision made by a Zero Club admin. Keep that admin
-- as the notification actor so their current profile photo can be displayed.
create or replace function public.set_tutor_approval_notification_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'system'
     and new.actor_id is null
     and new.content ilike '%approved as a Zero Club Tutor%'
     and auth.uid() is not null
     and public.is_zero_club_admin() then
    new.actor_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_tutor_approval_notification_actor on public.notifications;
create trigger set_tutor_approval_notification_actor
before insert on public.notifications
for each row execute function public.set_tutor_approval_notification_actor();

-- Repair older notices when the application recorded the reviewing admin.
do $$
begin
  if to_regclass('public.tutor_applications') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tutor_applications' and column_name = 'reviewed_by')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tutor_applications' and column_name = 'profile_id') then
    execute $sql$
      update public.notifications as n
      set actor_id = a.reviewed_by
      from public.tutor_applications as a
      where n.type = 'system'
        and n.actor_id is null
        and n.content ilike '%approved as a Zero Club Tutor%'
        and n.recipient_id = a.profile_id
        and a.reviewed_by is not null
    $sql$;
  end if;
end;
$$;
