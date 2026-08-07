-- ============================================================================
-- Public link previews for clubs
--
-- When a club link is pasted into WhatsApp, X, LinkedIn or iMessage, the
-- preview card is built by a crawler that is NOT signed in and does NOT run
-- JavaScript. Reading the clubs table directly would therefore return nothing,
-- because row-level security quite rightly hides clubs from strangers.
--
-- This function is the narrow, deliberate exception: it returns only the few
-- fields needed to draw a preview card — name, description, banner, member
-- count — and nothing else. No member list, no messages, no owner details.
-- Private clubs return only their name, so an invite link still looks like
-- something rather than nothing, without leaking what the club is about.
-- ============================================================================

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

  -- Private clubs: name only. Enough to confirm the invite is real, not
  -- enough to expose what happens inside.
  if coalesce(club.is_private, false) then
    return jsonb_build_object(
      'found', true,
      'is_private', true,
      'name', club.name,
      'description', null,
      'banner_url', null,
      'member_count', members
    );
  end if;

  return jsonb_build_object(
    'found', true,
    'is_private', false,
    'name', club.name,
    'description', club.description,
    'banner_url', club.banner_url,
    'member_count', members
  );
end;
$$;

grant execute on function public.get_club_public(uuid) to anon, authenticated;
