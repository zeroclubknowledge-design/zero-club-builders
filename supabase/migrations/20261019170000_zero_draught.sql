begin;
create or replace function public.zero_draught_moves(p_board integer[],p_turn integer,p_forced integer default null)
returns jsonb language plpgsql immutable set search_path=public as $$
declare steps jsonb:='[]'; jumps jsonb:='[]'; src integer; piece integer; dr integer; dc integer; r integer; c integer; nr integer; nc integer; dst integer; middle integer;
begin
 for src in 0..63 loop
  piece:=p_board[src+1];
  if sign(piece)<>p_turn or (p_forced is not null and src<>p_forced) then continue; end if;
  r:=src/8;c:=src%8;
  foreach dr in array array[-1,1] loop
   if abs(piece)=1 and dr<>p_turn then continue; end if;
   foreach dc in array array[-1,1] loop
    nr:=r+dr;nc:=c+dc;
    if nr<0 or nr>7 or nc<0 or nc>7 then continue; end if;
    middle:=nr*8+nc;
    if p_board[middle+1]=0 and p_forced is null then steps:=steps||jsonb_build_array(jsonb_build_object('from',src,'to',middle,'capture',null)); end if;
    nr:=r+2*dr;nc:=c+2*dc;dst:=nr*8+nc;
    if sign(p_board[middle+1])=-p_turn and nr between 0 and 7 and nc between 0 and 7 and p_board[dst+1]=0 then
     jumps:=jumps||jsonb_build_array(jsonb_build_object('from',src,'to',dst,'capture',middle));
    end if;
   end loop;
  end loop;
 end loop;
 return case when jsonb_array_length(jumps)>0 or p_forced is not null then jumps else steps end;
end $$;

create table if not exists public.zero_draught_rooms (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 red_id uuid not null references public.profiles(id), black_id uuid references public.profiles(id),
 board integer[] not null check(array_length(board,1)=64), turn integer not null default 1 check(turn in(-1,1)),
 forced integer check(forced between 0 and 63), quiet integer not null default 0, ply integer not null default 0,
 positions jsonb not null default '{}', version integer not null default 0,
 status text not null default 'waiting' check(status in ('waiting','active','finished','cancelled')),
 winner uuid references public.profiles(id), reason text,
 red_ms bigint not null default 600000, black_ms bigint not null default 600000,
 moved_at timestamptz, created_at timestamptz not null default now(), red_seen timestamptz not null default now(), black_seen timestamptz,
 draw_offer uuid references public.profiles(id), check(black_id is null or black_id<>red_id)
);
create index if not exists zero_draught_red on public.zero_draught_rooms(red_id,created_at desc);
create index if not exists zero_draught_black on public.zero_draught_rooms(black_id,created_at desc);
create table if not exists public.zero_draught_requests (
 profile_id uuid not null references public.profiles(id), request_id uuid not null, action text not null,
 payload jsonb not null, room_id uuid references public.zero_draught_rooms(id), result jsonb not null,
 primary key(profile_id,request_id)
);
alter table public.zero_draught_rooms enable row level security;
alter table public.zero_draught_requests enable row level security;
revoke all on public.zero_draught_rooms,public.zero_draught_requests from public,anon,authenticated;
grant select on public.zero_draught_rooms to authenticated;
drop policy if exists draught_players_read on public.zero_draught_rooms;
create policy draught_players_read on public.zero_draught_rooms for select to authenticated using(auth.uid() in(red_id,black_id));

create or replace function public.zero_draught_settle(p_room uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.zero_draught_rooms set status='finished',reason='timeout',winner=case when turn=1 then black_id else red_id end,
 red_ms=case when turn=1 then 0 else red_ms end,black_ms=case when turn=-1 then 0 else black_ms end,version=version+1
 where id=p_room and status='active' and extract(epoch from (clock_timestamp()-moved_at))*1000 >= case when turn=1 then red_ms else black_ms end;
 update public.zero_draught_rooms set status='cancelled',reason='invite_expired',version=version+1 where id=p_room and status='waiting' and created_at<now()-interval '24 hours';
end $$;
revoke all on function public.zero_draught_settle(uuid) from public,anon,authenticated;

create or replace function public.zero_draught_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.zero_draught_rooms%rowtype; players jsonb;
begin
 if not exists(select 1 from public.zero_draught_rooms where id=p_room and auth.uid() in(red_id,black_id)) then raise exception 'Join this match first'; end if;
 perform public.zero_draught_settle(p_room);
 select * into r from public.zero_draught_rooms where id=p_room;
 select jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(full_name,''),username,'Player'),'photo',avatar_url)) into players from public.profiles where id in(r.red_id,r.black_id);
 return jsonb_build_object('room',to_jsonb(r),'players',players,'moves',case when r.status='active' then public.zero_draught_moves(r.board,r.turn,r.forced) else '[]'::jsonb end,'server_now',clock_timestamp());
