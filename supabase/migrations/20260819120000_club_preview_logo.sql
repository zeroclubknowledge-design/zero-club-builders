-- A shared club link should preview as the club: its picture and its
-- description, not the generic Zero Club card.
--
-- This supersedes the version in 20260813120000 and does not depend on it, so
-- it is safe to run whether or not that migration was ever applied. The only
-- change is that the club's own picture and its banner are returned as two
-- separate fields. They were previously collapsed into one key, which meant
-- the page could not prefer the logo and fall back to the banner — it took
-- whatever the database had decided, and a club with both got the wrong one.

create or replace function public.get_club_public(club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  club    public.clubs;
  members integer;
begin
  select * into club from public.clubs where id = club_id;

  if club.id is null then
    return jsonb_build_object('found', false);
  end if;

  select count(*) into members
  from public.club_members
  where club_members.club_id = club.id;

  return jsonb_build_object(
    'found', true,
    'is_private', coalesce(club.is_private, false),
    'name', club.name,
    'description', club.description,
    'logo_url', club.logo_url,
    -- Kept so an older deployed build still finds a picture under the key it
    -- expects, rather than previewing with none while the new build ships.
    'banner_url', coalesce(club.logo_url, club.banner_url),
    'club_banner_url', club.banner_url,
    'member_count', members
  );
end;
$$;

grant execute on function public.get_club_public(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
