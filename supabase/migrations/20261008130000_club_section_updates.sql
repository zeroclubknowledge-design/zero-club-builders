-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp via Supabase MCP
-- (migrations "club_section_updates" and "club_quizzes_realtime"). Kept as a record; do not re-run.
--
-- Per-member "last opened" time for each club section, so the floating Zero Club
-- mark can show how many new assignments / announcements / questions / quizzes wait.

create table if not exists public.club_room_reads (
  profile_id uuid not null,
  club_id uuid not null,
  room_id text not null,
  last_read_at timestamptz not null default now(),
  primary key (profile_id, club_id, room_id)
);
alter table public.club_room_reads enable row level security;
create policy club_room_reads_own_select on public.club_room_reads for select using (profile_id = auth.uid());

-- mark_club_room_read(p_club uuid, p_room text) returns void
--   security definer; upserts (auth.uid(), p_club, p_room, now()).
-- club_section_updates(p_club uuid) returns jsonb
--   security definer, stable; returns [{room_id, count, latest_content, latest_at}]
--   for top-level messages by others in non-general rooms newer than the member's
--   last read (baseline greatest(joined_at, now()-14d)), plus published quizzes
--   by others as room 'quizzes'.

alter publication supabase_realtime add table public.club_quizzes;
