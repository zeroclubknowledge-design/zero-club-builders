-- Enable watching and match chat independently of ZP stakes.
-- Requires the existing Zero Draught base migration. Safe to rerun.
-- Does not enable betting, change balances, or replace game actions/rules.
begin;
alter table public.zero_draught_rooms add column if not exists watchable boolean not null default true;
create table if not exists public.zero_draught_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.zero_draught_rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists zero_draught_comments_room on public.zero_draught_comments(room_id, created_at);
alter table public.zero_draught_comments enable row level security;
revoke all on public.zero_draught_comments from public, anon, authenticated;
grant select on public.zero_draught_comments to authenticated;

-- Players always; anyone signed in once a watchable match has started.
drop policy if exists draught_players_read on public.zero_draught_rooms;
create policy draught_players_read on public.zero_draught_rooms for select to authenticated
  using (auth.uid() in (red_id, black_id) or (watchable and status in ('active','finished')));

drop policy if exists draught_comments_read on public.zero_draught_comments;
create policy draught_comments_read on public.zero_draught_comments for select to authenticated
  using (exists (select 1 from public.zero_draught_rooms r where r.id = room_id
    and (auth.uid() in (r.red_id, r.black_id) or (r.watchable and r.status in ('active','finished')))));

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'zero_draught_comments') then
    alter publication supabase_realtime add table public.zero_draught_comments;
  end if;
end $$;

-- Room snapshot: players and spectators.
create or replace function public.zero_draught_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.zero_draught_rooms%rowtype; players jsonb; viewer text; pot bigint := 0;
begin
  if auth.uid() is null then raise exception 'Sign in to watch this match'; end if;
  perform public.zero_draught_settle(p_room);
  select * into r from public.zero_draught_rooms where id = p_room;
  if not found then raise exception 'Match not found'; end if;
  if auth.uid() in (r.red_id, r.black_id) then viewer := 'player';
  elsif r.watchable and r.status in ('active','finished') then viewer := 'spectator';
  else raise exception 'This match is not open to watch yet';
  end if;
  select jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(nullif(full_name, ''), username, 'Player'), 'photo', avatar_url))
    into players from public.profiles where id in (r.red_id, r.black_id);
  if to_regclass('public.zero_draught_stakes') is not null then
    execute 'select coalesce(sum(amount),0) from public.zero_draught_stakes where room_id=$1' into pot using p_room;
  end if;
  return jsonb_build_object('room', to_jsonb(r) - 'positions' - 'code' || case when viewer = 'player' then jsonb_build_object('code', r.code) else '{}'::jsonb end,
    'players', players, 'viewer', viewer,
    'pot', pot,
    'moves', case when r.status = 'active' then public.zero_draught_moves(r.board, r.turn, r.forced) else '[]'::jsonb end,
    'server_now', clock_timestamp());
end $$;

-- Resolve shared invites to watching after both player seats are occupied.
create or replace function public.zero_draught_invite(p_code text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.zero_draught_rooms; host public.profiles; is_player boolean; can_watch boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to open this match'; end if;
  select * into r from zero_draught_rooms where code=upper(btrim(p_code));
  if not found then raise exception 'Invite not found'; end if;
  is_player:=coalesce(auth.uid() in (r.red_id,r.black_id),false);
  can_watch:=r.watchable and r.status in ('active','finished');
  select * into host from profiles where id=r.red_id;
  return jsonb_build_object('room_id',case when is_player or can_watch then r.id else null end,
    'player',is_player,'watchable',can_watch,'status',r.status,
    'stake',coalesce((to_jsonb(r)->>'stake')::integer,0),
    'open',r.status='waiting' and r.black_id is null and r.created_at>now()-interval '24 hours',
    'host',jsonb_build_object('id',host.id,'name',coalesce(nullif(host.full_name,''),host.username,'Player'),'photo',host.avatar_url));
end $$;

-- Matches being played right now, for the "Watch live" list.
create or replace function public.zero_draught_live()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to watch matches'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t)) from (
    select r.id, coalesce((to_jsonb(r)->>'stake')::integer,0) as stake, r.ply, r.moved_at, r.created_at,
      (select count(*) from zero_draught_comments c where c.room_id = r.id) as comments,
      jsonb_build_object('id', a.id, 'name', coalesce(nullif(a.full_name, ''), a.username, 'Player'), 'photo', a.avatar_url) as red,
      jsonb_build_object('id', b.id, 'name', coalesce(nullif(b.full_name, ''), b.username, 'Player'), 'photo', b.avatar_url) as black
    from zero_draught_rooms r join profiles a on a.id = r.red_id join profiles b on b.id = r.black_id
    where r.status = 'active' and r.watchable and r.moved_at > now() - interval '15 minutes'
    order by coalesce((to_jsonb(r)->>'stake')::integer,0) desc, r.moved_at desc limit 20) t), '[]'::jsonb);
end $$;

create or replace function public.zero_draught_comment(p_room uuid, p_body text)
returns public.zero_draught_comments language plpgsql security definer set search_path = public as $$
declare r public.zero_draught_rooms; saved public.zero_draught_comments; clean text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'Sign in to comment'; end if;
  if exists (select 1 from profiles where id = auth.uid() and coalesce(account_status, 'active') = 'suspended') then
    raise exception 'This account cannot comment right now';
  end if;
  select * into r from zero_draught_rooms where id = p_room;
  if not found or not coalesce(auth.uid() in (r.red_id, r.black_id) or (r.watchable and r.status in ('active','finished')), false) then
    raise exception 'This match is not open for comments';
  end if;
  if char_length(clean) = 0 or char_length(clean) > 280 then raise exception 'Comments are 1 to 280 characters'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 8207));
  if exists (select 1 from zero_draught_comments where profile_id = auth.uid() and created_at > now() - interval '2 seconds') then
    raise exception 'Slow down a little';
  end if;
  insert into zero_draught_comments (room_id, profile_id, body) values (p_room, auth.uid(), clean) returning * into saved;
  return saved;
end $$;


-- Watchers can receive board updates, but invite codes and repetition history
-- stay behind the player-only RPC response. No direct writes are granted.
revoke select on public.zero_draught_rooms from authenticated;
grant select (id,red_id,black_id,board,turn,forced,quiet,ply,version,status,winner,reason,
  red_ms,black_ms,moved_at,created_at,red_seen,black_seen,draw_offer,watchable)
  on public.zero_draught_rooms to authenticated;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='zero_draught_rooms' and column_name='stake') then
    grant select(stake) on public.zero_draught_rooms to authenticated;
  end if;
end $$;
revoke all on function public.zero_draught_room(uuid),public.zero_draught_live(),public.zero_draught_invite(text),
  public.zero_draught_comment(uuid,text) from public,anon;
grant execute on function public.zero_draught_room(uuid),public.zero_draught_live(),public.zero_draught_invite(text),
  public.zero_draught_comment(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
