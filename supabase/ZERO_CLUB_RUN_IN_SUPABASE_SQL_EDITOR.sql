-- Zero Club: the two server updates that need approving.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It runs as one transaction: if anything fails, nothing changes.
--
-- 1. Portfolio Articles (replaces Highlights; keeps the rate card rules).
-- 2. Zero Draught ZP stakes (safeguarded), and removes the old transfer_zp
--    function that lets anyone move ZP between accounts.
-- Watching + match chat, the rate card, club contributors and group call cards
-- are already live; this file does not touch them in a way that undoes them.

begin;

-- ───────────── 1. Portfolio Articles ─────────────
alter table public.portfolio_items alter column post_id drop not null;
alter table public.portfolio_items add column if not exists note_id uuid references public.notes(id) on delete cascade;

alter table public.portfolio_items drop constraint if exists portfolio_items_kind_check;
alter table public.portfolio_items add constraint portfolio_items_kind_check
  check (kind = any (array['project','proof','article']));
alter table public.portfolio_items drop constraint if exists portfolio_items_source_check;
alter table public.portfolio_items add constraint portfolio_items_source_check
  check ((kind = 'article' and note_id is not null and post_id is null)
      or (kind <> 'article' and post_id is not null and note_id is null));
create unique index if not exists portfolio_items_portfolio_note on public.portfolio_items(portfolio_id, note_id) where note_id is not null;

-- Owners add their own build posts as projects, or their own public articles.
drop policy if exists portfolio_items_owner_all on public.portfolio_items;
create policy portfolio_items_owner_all on public.portfolio_items for all to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_items.portfolio_id and p.profile_id = auth.uid()))
  with check (
    exists (select 1 from public.portfolios p where p.id = portfolio_items.portfolio_id and p.profile_id = auth.uid())
    and (
      (kind = 'project' and exists (select 1 from public.posts po where po.id = portfolio_items.post_id
         and po.author_id = auth.uid() and coalesce(po.is_build_post, false)))
      or (kind = 'article' and exists (select 1 from public.notes n where n.id = portfolio_items.note_id
         and n.author_id = auth.uid() and n.is_published and coalesce(n.audience, 'public') = 'public'))
    )
  );

-- Covers: a post card uses one of the post's images; an article uses its own cover.
create or replace function public.guard_portfolio_item_cover()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.note_id is not null then
    new.cover_url := null;
  elsif new.cover_url is not null and not exists (
    select 1 from public.posts p where p.id = new.post_id and new.cover_url = any(coalesce(p.media_urls, '{}'))
  ) then
    raise exception 'The cover must be one of this post''s own images';
  end if;
  new.display_title := nullif(btrim(new.display_title), '');
  new.display_summary := nullif(btrim(new.display_summary), '');
  return new;
end $function$;

-- Plain text of an article, for excerpts and reading time.
create or replace function public.note_plain_text(p_blocks jsonb)
returns text language sql immutable set search_path to 'public' as $$
  select btrim(regexp_replace(regexp_replace(coalesce(string_agg(coalesce(b->>'content', b->>'text', ''), ' '), ''),
    '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g'))
  from jsonb_array_elements(case when jsonb_typeof(p_blocks) = 'array' then p_blocks else '[]'::jsonb end) b
$$;

-- The owner's public articles, for the builder's picker.
create or replace function public.portfolio_article_candidates()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'slug', n.slug, 'cover_url', n.cover_url,
      'created_at', n.created_at, 'excerpt', left(public.note_plain_text(n.blocks), 220),
      'minutes', greatest(1, ceil(array_length(regexp_split_to_array(public.note_plain_text(n.blocks), '\s+'), 1) / 220.0)::int))
    order by n.created_at desc), '[]'::jsonb)
  from public.notes n
  where n.author_id = auth.uid() and n.is_published and coalesce(n.audience, 'public') = 'public'
$$;
revoke all on function public.portfolio_article_candidates() from public, anon;
grant execute on function public.portfolio_article_candidates() to authenticated;

