-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp on 2026-10-09 via Supabase MCP
-- (migration "profile_last_seen"). Kept as a record; do not re-run.
-- profiles.last_seen_at + touch_last_seen(): "last seen 5m ago" in messages.
-- Live "online" and "typing…" use Supabase Realtime presence/broadcast, not the database.
alter table public.profiles add column if not exists last_seen_at timestamptz;
-- touch_last_seen(): security definer; sets last_seen_at = now() for auth.uid(),
-- at most once a minute. Granted to authenticated.
