begin;

alter table public.zero_space_pilots
  add column if not exists reserve_sent boolean not null default false,
  add column if not exists reserve_received boolean not null default false;

create or replace function public.zero_space_team(
  p_action text, p_code text default null, p_score integer default 0,
  p_fuel real default 1, p_x real default 0.5, p_y real default 0.5,
  p_finished boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  pilot uuid := auth.uid();
  room public.zero_space_rooms;
  room_code_value text := lower(btrim(p_code));
begin
  if pilot is null then raise exception 'Sign in to fly with a teammate'; end if;
  if p_action = 'create' then
    insert into zero_space_rooms(code) values (replace(gen_random_uuid()::text, '-', '')) returning * into room;
    insert into zero_space_pilots(room_code,profile_id) values(room.code,pilot);
  else
    select * into room from zero_space_rooms where code=room_code_value for update;
    if not found then raise exception 'Room not found. Check your invite link'; end if;
    if not exists(select 1 from zero_space_pilots where room_code=room.code and profile_id=pilot) then
      if p_action <> 'join' then raise exception 'Join the room first'; end if;
      if room.started_at is not null then raise exception 'This room already has two pilots'; end if;
      if not exists(select 1 from zero_space_pilots where room_code=room.code and not finished and seen_at>now()-interval '45 seconds') then
        raise exception 'The host left this room. Ask for a new invite';
      end if;
      insert into zero_space_pilots(room_code,profile_id) values(room.code,pilot);
      update zero_space_rooms set started_at=now() where code=room.code returning * into room;
    end if;
    if p_action = 'reserve' then
      if room.started_at is null or not exists(
        select 1 from zero_space_pilots where room_code=room.code and profile_id=pilot and not finished and not reserve_sent
      ) then raise exception 'Your reserve is unavailable'; end if;
      update zero_space_pilots set reserve_received=true
      where room_code=room.code and profile_id<>pilot and not finished and not reserve_received
        and fuel<=0.65 and seen_at>now()-interval '45 seconds';
      if not found then raise exception using message = 'Your teammate needs to be flying and below 65% fuel'; end if;
      update zero_space_pilots set reserve_sent=true where room_code=room.code and profile_id=pilot;
    elsif p_action = 'leave' then
      update zero_space_pilots set finished=true where room_code=room.code and profile_id=pilot;
    elsif p_action in ('sync','join') then
      update zero_space_pilots set
        seen_at=now(),
        score=greatest(score,least(p_score,100000000)),
        fuel=greatest(0,least(1,p_fuel)), x=greatest(0,least(1,p_x)), y=greatest(0,least(1,p_y)),
        finished=coalesce(p_finished,false)
      where room_code=room.code and profile_id=pilot and not finished;
    else raise exception 'Unknown room action'; end if;
  end if;

  if room.started_at is not null then
    update zero_space_pilots set finished=true where room_code=room.code and seen_at<now()-interval '45 seconds' and not finished;
  end if;

  return (select jsonb_build_object(
    'code',room.code, 'you',pilot,
    'status',case when bool_and(a.finished) then 'finished' when room.started_at is null then 'waiting' else 'playing' end,
    'score',sum(a.score),
    'pilots',jsonb_agg(jsonb_build_object('id',a.profile_id,'name',coalesce(p.full_name,p.username,'Pilot'),
      'score',a.score,'fuel',a.fuel,'x',a.x,'y',a.y,'finished',a.finished,'reserveSent',a.reserve_sent,'reserveReceived',a.reserve_received) order by a.profile_id)
  ) from zero_space_pilots a join profiles p on p.id=a.profile_id where a.room_code=room.code);
end;
$$;

revoke all on function public.zero_space_team(text,text,integer,real,real,real,boolean) from public, anon;
grant execute on function public.zero_space_team(text,text,integer,real,real,real,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
