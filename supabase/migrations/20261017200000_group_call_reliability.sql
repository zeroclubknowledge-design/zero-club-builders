-- Keep RTC membership, background presence and explicit call termination separate.
begin;
alter table public.chat_group_call_participants add column if not exists lease_until timestamptz;
alter table public.chat_group_call_participants add column if not exists connection_id uuid;
alter table public.chat_group_call_participants add column if not exists left_at timestamptz;

create or replace function public.group_call_sweep_v2(p_group uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare started timestamptz; call_id uuid; any_ended boolean:=false;
begin
  if p_group is null then
    for call_id in select id from chat_groups where call_active_since is not null order by id loop
      if group_call_sweep_v2(call_id) then any_ended:=true; end if;
    end loop;
    return any_ended;
  end if;
  select call_active_since into started from chat_groups where id=p_group for update;
  if started is null then return false; end if;
  if started>now()-interval '3 minutes' or exists(
    select 1 from chat_group_call_participants where group_id=p_group and left_at is null
      and greatest(last_seen+interval '3 minutes',coalesce(lease_until,last_seen))>now()
  ) then return false; end if;
  update chat_groups set call_active_since=null,call_started_by=null where id=p_group;
  delete from chat_group_call_participants where group_id=p_group;
  update call_rings set ended_at=now() where kind='group_call' and target_id=p_group and ended_at is null;
  return true;
end $$;
revoke all on function public.group_call_sweep_v2(uuid) from public,anon,authenticated;

create or replace function public.group_call_state_v2(p_group uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare g public.chat_groups; result jsonb; my_role text;
begin
  select role into my_role from chat_group_members where group_id=p_group and profile_id=auth.uid();
  if my_role is null then raise exception 'Not a group member'; end if;
  perform group_call_sweep_v2(p_group);
  select * into g from chat_groups where id=p_group;
  select coalesce(jsonb_agg(jsonb_build_object('profile_id',p.id,'uid',c.agora_uid::text,
    'name',coalesce(nullif(btrim(p.full_name),''),nullif(p.username,''),'Member'),
    'avatar',coalesce(nullif(p.avatar_url,''),nullif(u.raw_user_meta_data->>'avatar_url',''),nullif(u.raw_user_meta_data->>'picture','')))), '[]'::jsonb)
    into result from chat_group_call_participants c join profiles p on p.id=c.profile_id
      join chat_group_members m on m.group_id=c.group_id and m.profile_id=c.profile_id
      left join auth.users u on u.id=p.id where c.group_id=p_group and c.left_at is null
      and greatest(c.last_seen+interval '3 minutes',coalesce(c.lease_until,c.last_seen))>now();
  return jsonb_build_object('active',g.call_active_since is not null,'started_at',g.call_active_since,
    'can_end',my_role in ('owner','admin') or g.call_started_by=auth.uid(),'people',result);
end $$;

create or replace function public.group_call_heartbeat_v2(p_group uuid,p_uid bigint,p_started_at timestamptz,p_connection uuid,p_background boolean default false,p_join boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare g public.chat_groups;
begin
  if not exists(select 1 from chat_group_members where group_id=p_group and profile_id=auth.uid()) then raise exception 'Not a group member'; end if;
  if p_uid<1 or p_uid>4294967295 then raise exception 'Invalid call identifier'; end if;
  select * into g from chat_groups where id=p_group for update;
  if g.call_active_since is null or g.call_active_since is distinct from p_started_at then
    return jsonb_build_object('active',false,'people','[]'::jsonb);
  end if;
  if p_connection is null then raise exception 'Missing connection identifier'; end if;
  if exists(select 1 from chat_group_call_participants where group_id=p_group and profile_id=auth.uid()
    and ((connection_id=p_connection and left_at is not null) or (not p_join and connection_id is distinct from p_connection))) then
    return jsonb_build_object('active',false,'replaced',true);
  end if;
  insert into chat_group_call_participants(group_id,profile_id,agora_uid,joined_at,last_seen,lease_until,connection_id,left_at)
    values(p_group,auth.uid(),p_uid,now(),now(),now()+case when p_background then interval '15 minutes' else interval '3 minutes' end,p_connection,null)
    on conflict(group_id,profile_id) do update set agora_uid=excluded.agora_uid,last_seen=excluded.last_seen,lease_until=excluded.lease_until,connection_id=excluded.connection_id,left_at=null;
  update call_rings set ended_at=now() where kind='group_call' and target_id=p_group and recipient_id=auth.uid() and ended_at is null;
  return group_call_state_v2(p_group);
end $$;

create or replace function public.group_call_leave_v2(p_group uuid,p_started_at timestamptz,p_connection uuid,p_end_for_everyone boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare g public.chat_groups; my_role text; ended boolean;
begin
  select role into my_role from chat_group_members where group_id=p_group and profile_id=auth.uid();
  if my_role is null then raise exception 'Not a group member'; end if;
  select * into g from chat_groups where id=p_group for update;
  if g.call_active_since is distinct from p_started_at then return jsonb_build_object('ended',false,'stale',true); end if;
  if exists(select 1 from chat_group_call_participants where group_id=p_group and profile_id=auth.uid() and connection_id is distinct from p_connection) then
    return jsonb_build_object('ended',false,'stale',true);
  end if;
  if p_end_for_everyone and my_role not in ('owner','admin') and g.call_started_by is distinct from auth.uid() then raise exception 'Only the call starter or group admins can end the call for everyone'; end if;
  update chat_group_call_participants set left_at=now(),lease_until=now() where group_id=p_group and profile_id=auth.uid();
  ended:=p_end_for_everyone or not exists(select 1 from chat_group_call_participants where group_id=p_group and left_at is null
    and greatest(last_seen+interval '3 minutes',coalesce(lease_until,last_seen))>now());
  if ended then
    update chat_groups set call_active_since=null,call_started_by=null where id=p_group;
    delete from chat_group_call_participants where group_id=p_group;
    update call_rings set ended_at=now() where kind='group_call' and target_id=p_group and ended_at is null;
  end if;
  return jsonb_build_object('ended',ended);
end $$;

-- Existing inbox/start-call readers may still invoke the old sweep. Keep its
-- signature/return type, but route it through the same lease-aware decision.
do $$
declare f record; result text; body text; invocation text;
begin
  for f in select p.oid,p.proname,p.pronargs from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='chat_group_call_sweep'
    and (p.pronargs=0 or (p.pronargs=1 and p.proargtypes[0]='uuid'::regtype)) loop
    result:=pg_get_function_result(f.oid);
    invocation:=case when f.pronargs=0 then 'public.group_call_sweep_v2(null)' else 'public.group_call_sweep_v2($1)' end;
    body:=case result when 'void' then 'perform '||invocation||'; return;'
      when 'boolean' then 'return '||invocation||';'
      when 'jsonb' then 'return jsonb_build_object(''ended'','||invocation||');'
      else null end;
    if body is null then raise exception 'Unsupported group call sweep return type: %',result; end if;
    execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path=public as %L',f.proname,pg_get_function_arguments(f.oid),result,'begin '||body||' end');
  end loop;
end $$;
revoke all on function public.group_call_state_v2(uuid),public.group_call_heartbeat_v2(uuid,bigint,timestamptz,uuid,boolean,boolean),public.group_call_leave_v2(uuid,timestamptz,uuid,boolean) from public,anon;
grant execute on function public.group_call_state_v2(uuid),public.group_call_heartbeat_v2(uuid,bigint,timestamptz,uuid,boolean,boolean),public.group_call_leave_v2(uuid,timestamptz,uuid,boolean) to authenticated;
commit;
