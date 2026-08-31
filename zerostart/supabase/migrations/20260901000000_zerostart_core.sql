-- ============================================================================
-- ZeroStart — the MVP validation layer of the Zero ecosystem.
--
-- These tables live in the same Supabase project as Zero Club, on purpose.
-- The spec's goal is "one Zero account" and "a shared ZP wallet"; the way to
-- make that real rather than aspirational is to have one `profiles` table and
-- one ZP ledger, not two databases and a federation layer that has to keep two
-- balances agreeing. Two balances that can disagree is the worst possible
-- outcome for a rewards currency.
--
-- Everything ZeroStart owns is prefixed `zs_`, so it is obvious at a glance
-- which product a table belongs to and the two schemas can never collide.
--
-- What is deliberately NOT here: a ZP ledger. Zero Club already has one —
-- `zp_events` with a unique key on (profile_id, event_type, source_key), and
-- `award_profile_zp` which only moves the balance when that row is genuinely
-- new. That is exactly the idempotency the spec asks for in section 42, and it
-- is already in production. ZeroStart calls it with the participation id as
-- the source key, which makes double payment impossible by construction rather
-- than by remembering to check.
-- ============================================================================

-- ── MVPs ────────────────────────────────────────────────────────────────────
create table if not exists public.zs_mvps (
  id uuid primary key default gen_random_uuid(),
  builder_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  slug text not null unique,
  logo_url text,
  short_description text not null check (length(trim(short_description)) between 10 and 200),
  full_description text,
  category text not null default 'Other',
  -- At least one of these has to be present; a listing nobody can open is not
  -- a testing opportunity. Enforced below rather than by hoping the form asks.
  zerohub_url text,
  website_url text,
  status text not null default 'draft'
    check (status in ('draft','pending_review','approved','live','paused','completed','rejected')),
  -- Section 58 asks for the model to support featuring later without a
  -- migration. It costs one boolean now.
  is_featured boolean not null default false,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zs_mvps_needs_a_link check (
    coalesce(trim(zerohub_url), '') <> '' or coalesce(trim(website_url), '') <> ''
  )
);

create index if not exists zs_mvps_builder_idx on public.zs_mvps (builder_id, created_at desc);
create index if not exists zs_mvps_discover_idx on public.zs_mvps (status, category, created_at desc);

