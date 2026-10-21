-- Focused recording repair. Requires the group_call_reliability migration;
-- independent of the optional group-call cards migration. Safe to rerun.
begin;
alter table public.chat_groups add column if not exists call_recording_by uuid;
alter table public.chat_groups add column if not exists call_recording_started_at timestamptz;
alter table public.chat_groups add column if not exists call_recording_connection uuid;

-- Adopt a valid legacy recording without letting it follow a different call/device.
update public.chat_groups g set call_recording_started_at=g.call_active_since,
  call_recording_connection=c.connection_id
from public.chat_group_call_participants c
where g.call_recording_by=c.profile_id and g.id=c.group_id
  and g.call_recording_started_at is null and c.left_at is null;

create or replace function public.group_call_state_v2(p_group uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare g public.chat_groups; result jsonb; my_role text; recorder_name text;
begin
  select role into my_role from chat_group_members where group_id=p_group and profile_id=auth.uid();
  if my_role is null then raise exception 'Not a group member'; end if;
  perform group_call_sweep_v2(p_group);
  select * into g from chat_groups where id=p_group for update;
  if g.call_recording_by is not null and (
    g.call_active_since is null or g.call_recording_started_at is distinct from g.call_active_since
    or not exists(select 1 from chat_group_call_participants c
      where c.group_id=p_group and c.profile_id=g.call_recording_by and c.left_at is null
        and c.connection_id=g.call_recording_connection
        and greatest(c.last_seen+interval '3 minutes',coalesce(c.lease_until,c.last_seen))>now())
  ) then
    update chat_groups set call_recording_by=null,call_recording_started_at=null,call_recording_connection=null where id=p_group;
    g.call_recording_by:=null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('profile_id',p.id,'uid',c.agora_uid::text,
    'name',coalesce(nullif(btrim(p.full_name),''),nullif(p.username,''),'Member'),
    'avatar',coalesce(nullif(p.avatar_url,''),nullif(u.raw_user_meta_data->>'avatar_url',''),nullif(u.raw_user_meta_data->>'picture','')))), '[]'::jsonb)
    into result from chat_group_call_participants c join profiles p on p.id=c.profile_id
      join chat_group_members m on m.group_id=c.group_id and m.profile_id=c.profile_id
      left join auth.users u on u.id=p.id where c.group_id=p_group and c.left_at is null
      and greatest(c.last_seen+interval '3 minutes',coalesce(c.lease_until,c.last_seen))>now();
  select coalesce(nullif(btrim(full_name),''),nullif(username,''),'Member') into recorder_name
    from profiles where id=g.call_recording_by;
  return jsonb_build_object('active',g.call_active_since is not null,'started_at',g.call_active_since,
    'can_end',my_role in ('owner','admin') or g.call_started_by=auth.uid(),'people',result,
    'call_message_id',to_jsonb(g)->'call_message_id',
    'recording_by',g.call_recording_by,'recording_name',recorder_name);
end $function$;

create or replace function public.set_group_call_recording_v2(
  p_group uuid,p_on boolean,p_started_at timestamptz,p_connection uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare g public.chat_groups; my_role text; me uuid:=auth.uid();
begin
  select role into my_role from chat_group_members where group_id=p_group and profile_id=me;
  if my_role is null then raise exception 'Not a group member'; end if;
  -- Clear abandoned announcements before checking the exclusive recording slot.
  perform group_call_state_v2(p_group);
  select * into g from chat_groups where id=p_group for update;
  if p_on then
    if g.call_active_since is null or g.call_active_since is distinct from p_started_at then
      raise exception 'This call has ended. Rejoin the current call to record.';
    end if;
    if my_role not in ('owner','admin') and g.call_started_by is distinct from me then
      raise exception 'Only the call starter or group admins can record this call';
    end if;
    if p_connection is null or not exists(select 1 from chat_group_call_participants c
      where c.group_id=p_group and c.profile_id=me and c.connection_id=p_connection and c.left_at is null
      and greatest(c.last_seen+interval '3 minutes',coalesce(c.lease_until,c.last_seen))>now()) then
      raise exception 'Please rejoin the call before recording';
    end if;
    if g.call_recording_by is not null and
      (g.call_recording_by<>me or g.call_recording_connection is distinct from p_connection) then
      raise exception 'Someone is already recording this call';
    end if;
    if g.call_recording_by is null then
      update chat_groups set call_recording_by=me,call_recording_started_at=p_started_at,
        call_recording_connection=p_connection where id=p_group;
      perform public.chat_group_system(p_group,public.chat_group_display(me)||' is recording this call',null,'system');
    end if;
  elsif g.call_recording_by=me and g.call_recording_connection=p_connection
    and g.call_recording_started_at=p_started_at then
    -- A late stop from an old tab/call cannot clear a new recorder's notice.
    update chat_groups set call_recording_by=null,call_recording_started_at=null,call_recording_connection=null where id=p_group;
  end if;
  return group_call_state_v2(p_group);
end $function$;

-- Keep already-deployed clients working after applying just this repair.
create or replace function public.set_group_call_recording(p_group uuid,p_on boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare started timestamptz; connection uuid;
begin
  select call_active_since into started from chat_groups where id=p_group;
  select connection_id into connection from chat_group_call_participants
    where group_id=p_group and profile_id=auth.uid();
  return set_group_call_recording_v2(p_group,p_on,started,connection);
end $function$;

revoke execute on function public.set_group_call_recording_v2(uuid,boolean,timestamptz,uuid) from public,anon;
revoke execute on function public.set_group_call_recording(uuid,boolean) from public,anon;
revoke execute on function public.group_call_state_v2(uuid) from public,anon;
grant execute on function public.set_group_call_recording_v2(uuid,boolean,timestamptz,uuid) to authenticated;
grant execute on function public.set_group_call_recording(uuid,boolean) to authenticated;
grant execute on function public.group_call_state_v2(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
