begin;

create table if not exists public.zero_space_rooms (
  code text primary key,
  created_at timestamptz not null default now(),
  started_at timestamptz
);

create table if not exists public.zero_space_pilots (
  room_code text references public.zero_space_rooms(code) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  score integer not null default 0,
  fuel real not null default 1,
  x real not null default 0.5,
  y real not null default 0.5,
  finished boolean not null default false,
  seen_at timestamptz not null default now(),
  primary key (room_code, profile_id)
);

alter table public.zero_space_rooms enable row level security;
alter table public.zero_space_pilots enable row level security;
revoke all on public.zero_space_rooms, public.zero_space_pilots from public, anon, authenticated;

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
    if p_action = 'leave' then
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
      'score',a.score,'fuel',a.fuel,'x',a.x,'y',a.y,'finished',a.finished) order by a.profile_id)
  ) from zero_space_pilots a join profiles p on p.id=a.profile_id where a.room_code=room.code);
end;
$$;

revoke all on function public.zero_space_team(text,text,integer,real,real,real,boolean) from public, anon;
grant execute on function public.zero_space_team(text,text,integer,real,real,real,boolean) to authenticated;
-- Retire the old game's public actions while preserving earned XP and history.
do $$
declare signature regprocedure;
begin
  foreach signature in array array[
    to_regprocedure('public.zero_quest_home()'), to_regprocedure('public.zero_quest_room(uuid)'),
    to_regprocedure('public.zero_quest_ping(uuid)'), to_regprocedure('public.zero_quest_action(uuid,text,jsonb,uuid)')
  ] loop
    if signature is not null then execute format('revoke execute on function %s from authenticated', signature); end if;
  end loop;
end;
$$;
notify pgrst,'reload schema';
commit;
