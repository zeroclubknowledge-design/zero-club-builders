-- Match the profile photo shown in the app, including sign-in provider photos.
begin;
create or replace function public.admin_gift_recipient(p_username text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare recipient public.profiles; photo text;
begin
  if not coalesce(public.is_zero_club_admin(),false) then
    raise exception 'Only Zero Club admins can look up gift recipients';
  end if;
  select * into recipient from public.profiles
  where lower(username)=lower(btrim(ltrim(btrim(p_username),'@')))
    and account_status='active';
  if recipient.id is null then return null; end if;
  select coalesce(nullif(btrim(recipient.avatar_url),''),
    nullif(btrim(u.raw_user_meta_data->>'avatar_url'),''),
    nullif(btrim(u.raw_user_meta_data->>'picture'),'')) into photo
    from auth.users u where u.id=recipient.id;
  return jsonb_build_object('id',recipient.id,'username',recipient.username,
    'full_name',recipient.full_name,'avatar_url',coalesce(photo,nullif(btrim(recipient.avatar_url),'')),
    'account_type',recipient.account_type,'tutor_enabled',recipient.tutor_enabled,'is_admin',recipient.is_admin);
end $$;
revoke all on function public.admin_gift_recipient(text) from public,anon;
grant execute on function public.admin_gift_recipient(text) to authenticated;
commit;
