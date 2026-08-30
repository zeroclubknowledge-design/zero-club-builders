-- Numbers the front door can show, to people who have no account.
--
-- The landing page is read overwhelmingly by strangers, and row-level security
-- correctly hides the tables these counts come from. Counting on the client is
-- therefore impossible, and hardcoding is how a page ends up claiming "2000+
-- enterprises" that do not exist.
--
-- This returns totals and nothing else — no names, no rows, no way to page
-- through anybody. A count is not private; the people behind it are.

create or replace function public.get_landing_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  builders bigint := 0;
  clubs bigint := 0;
  bootcamps bigint := 0;
  projects bigint := 0;
begin
  -- Each count is guarded on its own. A table that does not exist in some
  -- environment should cost that one number, not the whole page.
  begin
    select count(*) into builders from public.profiles;
  exception when others then builders := 0;
  end;

  begin
    select count(*) into clubs from public.clubs where coalesce(is_private, false) = false;
  exception when others then clubs := 0;
  end;

  begin
    select count(*) into bootcamps from public.bootcamps;
  exception when others then bootcamps := 0;
  end;

  begin
    select count(*) into projects from public.posts where coalesce(is_build_post, false) = true;
  exception when others then projects := 0;
  end;

  return jsonb_build_object(
    'builders', builders,
    'clubs', clubs,
    'bootcamps', bootcamps,
    'projects', projects
  );
end;
$$;

grant execute on function public.get_landing_stats() to anon, authenticated;

notify pgrst, 'reload schema';
