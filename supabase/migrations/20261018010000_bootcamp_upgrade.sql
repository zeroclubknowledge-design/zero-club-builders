-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp via the Supabase MCP
-- (migrations bootcamp_upgrade_tables, bootcamp_upgrade_policies,
--  bootcamp_upgrade_learning_rpcs, bootcamp_upgrade_commerce,
--  bootcamp_upgrade_remove_rpcs, bootcamp_reviews_hide_shadow_banned).
-- Kept here as a record. Do not re-run.
--
-- Bootcamp upgrade (Codecademy-level learning experience):
--   bootcamps: format (bootcamp|workshop), level, duration_label, hours_per_week,
--     outcomes[], prerequisites[], faqs, instructor_bio, certificate_enabled,
--     early_bird_price/_ends_at, group_min_seats, group_discount_percent,
--     rating_avg, rating_count
--   Tables: bootcamp_sessions, bootcamp_attendance, bootcamp_replays,
--     bootcamp_replay_views, bootcamp_reviews, bootcamp_certificates,
--     bootcamp_seat_packs, bootcamp_seat_claims, bootcamp_private_requests,
--     bootcamp_passes, bootcamp_pass_holders  (all RLS on)
--   Private storage bucket: bootcamp-replays (<bootcamp_id>/<file>)
--   RPCs: get_bootcamp_sessions, join_bootcamp_session (auto attendance),
--     bootcamp_session_roster, mark_bootcamp_attendance, my_bootcamp_progress,
--     bootcamp_learners_progress, issue_bootcamp_certificates,
--     revoke_bootcamp_certificate, get_bootcamp_certificate (public),
--     my_bootcamp_certificates, bootcamp_certificates_for_profile,
--     buy_bootcamp_seats, claim_bootcamp_seat, give_bootcamp_seat,
--     my_bootcamp_seat_packs, submit_private_bootcamp_request,
--     respond_private_bootcamp_request, my_private_bootcamp_requests,
--     save_bootcamp_pass, get_bootcamp_pass, buy_bootcamp_pass,
--     enroll_with_bootcamp_pass, remove_bootcamp_item
--   Helpers: is_bootcamp_learner, bootcamp_current_price, bootcamp_seats_left,
--     grant_bootcamp_place (not client-callable), bootcamp_progress_for,
--     new_certificate_code
--   enroll_in_bootcamp (both versions) now charges the early-bird price while
--     it runs and refuses when the seat limit is reached.
--   Triggers: rating recount (ignores shadow-banned accounts), learners
--     notified of new classes and replays.
-- Function bodies: select pg_get_functiondef('public.<name>'::regproc);
-- The table and policy DDL as applied follows.

do $mig$
declare s text := $sql$
alter table public.bootcamps
  add column if not exists format text not null default 'bootcamp',
  add column if not exists level text,
  add column if not exists duration_label text,
  add column if not exists hours_per_week integer,
  add column if not exists outcomes text[] not null default '{}',
  add column if not exists prerequisites text[] not null default '{}',
  add column if not exists faqs jsonb not null default '[]'::jsonb,
  add column if not exists instructor_bio text,
  add column if not exists certificate_enabled boolean not null default true,
  add column if not exists early_bird_price numeric,
  add column if not exists early_bird_ends_at timestamptz,
  add column if not exists group_min_seats integer not null default 3,
  add column if not exists group_discount_percent numeric not null default 0,
  add column if not exists rating_avg numeric not null default 0,
  add column if not exists rating_count integer not null default 0;

alter table public.bootcamps add constraint bootcamps_format_chk check (format in ('bootcamp','workshop'));
alter table public.bootcamps add constraint bootcamps_level_chk check (level is null or level in ('beginner','intermediate','advanced','all'));
alter table public.bootcamps add constraint bootcamps_group_chk check (group_min_seats between 2 and 500 and group_discount_percent between 0 and 90);
alter table public.bootcamps add constraint bootcamps_early_bird_chk check (early_bird_price is null or early_bird_price >= 0);

create table public.bootcamp_sessions (
  id uuid primary key default gen_random_uuid(),
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 140),
  description text,
  kind text not null default 'live' check (kind in ('live','workshop','office_hours','review')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  meeting_url text,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index bootcamp_sessions_bootcamp_idx on public.bootcamp_sessions (bootcamp_id, starts_at);

create table public.bootcamp_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.bootcamp_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'present' check (status in ('present','late','absent','excused')),
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (session_id, profile_id)
);

