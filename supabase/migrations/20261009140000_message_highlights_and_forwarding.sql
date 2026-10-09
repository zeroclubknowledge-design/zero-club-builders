-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp on 2026-10-09 via Supabase MCP
-- (migration "message_highlights_and_forwarding"). Kept as a record; do not re-run.
alter table public.messages add column if not exists forwarded boolean not null default false;
create table if not exists public.message_highlights (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, message_id)
);
-- RLS: each person sees, adds and removes only their own highlights, and only on
-- messages they sent or received.