create or replace function public.get_public_portfolio(p_username text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare prof public.profiles; pf public.portfolios; is_owner boolean; premium boolean; rc jsonb;
begin
  select * into prof from public.profiles where lower(username) = lower(btrim(p_username)) and coalesce(account_status,'active') <> 'suspended' limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  select * into pf from public.portfolios where profile_id = prof.id;
  is_owner := auth.uid() is not null and auth.uid() = prof.id;
  if not found or (pf.status <> 'published' and not is_owner) then
    return jsonb_build_object('found', false);
  end if;
  -- Rate card (applied 2026-10-22): visitors of a non-PRO portfolio see tier 1 only.
  premium := public.portfolio_premium_allowed(prof.id);
  rc := pf.rate_card;
  if rc is not null and not premium and jsonb_array_length(coalesce(rc->'tiers','[]'::jsonb)) > 0 then
    rc := jsonb_set(rc, '{tiers}', jsonb_build_array((rc->'tiers'->0) - 'highlight'));
  end if;
  return jsonb_build_object(
    'found', true, 'is_owner', is_owner,
    'profile', jsonb_build_object(
      'id', prof.id, 'username', prof.username, 'full_name', prof.full_name, 'avatar_url', prof.avatar_url,
      'banner_url', prof.banner_url, 'bio', prof.bio, 'location', prof.location, 'website', prof.website,
      'social_links', prof.social_links, 'xp', prof.xp, 'account_type', prof.account_type, 'interests', prof.interests),
    'portfolio', (to_jsonb(pf) - 'profile_id') || jsonb_build_object(
      'template', case when pf.template in ('signal','spotlight','statement','bright','gallery')
                        and not public.portfolio_premium_allowed(prof.id) then 'minimal' else pf.template end,
      'stored_template', pf.template,
      'premium_active', public.portfolio_premium_allowed(prof.id),
      'show_branding', not (coalesce(pf.hide_branding, false) and public.portfolio_premium_allowed(prof.id)),
      'rate_card', case when is_owner then pf.rate_card else rc end),
    'shipped', coalesce((
      select jsonb_agg(jsonb_build_object('id', po.id, 'content', po.content, 'media_urls', po.media_urls,
          'likes_count', po.likes_count, 'comments_count', po.comments_count, 'created_at', po.created_at,
          'is_build_post', po.is_build_post, 'is_verified_build', po.is_verified_build, 'version_label', po.version_label,
          'versions', (select count(*) from public.posts v where v.project_root_id = po.id and coalesce(v.audience,'everyone') = 'everyone'))
        order by po.created_at desc)
      from (select * from public.portfolio_projects(prof.id) p2 order by p2.created_at desc limit 60) po
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(a order by a->>'at' desc) from (
        select jsonb_build_object('kind', 'challenge', 'title', c.title, 'place', e.place,
          'label', case e.place when 1 then 'Won' when 2 then '2nd place' else '3rd place' end,
          'at', coalesce(c.completed_at, c.finalized_at, c.updated_at), 'ref', c.id) as a
        from public.challenge_entries e join public.challenges c on c.id = e.challenge_id
        where e.entrant_id = prof.id and e.status = 'winner' and c.status = 'completed'
        union all
        select jsonb_build_object('kind', 'zero_games', 'title', t.title, 'place', w.place,
          'label', coalesce(nullif(w.label, ''), case w.place when 1 then '1st place' when 2 then '2nd place' when 3 then '3rd place' else 'Top ' || w.place end),
          'at', w.created_at, 'ref', t.id) as a
        from public.zero_tournament_awards w join public.zero_tournaments t on t.id = w.tournament_id
        where w.profile_id = prof.id and t.visibility = 'public'
        limit 24
      ) s), '[]'::jsonb),
    -- Selected work only: ordinary highlighted posts are no longer shown.
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'featured', i.featured, 'sort_order', i.sort_order,
        'problem', i.problem, 'outcome', i.outcome,
        'display_title', i.display_title, 'display_summary', i.display_summary, 'cover_url', i.cover_url,
        'post', jsonb_build_object('id', po.id, 'content', po.content, 'media_urls', po.media_urls,
          'likes_count', po.likes_count, 'comments_count', po.comments_count, 'created_at', po.created_at,
          'is_build_post', po.is_build_post, 'is_verified_build', po.is_verified_build, 'version_label', po.version_label,
          'versions', (select count(*) from public.posts v where v.project_root_id = po.id and coalesce(v.audience,'everyone') = 'everyone'))
      ) order by i.featured desc, i.sort_order, i.created_at)
      from public.portfolio_items i join public.posts po on po.id = i.post_id
      where i.portfolio_id = pf.id and i.kind = 'project' and coalesce(po.audience, 'everyone') = 'everyone'
    ), '[]'::jsonb),
    'articles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'note_id', n.id, 'featured', i.featured, 'sort_order', i.sort_order,
        'title', coalesce(i.display_title, n.title), 'slug', n.slug, 'cover_url', n.cover_url, 'created_at', n.created_at,
        'excerpt', coalesce(i.display_summary, left(public.note_plain_text(n.blocks), 240)),
        'minutes', greatest(1, ceil(array_length(regexp_split_to_array(public.note_plain_text(n.blocks), '\s+'), 1) / 220.0)::int)
      ) order by i.featured desc, i.sort_order, i.created_at)
      from public.portfolio_items i join public.notes n on n.id = i.note_id
      where i.portfolio_id = pf.id and i.kind = 'article' and n.is_published and coalesce(n.audience, 'public') = 'public'
    ), '[]'::jsonb),
    'experiences', coalesce((select jsonb_agg(to_jsonb(e) - 'profile_id' order by e.is_current desc, e.start_date desc)
      from public.profile_experiences e where e.profile_id = prof.id), '[]'::jsonb),
    'certificates', coalesce((select jsonb_agg(to_jsonb(c) - 'profile_id' order by c.issued_on desc nulls last)
      from public.profile_certificates c where c.profile_id = prof.id), '[]'::jsonb),
    'learning', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'category', b.category,
        'banner_url', b.banner_url, 'enrolled_at', en.enrolled_at) order by en.enrolled_at desc)
      from public.enrollments en join public.bootcamps b on b.id = en.bootcamp_id
      where en.profile_id = prof.id and coalesce(b.visibility, true)), '[]'::jsonb),
    'stats', jsonb_build_object(
      'ships', (select count(*) from public.portfolio_projects(prof.id)),
      'verified', (select count(*) from public.posts where author_id = prof.id and is_build_post and is_verified_build),
      'proofs', 0,
      'articles', (select count(*) from public.notes where author_id = prof.id and is_published and coalesce(audience, 'public') = 'public'),
      'xp', coalesce(prof.xp, 0)));
end;
$function$;

-- ───────────── 2. Zero Draught stakes ─────────────
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
  return jsonb_build_object(
    'room_id', r.id,
    'status', r.status,
    'stake', r.stake,
    'open', r.status = 'waiting' and r.black_id is null,
    'player', auth.uid() in (r.red_id, coalesce(r.black_id, r.red_id)),
    'watchable', r.watchable and r.status in ('active','finished'),
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