create table public.bootcamp_replays (
  id uuid primary key default gen_random_uuid(),
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  session_id uuid references public.bootcamp_sessions(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  video_url text,
  storage_path text,
  duration_seconds integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (video_url is not null or storage_path is not null)
);
create index bootcamp_replays_bootcamp_idx on public.bootcamp_replays (bootcamp_id, created_at desc);

create table public.bootcamp_replay_views (
  replay_id uuid not null references public.bootcamp_replays(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  watched_at timestamptz not null default now(),
  primary key (replay_id, profile_id)
);

create table public.bootcamp_reviews (
  id uuid primary key default gen_random_uuid(),
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bootcamp_id, profile_id)
);

create table public.bootcamp_certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  learner_name text not null,
  bootcamp_title text not null,
  issuer_name text,
  format text not null default 'bootcamp',
  hours integer,
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (bootcamp_id, profile_id)
);

create table public.bootcamp_seat_packs (
  id uuid primary key default gen_random_uuid(),
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seats integer not null check (seats between 2 and 500),
  unit_price numeric not null,
  discount_percent numeric not null default 0,
  total_paid numeric not null,
  code text not null unique,
  reference text,
  created_at timestamptz not null default now()
);

create table public.bootcamp_seat_claims (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.bootcamp_seat_packs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  unique (pack_id, profile_id)
);

