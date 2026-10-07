-- ALREADY APPLIED to Supabase project tiyifgfsuzhcvdvntjmp on 2026-10-08 (migration "avatar_motion"). Record only — do not re-run.
--
-- Animated profile pictures.
-- profiles: avatar_motion_enabled (member's switch, default on), avatar_motion_url (the clip),
--   avatar_motion_source (the exact avatar_url it was made from — it only plays while this
--   equals the current avatar_url), avatar_motion_status (none|pending|processing|ready|failed),
--   avatar_motion_updated_at.
-- Trigger profiles_guard_avatar_motion: the app can only change avatar_motion_enabled; a new
--   avatar_url resets the status, so an old animation can never show on a new photo.
-- avatar_motion_jobs: one row per generation (audit, duplicate guard via a unique index on
--   (profile_id, source_url) while queued/processing, timings, size, estimated cost). RLS on,
--   no client policies — only the avatar-motion edge function (service role) and admin RPCs.
-- RPCs: admin_avatar_motion_stats(), admin_set_avatar_motion(profile, enabled).

alter table public.profiles add column if not exists avatar_motion_enabled boolean not null default true;
alter table public.profiles add column if not exists avatar_motion_url text;
alter table public.profiles add column if not exists avatar_motion_source text;
alter table public.profiles add column if not exists avatar_motion_status text not null default 'none';
alter table public.profiles add column if not exists avatar_motion_updated_at timestamptz;

create or replace function public.profiles_guard_avatar_motion()
returns trigger language plpgsql as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    new.avatar_motion_url := old.avatar_motion_url;
    new.avatar_motion_source := old.avatar_motion_source;
    new.avatar_motion_status := old.avatar_motion_status;
    new.avatar_motion_updated_at := old.avatar_motion_updated_at;
  end if;
  if new.avatar_url is distinct from old.avatar_url then
    new.avatar_motion_status := 'none';
    new.avatar_motion_updated_at := now();
  end if;
  return new;
end;
$fn$;

create table if not exists public.avatar_motion_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  source_url text not null,
  kind text not null default 'auto' check (kind in ('auto', 'regenerate')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed', 'superseded', 'skipped')),
  provider text not null default 'fal',
  model text,
  provider_request_id text,
  provider_status_url text,
  provider_response_url text,
  webhook_token uuid not null default gen_random_uuid(),
  error text,
  output_url text,
  output_bytes integer,
  duration_ms integer,
  cost_usd numeric(8, 3),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create unique index if not exists avatar_motion_jobs_one_active
  on public.avatar_motion_jobs (profile_id, source_url) where status in ('queued', 'processing');
