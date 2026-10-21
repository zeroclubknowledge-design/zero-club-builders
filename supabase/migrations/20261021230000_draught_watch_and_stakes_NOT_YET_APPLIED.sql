-- NOT YET APPLIED (the Supabase confirmation was cancelled on 2026-10-21).
-- Zero Draught: spectators, live comments and safeguarded ZP stakes.
--
-- Watching: an active or finished match can be watched by any signed-in
-- member (the board is not secret). Only the two players can move.
--
-- Comments: short messages under a match, from players and spectators.
-- Written through zero_draught_comment (length + rate limit), read via RLS so
-- realtime can stream them.
--
-- Stakes: ZP turns into wallet money (zp_per_naira), so a stake is a bet with
-- value, and a stake is also a way to move ZP between accounts. Safeguards:
--   * cap of 1,000 ZP (₦100) per player per match;
--   * only "settled" ZP can be staked: ZP earned in the last 7 days (any
--     zp_events row, including stake winnings) is locked;
--   * both accounts must be at least 7 days old and not suspended;
--   * no stakes between an account and the account that referred it;
--   * at most 3 staked matches between the same two people per 24 hours;
--   * the joiner must explicitly accept the exact stake shown to them.
-- Each stake is held (deducted) when the player commits. When the match ends
-- the winner gets their own stake back plus the opponent's stake (recorded as
-- a 'draught_win' ZP event, so it is locked for 7 days like any earning).
-- A draw, a cancelled invite or an expired invite refunds everyone.
--
-- Also closes transfer_zp, which an earlier migration (close_zp_transfer)
-- meant to drop but which is still live and callable by anyone. Nothing in
-- the app calls it, and stake safeguards mean nothing while it exists.

begin;

drop function if exists public.transfer_zp(uuid, integer);

alter table public.zero_draught_rooms add column if not exists stake integer not null default 0;
alter table public.zero_draught_rooms drop constraint if exists zero_draught_stake_range;
alter table public.zero_draught_rooms add constraint zero_draught_stake_range check (stake between 0 and 1000);
alter table public.zero_draught_rooms add column if not exists watchable boolean not null default true;

create table if not exists public.zero_draught_stakes (
  room_id uuid not null references public.zero_draught_rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  amount integer not null check (amount > 0),
  held_at timestamptz not null default now(),
  outcome text check (outcome in ('won','lost','refunded')),
  settled_at timestamptz,
  primary key (room_id, profile_id)
);
alter table public.zero_draught_stakes enable row level security;
revoke all on public.zero_draught_stakes from public, anon, authenticated;
grant select on public.zero_draught_stakes to authenticated;
drop policy if exists draught_stakes_own on public.zero_draught_stakes;
create policy draught_stakes_own on public.zero_draught_stakes for select to authenticated using (profile_id = auth.uid());

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

-- ZP that can be staked: the balance minus anything earned in the last 7 days.
create or replace function public.zp_stakeable(p_profile uuid)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((select zp from profiles where id = p_profile), 0)
    - coalesce((select sum(amount) from zp_events where profile_id = p_profile and created_at > now() - interval '7 days'), 0))::integer
$$;
revoke all on function public.zp_stakeable(uuid) from public, anon, authenticated;

create or replace function public.zero_draught_stake_info()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in to stake ZP'; end if;
  select * into me from profiles where id = auth.uid();
  return jsonb_build_object('zp', coalesce(me.zp, 0), 'stakeable', public.zp_stakeable(me.id), 'cap', 1000,
    'account_ready', coalesce(me.created_at, now()) <= now() - interval '7 days');
end $$;