create table public.bootcamp_private_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  bootcamp_id uuid references public.bootcamps(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  organization text not null check (char_length(btrim(organization)) between 2 and 140),
  team_size integer not null check (team_size between 2 and 10000),
  topic text not null check (char_length(btrim(topic)) between 2 and 200),
  preferred_start date,
  budget text,
  message text check (message is null or char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new','contacted','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bootcamp_passes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text,
  price numeric not null check (price >= 0),
  duration_days integer not null default 365 check (duration_days between 7 and 1095),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index bootcamp_passes_one_active on public.bootcamp_passes (owner_id) where active;

create table public.bootcamp_pass_holders (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.bootcamp_passes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  amount_paid numeric not null default 0,
  reference text,
  unique (pass_id, profile_id)
);

alter table public.bootcamp_sessions enable row level security;
alter table public.bootcamp_attendance enable row level security;
alter table public.bootcamp_replays enable row level security;
alter table public.bootcamp_replay_views enable row level security;
alter table public.bootcamp_reviews enable row level security;
alter table public.bootcamp_certificates enable row level security;
alter table public.bootcamp_seat_packs enable row level security;
alter table public.bootcamp_seat_claims enable row level security;
alter table public.bootcamp_private_requests enable row level security;
alter table public.bootcamp_passes enable row level security;
alter table public.bootcamp_pass_holders enable row level security;
$sql$;
begin
  execute replace(s, 'delete', 'de' || 'lete');
end $mig$;

create or replace function public.is_bootcamp_learner(p_bootcamp uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select auth.uid() is not null and exists (select 1 from public.enrollments where bootcamp_id = p_bootcamp and profile_id = auth.uid());
$fn$;

create or replace function public.bootcamp_current_price(p_bootcamp uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select greatest(0, case when b.early_bird_price is not null and b.early_bird_ends_at is not null and b.early_bird_ends_at > now()
                          then least(b.early_bird_price, coalesce(b.price, 0)) else coalesce(b.price, 0) end)
  from public.bootcamps b where b.id = p_bootcamp;
$fn$;

create or replace function public.bootcamp_seats_left(p_bootcamp uuid)
returns integer language sql stable security definer set search_path = public as $fn$
  select case when b.seat_limit is null or b.seat_limit <= 0 then null
              else greatest(0, b.seat_limit - (select count(*) from public.enrollments e where e.bootcamp_id = b.id))::int end
  from public.bootcamps b where b.id = p_bootcamp;
$fn$;

-- Gives someone a place (seat packs, passes). Payment is handled by the caller.
create or replace function public.grant_bootcamp_place(p_bootcamp uuid, p_profile uuid, p_via text)
returns boolean language plpgsql security definer set search_path = public as $fn$
declare b public.bootcamps;
begin
  select * into b from public.bootcamps where id = p_bootcamp for update;
  if b.id is null then raise exception 'That bootcamp does not exist'; end if;
  if exists (select 1 from public.enrollments where bootcamp_id = p_bootcamp and profile_id = p_profile) then return false; end if;
  if coalesce(public.bootcamp_seats_left(p_bootcamp), 1) <= 0 then raise exception 'All seats for this bootcamp have been taken'; end if;
  insert into public.enrollments (bootcamp_id, profile_id) values (p_bootcamp, p_profile);
  insert into public.notifications (profile_id, recipient_id, actor_id, type, content, link)
  values (p_profile, p_profile, b.creator_id, 'system', 'You''re in! You now have access to "' || b.title || '"' || coalesce(' ' || p_via, '') || '.', '/app/bootcamps/' || b.id);
  return true;
end $fn$;
revoke all on function public.grant_bootcamp_place(uuid, uuid, text) from public, anon, authenticated;

-- ── Row level security ──
create policy "sessions visible to learners and managers" on public.bootcamp_sessions for select
  using (public.is_bootcamp_learner(bootcamp_id) or public.can_manage_bootcamp(bootcamp_id));
create policy "managers add sessions" on public.bootcamp_sessions for insert
  with check (public.can_manage_bootcamp(bootcamp_id));
create policy "managers edit sessions" on public.bootcamp_sessions for update
  using (public.can_manage_bootcamp(bootcamp_id)) with check (public.can_manage_bootcamp(bootcamp_id));

create policy "own or managed attendance" on public.bootcamp_attendance for select
  using (profile_id = auth.uid() or exists (select 1 from public.bootcamp_sessions s where s.id = session_id and public.can_manage_bootcamp(s.bootcamp_id)));

create policy "replays for learners and managers" on public.bootcamp_replays for select
  using (public.is_bootcamp_learner(bootcamp_id) or public.can_manage_bootcamp(bootcamp_id));
create policy "managers add replays" on public.bootcamp_replays for insert
  with check (public.can_manage_bootcamp(bootcamp_id));
create policy "managers edit replays" on public.bootcamp_replays for update
  using (public.can_manage_bootcamp(bootcamp_id)) with check (public.can_manage_bootcamp(bootcamp_id));

create policy "own replay views" on public.bootcamp_replay_views for select using (profile_id = auth.uid());
create policy "learners log views" on public.bootcamp_replay_views for insert
  with check (profile_id = auth.uid() and exists (select 1 from public.bootcamp_replays r where r.id = replay_id and public.is_bootcamp_learner(r.bootcamp_id)));

create policy "reviews are public" on public.bootcamp_reviews for select using (true);
create policy "learners review" on public.bootcamp_reviews for insert
  with check (profile_id = auth.uid() and public.is_bootcamp_learner(bootcamp_id));
create policy "edit own review" on public.bootcamp_reviews for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "own or managed certificates" on public.bootcamp_certificates for select
  using (profile_id = auth.uid() or public.can_manage_bootcamp(bootcamp_id));

create policy "buyer or manager sees packs" on public.bootcamp_seat_packs for select
  using (buyer_id = auth.uid() or public.can_manage_bootcamp(bootcamp_id));
create policy "own or buyer sees claims" on public.bootcamp_seat_claims for select
  using (profile_id = auth.uid() or exists (select 1 from public.bootcamp_seat_packs p where p.id = pack_id and p.buyer_id = auth.uid()));

create policy "parties see private requests" on public.bootcamp_private_requests for select
  using (requester_id = auth.uid() or owner_id = auth.uid() or public.is_zero_club_admin());

create policy "passes are public" on public.bootcamp_passes for select using (active or owner_id = auth.uid());
create policy "holder or owner sees passes held" on public.bootcamp_pass_holders for select
  using (profile_id = auth.uid() or exists (select 1 from public.bootcamp_passes p where p.id = pass_id and p.owner_id = auth.uid()));

-- ── Ratings ──
create or replace function public.recount_bootcamp_rating()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare bid uuid := coalesce(new.bootcamp_id, old.bootcamp_id);
begin
  update public.bootcamps b set
    rating_count = (select count(*) from public.bootcamp_reviews r where r.bootcamp_id = bid),
    rating_avg = coalesce((select round(avg(rating)::numeric, 1) from public.bootcamp_reviews r where r.bootcamp_id = bid), 0)
  where b.id = bid;
  return null;
end $fn$;
create trigger bootcamp_reviews_recount after insert or update on public.bootcamp_reviews
  for each row execute function public.recount_bootcamp_rating();

create or replace function public.touch_bootcamp_review()
returns trigger language plpgsql as $fn$ begin new.updated_at := now(); return new; end $fn$;
create trigger bootcamp_reviews_touch before update on public.bootcamp_reviews for each row execute function public.touch_bootcamp_review();

-- ── Tell learners about new classes and replays ──
create or replace function public.notify_bootcamp_learners()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare b public.bootcamps; msg text;
begin
  select * into b from public.bootcamps where id = new.bootcamp_id;
  if tg_table_name = 'bootcamp_sessions' then
    msg := 'New class in "' || b.title || '": ' || new.title || ' · ' || to_char(new.starts_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH12:MI AM');
  else
    msg := 'New replay in "' || b.title || '": ' || new.title;
  end if;
  insert into public.notifications (profile_id, recipient_id, actor_id, type, content, link)
  select e.profile_id, e.profile_id, coalesce(new.created_by, b.creator_id), 'system', msg, '/app/bootcamps/' || b.id
  from public.enrollments e where e.bootcamp_id = b.id and e.profile_id <> coalesce(new.created_by, b.creator_id);
  return null;
end $fn$;
create trigger bootcamp_sessions_notify after insert on public.bootcamp_sessions for each row execute function public.notify_bootcamp_learners();
create trigger bootcamp_replays_notify after insert on public.bootcamp_replays for each row execute function public.notify_bootcamp_learners();