end $$;
create or replace function public.zero_draught_home()
returns jsonb language plpgsql security definer set search_path=public as $$
declare rooms jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to play with friends'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rooms from (
  select id,code,status,winner,reason,created_at from public.zero_draught_rooms where auth.uid() in(red_id,black_id)
  order by case when status in('waiting','active') then 0 else 1 end,created_at desc limit 20
 ) t;
 return rooms;
end $$;
create or replace function public.zero_draught_ping(p_room uuid)
returns void language sql security definer set search_path=public as $$
 update public.zero_draught_rooms set red_seen=case when red_id=auth.uid() then now() else red_seen end,
 black_seen=case when black_id=auth.uid() then now() else black_seen end
 where id=p_room and auth.uid() in(red_id,black_id) and status in('waiting','active')
 and case when red_id=auth.uid() then red_seen else black_seen end<now()-interval '20 seconds'
$$;

create or replace function public.zero_draught_action(p_room uuid,p_action text,p_payload jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); r public.zero_draught_rooms%rowtype; previous public.zero_draught_requests%rowtype;
 result jsonb; moves jsonb; chosen jsonb; b integer[]; src integer; dst integer; captured integer; piece integer;
 crowned boolean; stamp timestamptz:=clock_timestamp(); elapsed bigint; key text; repetitions integer;