-- ── Campaigns ───────────────────────────────────────────────────────────────
-- One MVP has many campaigns. This is the part of the spec most likely to be
-- got wrong by treating an MVP as having a single testing opportunity, so the
-- relationship is many-to-one from the very first migration.
create table if not exists public.zs_campaigns (
  id uuid primary key default gen_random_uuid(),
  mvp_id uuid not null references public.zs_mvps(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 100),
  description text,
  objective text,
  tester_limit integer not null check (tester_limit between 1 and 1000),
  zp_reward integer not null check (zp_reward between 1 and 100000),
  deadline timestamptz,
  status text not null default 'draft'
    check (status in ('draft','live','paused','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists zs_campaigns_mvp_idx on public.zs_campaigns (mvp_id, created_at desc);
create index if not exists zs_campaigns_live_idx on public.zs_campaigns (status, created_at desc);

-- ── Tasks ───────────────────────────────────────────────────────────────────
create table if not exists public.zs_tasks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.zs_campaigns(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  description text,
  position integer not null default 0,
  required boolean not null default true
);

create index if not exists zs_tasks_campaign_idx on public.zs_tasks (campaign_id, position);

-- ── Participations ──────────────────────────────────────────────────────────
-- One row per tester per campaign. The unique constraint is the seat: it stops
-- a tester joining twice, and it is what the reward is keyed against.
create table if not exists public.zs_participations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.zs_campaigns(id) on delete cascade,
  tester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'started'
    check (status in ('started','submitted','approved','rejected')),
  completed_task_ids uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  unique (campaign_id, tester_id)
);

create index if not exists zs_participations_campaign_idx on public.zs_participations (campaign_id, status);
create index if not exists zs_participations_tester_idx on public.zs_participations (tester_id, started_at desc);

-- ── Feedback ────────────────────────────────────────────────────────────────
-- One per participation. Structured into named columns rather than a blob,
-- because section 56 wants Zero AI to summarise this later and free text in a
-- jsonb bag is not something you can aggregate.
create table if not exists public.zs_feedback (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique references public.zs_participations(id) on delete cascade,
  overall_rating integer not null check (overall_rating between 1 and 5),
  liked text,
  confusing text,
  suggestions text,
  additional_feedback text,
  screenshot_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ── Bug reports ─────────────────────────────────────────────────────────────
-- Many per participation: one testing session can surface several bugs.
create table if not exists public.zs_bug_reports (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.zs_participations(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 160),
  description text,
  reproduction_steps text,
  expected_result text,
  actual_result text,
  screenshot_urls text[] not null default '{}',
  status text not null default 'open' check (status in ('open','confirmed','fixed','wont_fix','invalid')),
  created_at timestamptz not null default now()
);

create index if not exists zs_bugs_participation_idx on public.zs_bug_reports (participation_id);

-- ── Tester statistics ───────────────────────────────────────────────────────
-- Derived, but stored: a tester profile and the discovery list both need these
-- counts, and recomputing them from the participation table on every page view
-- is the kind of query that is fine at 50 rows and not at 50,000.
create table if not exists public.zs_tester_stats (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  tests_started integer not null default 0,
  tests_submitted integer not null default 0,
  tests_approved integer not null default 0,
  tests_rejected integer not null default 0,
  bugs_reported integer not null default 0,
  total_zp_earned integer not null default 0,
  updated_at timestamptz not null default now()
);

/*
 * Level is computed, never stored.
 *
 * A stored level is a number that silently goes stale the moment the rule
 * changes, and then has to be backfilled. Deriving it means changing the
 * thresholds is a one-line edit that applies to everybody immediately.
 */
create or replace function public.zs_tester_level(p_approved integer, p_submitted integer)
returns text
language sql
immutable
as $$
  select case
    when p_approved >= 50 and p_submitted > 0 and p_approved::numeric / p_submitted >= 0.9 then 'Elite Tester'
    when p_approved >= 20 then 'Pro Tester'
    when p_approved >= 5  then 'Verified Tester'
    else 'Beginner Tester'
  end
$$;

-- ============================================================================
-- Row-level security — the permission matrix from section 54, in the database.
--
-- The spec is explicit that frontend validation is not enough. These policies
-- are the actual enforcement; the UI merely avoids showing people buttons that
-- would fail.
-- ============================================================================

alter table public.zs_mvps enable row level security;
alter table public.zs_campaigns enable row level security;
alter table public.zs_tasks enable row level security;
alter table public.zs_participations enable row level security;
alter table public.zs_feedback enable row level security;
alter table public.zs_bug_reports enable row level security;
alter table public.zs_tester_stats enable row level security;

-- Anyone, signed in or not, can see an MVP that is live. Its builder can see
-- it at any status, including the draft nobody else should know exists.
drop policy if exists zs_mvps_public_read on public.zs_mvps;
create policy zs_mvps_public_read on public.zs_mvps for select to anon, authenticated
  using (status in ('approved','live','completed') or builder_id = auth.uid());

drop policy if exists zs_mvps_builder_write on public.zs_mvps;
create policy zs_mvps_builder_write on public.zs_mvps for insert to authenticated
  with check (builder_id = auth.uid());

/* A builder may edit their own listing, and may not promote it themselves.
   Moving to approved or live is an admin decision, which is why the check
   below refuses those statuses rather than trusting the form not to send
   them. */
drop policy if exists zs_mvps_builder_update on public.zs_mvps;
create policy zs_mvps_builder_update on public.zs_mvps for update to authenticated
  using (builder_id = auth.uid())
  with check (builder_id = auth.uid() and status in ('draft','pending_review','paused','completed'));

drop policy if exists zs_mvps_builder_delete on public.zs_mvps;
create policy zs_mvps_builder_delete on public.zs_mvps for delete to authenticated
  using (builder_id = auth.uid() and status = 'draft');

-- Campaigns are visible when their MVP is.
drop policy if exists zs_campaigns_public_read on public.zs_campaigns;
create policy zs_campaigns_public_read on public.zs_campaigns for select to anon, authenticated
  using (
    builder_id = auth.uid()
    or exists (
      select 1 from public.zs_mvps m
      where m.id = mvp_id and m.status in ('approved','live','completed')
    )
  );

drop policy if exists zs_campaigns_builder_write on public.zs_campaigns;
create policy zs_campaigns_builder_write on public.zs_campaigns for all to authenticated
  using (builder_id = auth.uid())
  with check (
    builder_id = auth.uid()
    -- A campaign can only hang off an MVP you actually own.
    and exists (select 1 from public.zs_mvps m where m.id = mvp_id and m.builder_id = auth.uid())
  );

drop policy if exists zs_tasks_public_read on public.zs_tasks;
create policy zs_tasks_public_read on public.zs_tasks for select to anon, authenticated
  using (exists (select 1 from public.zs_campaigns c where c.id = campaign_id));

drop policy if exists zs_tasks_builder_write on public.zs_tasks;
create policy zs_tasks_builder_write on public.zs_tasks for all to authenticated
  using (exists (select 1 from public.zs_campaigns c where c.id = campaign_id and c.builder_id = auth.uid()))
  with check (exists (select 1 from public.zs_campaigns c where c.id = campaign_id and c.builder_id = auth.uid()));

/* A participation is private between the tester who owns it and the builder
   whose campaign it belongs to. Nobody else, including other testers on the
   same campaign, has any business reading it. */
drop policy if exists zs_participations_read on public.zs_participations;
create policy zs_participations_read on public.zs_participations for select to authenticated
  using (
    tester_id = auth.uid()
    or exists (select 1 from public.zs_campaigns c where c.id = campaign_id and c.builder_id = auth.uid())
  );

drop policy if exists zs_participations_tester_write on public.zs_participations;
create policy zs_participations_tester_write on public.zs_participations for update to authenticated
  using (tester_id = auth.uid())
  -- A tester can move their own work forward, and cannot mark it approved.
  -- Approval is the builder's, through the function below.
  with check (tester_id = auth.uid() and status in ('started','submitted'));

drop policy if exists zs_feedback_read on public.zs_feedback;
create policy zs_feedback_read on public.zs_feedback for select to authenticated
  using (exists (
    select 1 from public.zs_participations p
    join public.zs_campaigns c on c.id = p.campaign_id
    where p.id = participation_id and (p.tester_id = auth.uid() or c.builder_id = auth.uid())
  ));

drop policy if exists zs_feedback_tester_write on public.zs_feedback;
create policy zs_feedback_tester_write on public.zs_feedback for insert to authenticated
  with check (exists (
    select 1 from public.zs_participations p
    where p.id = participation_id and p.tester_id = auth.uid()
  ));

drop policy if exists zs_bugs_read on public.zs_bug_reports;
create policy zs_bugs_read on public.zs_bug_reports for select to authenticated
  using (exists (
    select 1 from public.zs_participations p
    join public.zs_campaigns c on c.id = p.campaign_id
    where p.id = participation_id and (p.tester_id = auth.uid() or c.builder_id = auth.uid())
  ));

drop policy if exists zs_bugs_tester_write on public.zs_bug_reports;
create policy zs_bugs_tester_write on public.zs_bug_reports for insert to authenticated
  with check (exists (
    select 1 from public.zs_participations p
    where p.id = participation_id and p.tester_id = auth.uid()
  ));

drop policy if exists zs_stats_public_read on public.zs_tester_stats;
create policy zs_stats_public_read on public.zs_tester_stats for select to anon, authenticated using (true);

notify pgrst, 'reload schema';
