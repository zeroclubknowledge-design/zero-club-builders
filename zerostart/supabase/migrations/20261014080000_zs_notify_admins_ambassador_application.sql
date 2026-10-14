-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp on 2026-10-14 (migration "zs_notify_admins_ambassador_application").
-- Kept as a record only. Do not re-run.
--
-- Every Zero Club admin gets a notification when someone applies (or re-applies) to be a
-- Zero Ambassador: "<name> applied to become a Zero Ambassador. Review it in Admin → Ambassadors."

create or replace function public.zs_notify_admins_new_application()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare who text;
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then return new; end if;
  select coalesce(nullif(btrim(full_name), ''), '@' || username, 'Someone') into who from public.profiles where id = new.profile_id;
  begin
    insert into public.notifications (recipient_id, actor_id, type, content)
    select pr.id, new.profile_id, 'system',
           who || ' applied to become a Zero Ambassador. Review it in Admin → Ambassadors.'
    from public.profiles pr where pr.is_admin and pr.id <> new.profile_id;
  exception when others then null;
  end;
  return new;
end $$;

create trigger zs_ambassador_applications_notify_admins
after insert or update of status on public.zs_ambassador_applications
for each row execute function public.zs_notify_admins_new_application();