-- Checks shared by both players, then holds the stake. Idempotent per room.
create or replace function public.zero_draught_hold_stake(p_room uuid, p_profile uuid, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; inserted integer;
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  if p_amount > 1000 then raise exception 'The most you can stake is 1,000 ZP'; end if;
  select * into me from profiles where id = p_profile for update;
  if coalesce(me.account_status, 'active') = 'suspended' then raise exception 'This account cannot stake ZP'; end if;
  if coalesce(me.created_at, now()) > now() - interval '7 days' then
    raise exception 'Staked matches open 7 days after joining Zero Club';
  end if;
  if public.zp_stakeable(p_profile) < p_amount then
    raise exception 'Not enough ZP to stake. Only ZP earned more than 7 days ago can be staked (you have % available)', public.zp_stakeable(p_profile);
  end if;
  insert into zero_draught_stakes (room_id, profile_id, amount) values (p_room, p_profile, p_amount)
  on conflict (room_id, profile_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then update profiles set zp = zp - p_amount where id = p_profile; end if;
end $$;
revoke all on function public.zero_draught_hold_stake(uuid, uuid, integer) from public, anon, authenticated;

-- Pays out or refunds every held stake once a match leaves play.
create or replace function public.zero_draught_settle_stakes()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record; loser_total integer;
begin
  if old.status not in ('waiting','active') or new.status not in ('finished','cancelled') then return new; end if;
  if new.status = 'finished' and new.winner is not null then
    select coalesce(sum(amount), 0) into loser_total from zero_draught_stakes
      where room_id = new.id and profile_id <> new.winner and outcome is null;
    for s in select * from zero_draught_stakes where room_id = new.id and outcome is null for update loop
      if s.profile_id = new.winner then
        update profiles set zp = zp + s.amount where id = s.profile_id;          -- own stake back
        update zero_draught_stakes set outcome = 'won', settled_at = now() where room_id = s.room_id and profile_id = s.profile_id;
      else
        update zero_draught_stakes set outcome = 'lost', settled_at = now() where room_id = s.room_id and profile_id = s.profile_id;
      end if;
    end loop;
    if loser_total > 0 then
      perform public.award_profile_zp(new.winner, 'draught_win', new.id::text, loser_total,
        jsonb_build_object('room_id', new.id, 'stake', new.stake));
      begin
        insert into notifications (recipient_id, actor_id, type, content, entity_id)
        values (new.winner, null, 'system', 'You won ' || loser_total || ' ZP in Zero Draught.', new.id);
      exception when others then null; end;
    end if;
  else
    for s in select * from zero_draught_stakes where room_id = new.id and outcome is null for update loop
      update profiles set zp = zp + s.amount where id = s.profile_id;
      update zero_draught_stakes set outcome = 'refunded', settled_at = now() where room_id = s.room_id and profile_id = s.profile_id;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.zero_draught_settle_stakes() from public, anon, authenticated;
drop trigger if exists zero_draught_settle_stakes on public.zero_draught_rooms;
create trigger zero_draught_settle_stakes after update of status on public.zero_draught_rooms
  for each row execute function public.zero_draught_settle_stakes();

-- The existing action becomes the core; a wrapper adds the stake rules.
do $$ begin
  if to_regprocedure('public.zero_draught_action_core(uuid,text,jsonb,uuid)') is null then
    alter function public.zero_draught_action(uuid, text, jsonb, uuid) rename to zero_draught_action_core;
  end if;
end $$;
revoke all on function public.zero_draught_action_core(uuid, text, jsonb, uuid) from public, anon, authenticated;

create or replace function public.zero_draught_action(p_room uuid, p_action text, p_payload jsonb, p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); r public.zero_draught_rooms; result jsonb; amount integer; host public.profiles; guest public.profiles;
begin
  if caller is null then raise exception 'Sign in to play with friends'; end if;
  if p_action = 'create' then
    amount := coalesce(nullif(p_payload->>'stake', '')::integer, 0);
    if amount < 0 or amount > 1000 then raise exception 'Stakes run from 0 to 1,000 ZP'; end if;
    result := public.zero_draught_action_core(p_room, p_action, p_payload - 'stake', p_request);
    if amount > 0 then
      select * into r from zero_draught_rooms where id = (result->>'room_id')::uuid for update;
      if r.red_id = caller and r.status = 'waiting' and r.stake = 0 and r.version = 0 then
        update zero_draught_rooms set stake = amount where id = r.id;
        perform public.zero_draught_hold_stake(r.id, caller, amount);
      end if;
    end if;
    return result;
  elsif p_action = 'join' then
    select * into r from zero_draught_rooms where code = upper(btrim(p_payload->>'code'));
    if found and r.stake > 0 and caller <> r.red_id and r.black_id is null then
      if coalesce(nullif(p_payload->>'accept_stake', '')::integer, -1) <> r.stake then
        raise exception 'This match has a % ZP stake. Accept the stake to join', r.stake;
      end if;
      select * into host from profiles where id = r.red_id;
      select * into guest from profiles where id = caller;
      if host.referred_by = guest.id or guest.referred_by = host.id then
        raise exception 'Staked matches are not open between an account and the account that invited it';
      end if;
      if (select count(*) from zero_draught_rooms x where x.stake > 0 and x.created_at > now() - interval '24 hours'
          and ((x.red_id = r.red_id and x.black_id = caller) or (x.red_id = caller and x.black_id = r.red_id))) >= 3 then
        raise exception 'You have played 3 staked matches with this person today. Try again tomorrow';
      end if;
    end if;
    result := public.zero_draught_action_core(p_room, p_action, p_payload - 'accept_stake', p_request);
    if r.id is not null and r.stake > 0 then
      select * into r from zero_draught_rooms where id = r.id;
      if r.black_id = caller then perform public.zero_draught_hold_stake(r.id, caller, r.stake); end if;
    end if;
    return result;
  end if;
  return public.zero_draught_action_core(p_room, p_action, p_payload, p_request);
end $$;
revoke all on function public.zero_draught_action(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.zero_draught_action(uuid, text, jsonb, uuid) to authenticated;

-- Room snapshot: players and spectators.
create or replace function public.zero_draught_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.zero_draught_rooms%rowtype; players jsonb; viewer text;
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
  return jsonb_build_object('room', to_jsonb(r) - 'positions' - 'code' || case when viewer = 'player' then jsonb_build_object('code', r.code) else '{}'::jsonb end,
    'players', players, 'viewer', viewer,
    'pot', (select coalesce(sum(amount), 0) from zero_draught_stakes where room_id = r.id),
    'moves', case when r.status = 'active' then public.zero_draught_moves(r.board, r.turn, r.forced) else '[]'::jsonb end,
    'server_now', clock_timestamp());
end $$;

-- Invite preview: who invited you and what the stake is, before you join.
create or replace function public.zero_draught_invite(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.zero_draught_rooms; host public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in to play with friends'; end if;
  select * into r from zero_draught_rooms where code = upper(btrim(p_code));
  if not found then raise exception 'Invite not found'; end if;
  select * into host from profiles where id = r.red_id;
  return jsonb_build_object('status', r.status, 'stake', r.stake, 'open', r.status = 'waiting' and r.black_id is null,
    'host', jsonb_build_object('id', host.id, 'name', coalesce(nullif(host.full_name, ''), host.username, 'Player'), 'photo', host.avatar_url));
end $$;

-- Matches being played right now, for the "Watch live" list.
create or replace function public.zero_draught_live()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to watch matches'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t)) from (
    select r.id, r.stake, r.ply, r.moved_at, r.created_at,
      (select count(*) from zero_draught_comments c where c.room_id = r.id) as comments,
      jsonb_build_object('id', a.id, 'name', coalesce(nullif(a.full_name, ''), a.username, 'Player'), 'photo', a.avatar_url) as red,
      jsonb_build_object('id', b.id, 'name', coalesce(nullif(b.full_name, ''), b.username, 'Player'), 'photo', b.avatar_url) as black
    from zero_draught_rooms r join profiles a on a.id = r.red_id join profiles b on b.id = r.black_id
    where r.status = 'active' and r.watchable and r.moved_at > now() - interval '15 minutes'
    order by r.stake desc, r.moved_at desc limit 20) t), '[]'::jsonb);
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
  if not found or not (auth.uid() in (r.red_id, r.black_id) or (r.watchable and r.status in ('active','finished'))) then
    raise exception 'This match is not open for comments';
  end if;
  if char_length(clean) = 0 or char_length(clean) > 280 then raise exception 'Comments are 1 to 280 characters'; end if;
  if exists (select 1 from zero_draught_comments where profile_id = auth.uid() and created_at > now() - interval '2 seconds') then
    raise exception 'Slow down a little';
  end if;
  insert into zero_draught_comments (room_id, profile_id, body) values (p_room, auth.uid(), clean) returning * into saved;
  return saved;
end $$;

revoke all on function public.zero_draught_stake_info(), public.zero_draught_invite(text), public.zero_draught_live(),
  public.zero_draught_comment(uuid, text), public.zero_draught_room(uuid) from public, anon;
grant execute on function public.zero_draught_stake_info(), public.zero_draught_invite(text), public.zero_draught_live(),
  public.zero_draught_comment(uuid, text), public.zero_draught_room(uuid) to authenticated;

commit;
notify pgrst, 'reload schema';