begin
 if caller is null then raise exception 'Sign in to play with friends'; end if;
 if not exists(select 1 from public.profiles where id=caller and coalesce(account_status,'active')<>'suspended') then raise exception 'This account cannot play right now'; end if;
 if p_request is null or p_action is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,8206));
 select * into previous from public.zero_draught_requests where profile_id=caller and request_id=p_request;
 if found then
  if previous.action<>p_action or previous.payload<>p_payload or (p_action not in('create','join') and previous.room_id is distinct from p_room) then raise exception 'Request already used'; end if;
  return previous.result;
 end if;
 if p_action='create' then
  if exists(select 1 from public.zero_draught_rooms where caller in(red_id,black_id) and (status='active' or (status='waiting' and created_at>now()-interval '24 hours'))) then raise exception 'Resume or finish your current match first'; end if;
  select array_agg(case when (i/8+i%8)%2=0 then 0 when i<24 then 1 when i>=40 then -1 else 0 end order by i) into b from generate_series(0,63) i;
  key:=array_to_string(b,',')||':1';
  insert into public.zero_draught_rooms(code,red_id,board,positions) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),caller,b,jsonb_build_object(key,1)) returning * into r;
 elsif p_action='join' then
  select * into r from public.zero_draught_rooms where code=upper(btrim(p_payload->>'code')) for update;
  if not found then raise exception 'Invite not found'; end if;
  perform public.zero_draught_settle(r.id);select * into r from public.zero_draught_rooms where id=r.id;
  if caller=r.red_id or caller=r.black_id then result:=jsonb_build_object('room_id',r.id);
  else
   if r.status<>'waiting' or r.black_id is not null then raise exception 'This match is full or has ended'; end if;
   if exists(select 1 from public.zero_draught_rooms where caller in(red_id,black_id) and status in('waiting','active') and id<>r.id) then raise exception 'Finish your current match first'; end if;
   update public.zero_draught_rooms set black_id=caller,status='active',moved_at=clock_timestamp(),black_seen=now(),version=version+1 where id=r.id returning * into r;
  end if;
 else
  select * into r from public.zero_draught_rooms where id=p_room for update;
  if not found or caller not in(r.red_id,coalesce(r.black_id,r.red_id)) then raise exception 'Join this match first'; end if;
  perform public.zero_draught_settle(r.id);select * into r from public.zero_draught_rooms where id=r.id;
  stamp:=clock_timestamp();
  if p_action='resign' then
   if r.status='waiting' then update public.zero_draught_rooms set status='cancelled',reason='cancelled',version=version+1 where id=r.id;
   elsif r.status='active' then update public.zero_draught_rooms set status='finished',winner=case when caller=red_id then black_id else red_id end,reason='resigned',version=version+1 where id=r.id;
   else raise exception 'This match has ended'; end if;
  elsif p_action in('offer_draw','accept_draw','decline_draw') then
   if r.status<>'active' then raise exception 'This match has ended'; end if;
   if p_action='offer_draw' then update public.zero_draught_rooms set draw_offer=caller,version=version+1 where id=r.id;
   else
    if r.draw_offer is null or r.draw_offer=caller then raise exception 'There is no opponent draw offer'; end if;
    update public.zero_draught_rooms set draw_offer=null,status=case when p_action='accept_draw' then 'finished' else status end,reason=case when p_action='accept_draw' then 'agreed_draw' else reason end,version=version+1 where id=r.id;
   end if;
  elsif p_action='move' then
   if r.status<>'active' then raise exception 'This match has ended'; end if;
   if caller<>(case when r.turn=1 then r.red_id else r.black_id end) then raise exception 'Wait for your turn'; end if;
   if (p_payload->>'version')::integer is distinct from r.version then raise exception 'The board changed. Refresh and choose your move again'; end if;
   src:=(p_payload->>'from')::integer;dst:=(p_payload->>'to')::integer;
   moves:=public.zero_draught_moves(r.board,r.turn,r.forced);
   select value into chosen from jsonb_array_elements(moves) where (value->>'from')::integer=src and (value->>'to')::integer=dst;
   if chosen is null then raise exception 'Illegal move. Captures are mandatory'; end if;
   b:=r.board;piece:=b[src+1];captured:=(chosen->>'capture')::integer;
   crowned:=abs(piece)=1 and dst/8=(case when r.turn=1 then 7 else 0 end);
   b[src+1]:=0;b[dst+1]:=case when crowned then 2*r.turn else piece end;
   if captured is not null then b[captured+1]:=0;end if;
   if captured is not null or abs(piece)=1 then r.quiet:=0;end if;
   elapsed:=greatest(0,extract(epoch from(stamp-r.moved_at))*1000)::bigint;
   if r.turn=1 then r.red_ms:=greatest(0,r.red_ms-elapsed);else r.black_ms:=greatest(0,r.black_ms-elapsed);end if;
   if captured is not null and not crowned and jsonb_array_length(public.zero_draught_moves(b,r.turn,dst))>0 then r.forced:=dst;
   else
    if captured is null and abs(piece)=2 then r.quiet:=r.quiet+1;end if;
    r.turn:=-r.turn;r.forced:=null;r.ply:=r.ply+1;
    key:=array_to_string(b,',')||':'||r.turn;
    repetitions:=coalesce((r.positions->>key)::integer,0)+1;r.positions:=r.positions||jsonb_build_object(key,repetitions);
    if jsonb_array_length(public.zero_draught_moves(b,r.turn))=0 then r.status:='finished';r.winner:=caller;r.reason:='no_moves';
    elsif r.quiet>=80 or repetitions>=3 then r.status:='finished';r.reason:='draw';end if;
   end if;
   update public.zero_draught_rooms set board=b,turn=r.turn,forced=r.forced,quiet=r.quiet,ply=r.ply,positions=r.positions,status=r.status,winner=r.winner,reason=r.reason,
    red_ms=r.red_ms,black_ms=r.black_ms,moved_at=stamp,draw_offer=null,version=version+1 where id=r.id;
  else raise exception 'Unknown match action';end if;
 end if;
 result:=coalesce(result,'{}')||jsonb_build_object('room_id',r.id);
 insert into public.zero_draught_requests(profile_id,request_id,action,payload,room_id,result) values(caller,p_request,p_action,p_payload,r.id,result);
 return result;
end $$;
revoke all on function public.zero_draught_home(),public.zero_draught_room(uuid),public.zero_draught_ping(uuid),public.zero_draught_action(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.zero_draught_home(),public.zero_draught_room(uuid),public.zero_draught_ping(uuid),public.zero_draught_action(uuid,text,jsonb,uuid) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='zero_draught_rooms') then alter publication supabase_realtime add table public.zero_draught_rooms;end if;
end $$;

-- Retire the old game while retaining historical matches and prize records.
create or replace function public.reject_retired_zero_game() returns trigger language plpgsql as $$
begin if new.game_type='sudoku' then raise exception 'This game has been retired. Play Zero Draught instead';end if;return new;end $$;
create or replace function public.reject_retired_zero_run() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.zero_tournaments where id=new.tournament_id and game_type='sudoku') then raise exception 'This game has been retired. Play Zero Draught instead';end if;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['zero_tournaments','zero_game_competitions'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists reject_retired_game on public.%I',t);
   execute format('create trigger reject_retired_game before insert or update of game_type on public.%I for each row execute function public.reject_retired_zero_game()',t);
  end if;
 end loop;
 if to_regclass('public.zero_tournament_runs') is not null then
  drop trigger if exists reject_retired_run on public.zero_tournament_runs;
  create trigger reject_retired_run before insert on public.zero_tournament_runs for each row execute function public.reject_retired_zero_run();
 end if;
end $$;
commit;
