-- Club link previews, and admins adding members directly.
--
-- Two unrelated-looking problems with one shared cause: get_club_public was
-- written to be maximally cautious, and the club_members insert policy was
-- written for the creator only.

-- Known drift: the app reads clubs.logo_url and it exists in production, but
-- no migration ever created it. Declared here so the function below compiles
-- on a database rebuilt from migrations alone.
alter table public.clubs add column if not exists logo_url text;

-- ----------------------------------------------------------------- preview ---

-- Rewritten for two reasons.
--
-- 1. It only returned banner_url. Clubs set a logo far more often than a
--    banner, so a club with a perfectly good picture previewed with none, and
--    the card fell back to the site-wide Zero Club image.
--
-- 2. Private clubs returned name only — no description, no picture. That was
--    written to avoid leaking what a private club is about. But this function
--    is only reachable by someone holding the club's id, and the only way to
--    hold it is for an admin to have deliberately sent them the invite. The
--    caution was landing on exactly the person the admin was trying to
--    recruit, and made every private club's invite look like a broken link.
--
--    Nothing here exposes a member list, messages, or the owner. If you would
--    rather private clubs stay blank, restore the is_private branch — the rest
--    of this migration does not depend on it.
create or replace function public.get_club_public(club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  club   public.clubs;
  members integer;
begin
  select * into club from public.clubs where id = club_id;

  if club.id is null then
    return jsonb_build_object('found', false);
  end if;

  select count(*) into members from public.club_members where club_members.club_id = club.id;

  return jsonb_build_object(
    'found', true,
    'is_private', coalesce(club.is_private, false),
    'name', club.name,
    'description', club.description,
    -- Logo first: it is the picture a club actually sets.
    'banner_url', coalesce(club.logo_url, club.banner_url),
    'member_count', members
  );
end;
$$;

grant execute on function public.get_club_public(uuid) to anon, authenticated;

-- ------------------------------------------------------------- direct add ---

-- Adds someone to a club without waiting for them to accept an invite.
--
-- The existing RLS lets the club CREATOR insert other people, but not an
-- Administrator, so promoting someone to admin did not actually let them run
-- the squad. Doing it here rather than by widening the policy keeps the
-- permission check in one readable place, and lets the new member be told.
create or replace function public.add_club_member(
  p_club_id uuid,
  p_profile_id uuid,
  p_role text default 'Member'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  club public.clubs;
  caller_role text;
  already boolean;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into club from public.clubs where id = p_club_id;
  if club.id is null then raise exception 'Club not found'; end if;

  select role into caller_role
  from public.club_members
  where club_id = p_club_id and profile_id = caller;

  if club.creator_id <> caller and coalesce(caller_role, '') <> 'Administrator' then
    raise exception 'Only club admins can add members';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'That member does not exist';
  end if;

  select true into already
  from public.club_members
  where club_id = p_club_id and profile_id = p_profile_id;

  if coalesce(already, false) then
    return jsonb_build_object('added', false, 'reason', 'already_a_member');
  end if;

  insert into public.club_members (club_id, profile_id, role)
  values (p_club_id, p_profile_id, coalesce(nullif(btrim(p_role), ''), 'Member'));

  -- Being added to something without asking should be visible, not silent.
  insert into public.notifications (profile_id, actor_id, type, content)
  values (
    p_profile_id,
    caller,
    'system',
    'You were added to ' || club.name
  );

  return jsonb_build_object('added', true);
end;
$$;

grant execute on function public.add_club_member(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
