-- APPLIED 2026-10-22 (migration name: draught_watch_and_chat).
-- Zero Draught: watching a live match and chatting under it.
-- Split out of 20261021230000_draught_watch_and_stakes_NOT_YET_APPLIED.sql with
-- additive SQL only. The stakes part of that file is still not applied.

alter table public.zero_draught_rooms add column if not exists watchable boolean not null default true;

create table if not exists public.zero_draught_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  profile_id uuid not null references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists zero_draught_comments_room on public.zero_draught_comments(room_id, created_at);
alter table public.zero_draught_comments enable row level security;
revoke all on public.zero_draught_comments from public, anon, authenticated;
grant select on public.zero_draught_comments to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'zero_draught_rooms' and policyname = 'draught_spectators_read') then
    create policy draught_spectators_read on public.zero_draught_rooms for select to authenticated
      using (watchable and status in ('active','finished'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'zero_draught_comments' and policyname = 'draught_comments_read') then
    create policy draught_comments_read on public.zero_draught_comments for select to authenticated
      using (exists (select 1 from public.zero_draught_rooms r where r.id = room_id
        and (auth.uid() in (r.red_id, r.black_id) or (r.watchable and r.status in ('active','finished')))));
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'zero_draught_comments') then
    alter publication supabase_realtime add table public.zero_draught_comments;
  end if;
end $$;

-- zero_draught_room(p_room): players and spectators (spectators get no invite code).
-- zero_draught_invite(p_code): adds room_id, player, watchable.
-- zero_draught_live(): matches being played now.
-- zero_draught_comment(p_room, p_body): 1–280 chars, one per 2 seconds.
-- (Full function bodies are as applied; see the live database for the exact text.)
