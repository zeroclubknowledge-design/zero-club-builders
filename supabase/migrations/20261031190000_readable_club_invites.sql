-- Persist names once so renames do not break shared links.
alter table public.clubs add column if not exists invite_slug text unique;

create or replace function public.club_invite_path(p_club uuid)
returns text language plpgsql security definer set search_path = public as $$
declare slug text; handle text; base text; suffix integer := 1;
begin
  select username into handle from public.profiles where id = auth.uid();
  if handle is null then raise exception 'Please sign in to share a club'; end if;
  select invite_slug, coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'club')
    into slug, base from public.clubs where id = p_club for update;
  if not found then raise exception 'Club not found'; end if;
  if slug is null then
    slug := base;
    loop
      begin
        update public.clubs set invite_slug = slug where id = p_club;
        exit;
      exception when unique_violation then
        suffix := suffix + 1;
        slug := base || '-' || suffix;
      end;
    end loop;
  end if;
  return '/club/' || slug || '/' || handle;
end $$;
revoke all on function public.club_invite_path(uuid) from public, anon;
grant execute on function public.club_invite_path(uuid) to authenticated;

create or replace function public.resolve_club_invite(p_slug text, p_username text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('club_id', c.id, 'inviter_id', p.id)
  from public.clubs c left join public.profiles p on p.username = p_username
  where c.invite_slug = p_slug;
$$;
revoke all on function public.resolve_club_invite(text,text) from public;
grant execute on function public.resolve_club_invite(text,text) to anon, authenticated;
