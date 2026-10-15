-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp on 2026-10-15 (migration "gift_recipient_suggestions", now also matching full names). Kept as a record only. Do not re-run.
begin;
create index if not exists profiles_gift_username_prefix_idx
  on public.profiles (lower(username) text_pattern_ops) where account_status='active';

create or replace function public.admin_search_gift_recipients(p_prefix text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare prefix text:=lower(btrim(ltrim(btrim(coalesce(p_prefix,'')),'@'))); result jsonb;
begin
  if not coalesce(public.is_zero_club_admin(),false) then
    raise exception 'Only Zero Club admins can look up gift recipients';
  end if;
  if prefix='' or length(prefix)>50 then return '[]'::jsonb; end if;
  -- Escape LIKE wildcards: underscores in usernames are literal characters.
  select coalesce(jsonb_agg(public.admin_gift_recipient(matches.username)
    order by lower(matches.username)), '[]'::jsonb) into result
  from (select username from public.profiles
    where account_status='active' and lower(username) like
      replace(replace(replace(prefix,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%'
    order by lower(username) limit 10) matches;
  return result;
end $$;
revoke all on function public.admin_search_gift_recipients(text) from public,anon;
grant execute on function public.admin_search_gift_recipients(text) to authenticated;
commit;
