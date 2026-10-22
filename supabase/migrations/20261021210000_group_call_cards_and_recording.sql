-- DO NOT APPLY: superseded. Recording went live separately (set_group_call_recording_v2) and the card fix
-- went live as 20261022040000_group_call_single_card.sql. Applying this would undo newer recording logic.
-- NOT YET APPLIED (the apply was cancelled on 2026-10-21). Apply to project
-- tiyifgfsuzhcvdvntjmp to switch on: one chat card per group call (rewritten to
-- "Group call · N min · started by …" however the call ends) and call recording
-- (set_group_call_recording + REC for everyone). The app already handles both:
-- until this runs, Join shows only on the running call and Record explains it's not on yet.

-- Group calls: one chat card per call, and call recording.
--
-- Before: every new call posted "<name> started a group call"; a call that
-- ended because everyone left or dropped out posted nothing, so old cards kept
-- looking live (and the app showed Join on all of them). Now the start card is
-- remembered (chat_groups.call_message_id) and, however the call ends, that
-- same card is rewritten to "Group call · N min · started by …".
--
-- Recording: the call starter or a group admin can mark the call as being
-- recorded (chat_groups.call_recording_by). Everyone in the call sees it via
-- group_call_state_v2, and the chat gets a short note when recording starts.

alter table public.chat_groups add column if not exists call_message_id uuid;
alter table public.chat_groups add column if not exists call_recording_by uuid;

-- Rewrite the current call's card as finished. Call before clearing call_active_since.
create or replace function public.group_call_close_card(p_group uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare g public.chat_groups; mins int; starter text;
begin
  select * into g from chat_groups where id = p_group;
  if g.call_message_id is null or g.call_active_since is null then return; end if;
  mins := greatest(1, ceil(extract(epoch from now() - g.call_active_since) / 60.0)::int);
  starter := coalesce(public.chat_group_display(g.call_started_by), 'a member');
  update chat_group_messages
     set content = 'Group call · ' || mins || ' min · started by ' || starter
   where id = g.call_message_id and kind = 'call';
  update chat_groups set call_message_id = null, call_recording_by = null where id = p_group;
end $function$;

create or replace function public.start_chat_group_call(p_group uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); g public.chat_groups; mid uuid;
begin
  if not public.is_chat_group_member(p_group) then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  select * into g from public.chat_groups where id = p_group for update;
  if g.call_active_since is null or g.call_active_since < now() - interval '6 hours' then
    -- A stale call (over 6 hours) is closed properly before a new one starts.
    if g.call_active_since is not null then perform public.group_call_close_card(p_group); end if;
    mid := public.chat_group_system(p_group, public.chat_group_display(me) || ' started a group call', me, 'call');
    update public.chat_groups
       set call_active_since = now(), call_started_by = me, call_message_id = mid, call_recording_by = null
     where id = p_group;
    insert into public.call_rings (recipient_id, caller_id, kind, target_id, title, subtitle, avatar_url, url)
    select m.profile_id, me, 'group_call', p_group, g.name,
           public.chat_group_display(me) || ' is calling the group', g.avatar_url, '/app/chat/g/' || p_group || '/call'
    from public.chat_group_members m
    where m.group_id = p_group and m.profile_id <> me and not m.muted;
    return jsonb_build_object('ok', true, 'channel', 'grp-' || g.call_key, 'started', true, 'name', g.name, 'avatar_url', g.avatar_url);
  end if;
  -- A call is already running: this is a join, never a second "started" card.
  return jsonb_build_object('ok', true, 'channel', 'grp-' || g.call_key, 'started', false, 'name', g.name, 'avatar_url', g.avatar_url);
end $function$;

create or replace function public.end_chat_group_call(p_group uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare g public.chat_groups;
begin
  if not public.is_chat_group_member(p_group) then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  select * into g from public.chat_groups where id = p_group for update;
  update public.call_rings set ended_at = now(), ended_reason = 'ended'
  where kind = 'group_call' and target_id = p_group and ended_at is null;
  if g.call_active_since is null then return jsonb_build_object('ok', true); end if;
  perform public.group_call_close_card(p_group);
  update public.chat_groups set call_active_since = null, call_started_by = null where id = p_group;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.group_call_sweep_v2(p_group uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
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
  perform group_call_close_card(p_group);
  update chat_groups set call_active_since=null,call_started_by=null where id=p_group;
  delete from chat_group_call_participants where group_id=p_group;
  update call_rings set ended_at=now() where kind='group_call' and target_id=p_group and ended_at is null;
  return true;
end $function$;

create or replace function public.group_call_leave_v2(p_group uuid, p_started_at timestamptz, p_connection uuid, p_end_for_everyone boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
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
  -- The person recording left: the recording flag goes with them.
  if g.call_recording_by = auth.uid() then update chat_groups set call_recording_by = null where id = p_group; end if;
  ended:=p_end_for_everyone or not exists(select 1 from chat_group_call_participants where group_id=p_group and left_at is null
    and greatest(last_seen+interval '3 minutes',coalesce(lease_until,last_seen))>now());
  if ended then
    perform group_call_close_card(p_group);
    update chat_groups set call_active_since=null,call_started_by=null where id=p_group;
    delete from chat_group_call_participants where group_id=p_group;
    update call_rings set ended_at=now() where kind='group_call' and target_id=p_group and ended_at is null;
  end if;
  return jsonb_build_object('ended',ended);
end $function$;

create or replace function public.group_call_state_v2(p_group uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
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
    'can_end',my_role in ('owner','admin') or g.call_started_by=auth.uid(),'people',result,
    'call_message_id',g.call_message_id,
    'recording_by',g.call_recording_by,
    'recording_name',case when g.call_recording_by is null then null else public.chat_group_display(g.call_recording_by) end);
end $function$;

-- Mark the current call as being recorded (or not). Starter/admins only.
create or replace function public.set_group_call_recording(p_group uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare g public.chat_groups; my_role text;
begin
  select role into my_role from chat_group_members where group_id=p_group and profile_id=auth.uid();
  if my_role is null then raise exception 'Not a group member'; end if;
  select * into g from chat_groups where id=p_group for update;
  if g.call_active_since is null then raise exception 'There is no call to record'; end if;
  if my_role not in ('owner','admin') and g.call_started_by is distinct from auth.uid() then
    raise exception 'Only the call starter or group admins can record this call';
  end if;
  if p_on then
    if g.call_recording_by is not null and g.call_recording_by <> auth.uid() then
      raise exception '% is already recording this call', public.chat_group_display(g.call_recording_by);
    end if;
    if g.call_recording_by is null then
      update chat_groups set call_recording_by = auth.uid() where id = p_group;
      perform public.chat_group_system(p_group, public.chat_group_display(auth.uid()) || ' is recording this call', null, 'system');
    end if;
  elsif g.call_recording_by = auth.uid() or my_role in ('owner','admin') then
    update chat_groups set call_recording_by = null where id = p_group;
  end if;
  return group_call_state_v2(p_group);
end $function$;

grant execute on function public.set_group_call_recording(uuid, boolean) to authenticated;
revoke execute on function public.set_group_call_recording(uuid, boolean) from anon, public;
revoke execute on function public.group_call_close_card(uuid) from anon, public, authenticated;

-- Tidy up cards from calls that already ended: none of them are live now.
update public.chat_groups set call_message_id = (
  select m.id from public.chat_group_messages m
   where m.group_id = chat_groups.id and m.kind = 'call' and m.created_at >= chat_groups.call_active_since - interval '10 seconds'
   order by m.created_at asc limit 1)
 where call_active_since is not null and call_message_id is null;
