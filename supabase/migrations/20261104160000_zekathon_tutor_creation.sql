begin;

do $$
declare
  definition text := pg_get_functiondef('public.zekathon_action(text,jsonb)'::regprocedure);
  old_check text := $old$if not public.is_zero_club_admin() then raise exception 'Only organizers can create events'; end if;$old$;
  new_check text := $new$if not public.is_zero_club_admin() and not exists (
      select 1 from public.profiles
      where id=caller and lower(btrim(account_type))='tutor' and account_kind is distinct from 'business'
    ) then raise exception 'Only Zero Club admins and Tutor accounts can create Zekathons'; end if;$new$;
begin
  if position(new_check in definition) > 0 then return; end if;
  if position(old_check in definition) = 0 then raise exception 'The Zekathon creation check could not be located'; end if;
  execute replace(definition, old_check, new_check);
end;
$$;

commit;
