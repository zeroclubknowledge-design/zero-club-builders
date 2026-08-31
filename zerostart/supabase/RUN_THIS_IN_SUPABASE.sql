-- ===========================================================================
-- ZeroStart — run this once in the Zero Club Supabase project
--
-- Supabase → SQL Editor → New query → paste all of this → Run.
--
-- This is every migration joined in order. Running it twice is safe: every
-- table is "create table if not exists", every function is "create or
-- replace", every policy and trigger is dropped before it is created, and
-- every column add is "if not exists".
-- ===========================================================================


-- ===========================================================================
-- 20260901000000_zerostart_core.sql
-- ===========================================================================

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

-- ===========================================================================
-- 20260901001000_zerostart_flow.sql
-- ===========================================================================

-- ============================================================================
-- The two moments that decide whether ZeroStart is trustworthy.
--
-- Everything else in the product is a form or a list. These two are where
-- money-like value moves, and where a race or a double-click has to be
-- impossible rather than unlikely. Both live in the database for the same
-- reason the spec gives in section 53: a rule enforced in the browser is a
-- rule enforced only for people who use the browser.
-- ============================================================================

/*
 * Taking a seat on a campaign.
 *
 * The naive version reads the count, compares it to the limit, then inserts —
 * and two testers arriving in the same millisecond both read 19 of 20 and both
 * get in. This locks the campaign row first, so the count is taken while
 * nobody else can be counting, and the unique constraint on
 * (campaign_id, tester_id) catches the other way in.
 */
create or replace function public.zs_join_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  campaign public.zs_campaigns;
  taken integer;
  participation public.zs_participations;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- for update: the row is held until this transaction ends, so the count
  -- below cannot change underneath us.
  select * into campaign from public.zs_campaigns where id = p_campaign_id for update;

  if campaign.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if campaign.builder_id = caller then
    -- Section 53: nobody tests, or approves, their own work.
    return jsonb_build_object('ok', false, 'reason', 'own_campaign');
  end if;

  if campaign.status <> 'live' then
    return jsonb_build_object('ok', false, 'reason', 'not_live');
  end if;

  if campaign.deadline is not null and campaign.deadline < now() then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- Already in? Hand back the existing seat rather than erroring. Pressing
  -- "Start testing" twice should open the test, not report a problem.
  select * into participation
  from public.zs_participations
  where campaign_id = p_campaign_id and tester_id = caller;

  if participation.id is not null then
    return jsonb_build_object('ok', true, 'participation_id', participation.id, 'resumed', true);
  end if;

  -- A rejected attempt still occupies a seat until the builder frees it;
  -- counting only live seats keeps a campaign from being blocked by them.
  select count(*) into taken
  from public.zs_participations
  where campaign_id = p_campaign_id and status in ('started','submitted','approved');

  if taken >= campaign.tester_limit then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  insert into public.zs_participations (campaign_id, tester_id)
  values (p_campaign_id, caller)
  returning * into participation;

  insert into public.zs_tester_stats (profile_id, tests_started)
  values (caller, 1)
  on conflict (profile_id) do update
    set tests_started = public.zs_tester_stats.tests_started + 1,
        updated_at = now();

  return jsonb_build_object('ok', true, 'participation_id', participation.id, 'resumed', false);
end;
$$;

grant execute on function public.zs_join_campaign(uuid) to authenticated;

/*
 * Approving a submission, and paying for it exactly once.
 *
 * This is the requirement in section 42 stated plainly: clicking Approve twice
 * must not pay twice. It is not solved by disabling the button — a retried
 * request, a double tap and a replayed webhook all arrive again regardless.
 *
 * It is solved in two layers. The status check below refuses to act on a
 * participation that is not awaiting review, so a second call finds nothing to
 * do. And underneath that, award_profile_zp — Zero Club's existing ledger —
 * is keyed on (profile_id, event_type, source_key) with the participation id
 * as the source key, so even if both layers were somehow raced, the second
 * insert hits a unique violation and the balance is never touched.
 *
 * Reusing that function rather than writing a ZeroStart one is the point: one
 * ledger, one balance, and a rule that is already carrying real traffic.
 */
create or replace function public.zs_review_submission(
  p_participation_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  participation public.zs_participations;
  campaign public.zs_campaigns;
  paid boolean := false;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into participation
  from public.zs_participations
  where id = p_participation_id
  for update;

  if participation.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into campaign from public.zs_campaigns where id = participation.campaign_id;

  if campaign.builder_id <> caller then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  if participation.tester_id = caller then
    return jsonb_build_object('ok', false, 'reason', 'own_submission');
  end if;

  -- The first guard. A participation that has already been reviewed is not
  -- reviewable again, so a repeated click reports the decision rather than
  -- repeating it.
  if participation.status <> 'submitted' then
    return jsonb_build_object(
      'ok', false,
      'reason', case participation.status
        when 'approved' then 'already_approved'
        when 'rejected' then 'already_rejected'
        else 'not_submitted'
      end
    );
  end if;

  if p_approve then
    -- The second guard, and the one that actually cannot be beaten: the
    -- ledger's unique key. Returns false if this participation was somehow
    -- already paid, in which case the balance is left alone.
    paid := public.award_profile_zp(
      participation.tester_id,
      'zerostart_testing_reward',
      participation.id::text,
      campaign.zp_reward,
      jsonb_build_object(
        'campaign_id', campaign.id,
        'mvp_id', campaign.mvp_id,
        'source', 'ZeroStart'
      )
    );

    update public.zs_participations
    set status = 'approved', reviewed_at = now(), review_note = p_note
    where id = p_participation_id;

    insert into public.zs_tester_stats (profile_id, tests_approved, total_zp_earned)
    values (participation.tester_id, 1, case when paid then campaign.zp_reward else 0 end)
    on conflict (profile_id) do update
      set tests_approved = public.zs_tester_stats.tests_approved + 1,
          total_zp_earned = public.zs_tester_stats.total_zp_earned
            + case when paid then campaign.zp_reward else 0 end,
          updated_at = now();
  else
    update public.zs_participations
    set status = 'rejected', reviewed_at = now(), review_note = p_note
    where id = p_participation_id;

    insert into public.zs_tester_stats (profile_id, tests_rejected)
    values (participation.tester_id, 1)
    on conflict (profile_id) do update
      set tests_rejected = public.zs_tester_stats.tests_rejected + 1,
          updated_at = now();
  end if;

  -- A campaign that has filled its seats with approvals is done.
  update public.zs_campaigns
  set status = 'completed'
  where id = campaign.id
    and status = 'live'
    and (
      select count(*) from public.zs_participations
      where campaign_id = campaign.id and status = 'approved'
    ) >= campaign.tester_limit;

  return jsonb_build_object('ok', true, 'approved', p_approve, 'zp_awarded', case when paid then campaign.zp_reward else 0 end);
end;
$$;

grant execute on function public.zs_review_submission(uuid, boolean, text) to authenticated;

/*
 * Submitting the work. Kept server-side so the transition to `submitted` and
 * the feedback row land together — a submission with no feedback is a seat
 * consumed for nothing, and a builder cannot review it.
 */
create or replace function public.zs_submit_test(
  p_participation_id uuid,
  p_rating integer,
  p_liked text default null,
  p_confusing text default null,
  p_suggestions text default null,
  p_additional text default null,
  p_screenshots text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  participation public.zs_participations;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into participation from public.zs_participations where id = p_participation_id for update;

  if participation.id is null or participation.tester_id <> caller then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  if participation.status <> 'started' then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'reason', 'rating_required');
  end if;

  insert into public.zs_feedback (
    participation_id, overall_rating, liked, confusing, suggestions,
    additional_feedback, screenshot_urls
  )
  values (
    p_participation_id, p_rating, p_liked, p_confusing, p_suggestions,
    p_additional, coalesce(p_screenshots, '{}')
  )
  on conflict (participation_id) do nothing;

  update public.zs_participations
  set status = 'submitted', submitted_at = now()
  where id = p_participation_id;

  insert into public.zs_tester_stats (profile_id, tests_submitted)
  values (caller, 1)
  on conflict (profile_id) do update
    set tests_submitted = public.zs_tester_stats.tests_submitted + 1,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.zs_submit_test(uuid, integer, text, text, text, text, text[]) to authenticated;

notify pgrst, 'reload schema';

-- ===========================================================================
-- 20260901002000_zerostart_admin_review.sql
-- ===========================================================================

-- ============================================================================
-- The missing link in the chain.
--
-- The core schema deliberately refuses to let a builder move their own MVP to
-- 'approved' or 'live' — that is an admin decision, and the RLS check enforces
-- it. But nothing yet gave an admin a way to make that decision, so an MVP
-- submitted for review could never leave the queue.
--
-- Admin is not redefined here. `is_zero_club_admin()` already exists and is
-- already carrying Zero Club's traffic; a second definition would be a second
-- thing to keep in sync, and the two would eventually disagree.
-- ============================================================================

create or replace function public.zs_review_mvp(
  p_mvp_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mvp public.zs_mvps;
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into mvp from public.zs_mvps where id = p_mvp_id for update;

  if mvp.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Only a submission is reviewable. Re-approving something already live is a
  -- no-op worth reporting rather than performing.
  if mvp.status <> 'pending_review' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  update public.zs_mvps
  set status = case when p_approve then 'approved' else 'rejected' end,
      review_note = p_note,
      updated_at = now()
  where id = p_mvp_id;

  return jsonb_build_object('ok', true, 'approved', p_approve);
end;
$$;

grant execute on function public.zs_review_mvp(uuid, boolean, text) to authenticated;

/*
 * Featuring, which is also an admin-only lever. Separate from approval on
 * purpose: an MVP can be perfectly fine without being the one on the front
 * page, and conflating the two would mean the only way to unfeature something
 * is to un-approve it.
 */
create or replace function public.zs_set_mvp_featured(p_mvp_id uuid, p_featured boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  update public.zs_mvps
  set is_featured = p_featured, updated_at = now()
  where id = p_mvp_id and status in ('approved','live','completed');

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'featured', p_featured);
end;
$$;

grant execute on function public.zs_set_mvp_featured(uuid, boolean) to authenticated;

/*
 * The admin queue itself.
 *
 * A plain select would be blocked by the read policy, which only exposes
 * approved-or-later MVPs and your own. Rather than widening that policy — and
 * so widening what every query can see — the queue is a function that checks
 * for admin first and returns nothing to everyone else.
 */
create or replace function public.zs_pending_mvps()
returns setof public.zs_mvps
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then
    return;
  end if;

  return query
    select * from public.zs_mvps
    where status = 'pending_review'
    order by created_at asc;
end;
$$;

grant execute on function public.zs_pending_mvps() to authenticated;

notify pgrst, 'reload schema';

-- ===========================================================================
-- 20260901003000_zerostart_open_listing.sql
-- ===========================================================================

-- ===========================================================================
-- Listings go live immediately, and MVPs can carry media.
--
-- The original design gated every listing behind an admin approval. That was
-- the wrong shape for this product: a builder who has just shipped something
-- wants testers today, and a queue that only one person can clear is a queue
-- that stalls the moment they are busy. Nothing is earned by making everyone
-- wait — the ZP is only paid when a builder approves a submission, so the
-- money-like decision still has a human on it.
--
-- Moderation becomes reactive instead of preventative: an admin can take a
-- listing down after the fact. That trades a guaranteed delay for every honest
-- builder against a short window of exposure for a bad one, which is the right
-- way round.
-- ===========================================================================

-- ------------------------------------------------------------------ media ---

alter table public.zs_mvps
  add column if not exists media_urls text[] not null default '{}';

comment on column public.zs_mvps.media_urls is
  'Screenshots and clips of the product, in display order. The first is used as the cover.';

-- --------------------------------------------------------------- go live ---

alter table public.zs_mvps alter column status set default 'live';

/* Anything already sitting in the review queue is released rather than
   stranded — those builders submitted under the old rule and should not be
   waiting on a queue that no longer exists. */
update public.zs_mvps
set status = 'live', updated_at = now()
where status in ('pending_review', 'approved');

/*
 * The builder now controls their own listing's visibility, including 'live'.
 * They still cannot set 'rejected': that is a moderation outcome, and a
 * builder quietly clearing their own takedown would make the takedown
 * pointless.
 */
drop policy if exists zs_mvps_builder_update on public.zs_mvps;
create policy zs_mvps_builder_update on public.zs_mvps for update to authenticated
  using (builder_id = auth.uid())
  with check (
    builder_id = auth.uid()
    and status in ('draft', 'live', 'paused', 'completed')
  );

/* Admins can see everything, so the moderation screen can show drafts and
   taken-down listings that the public read rule hides. */
drop policy if exists zs_mvps_public_read on public.zs_mvps;
create policy zs_mvps_public_read on public.zs_mvps for select to anon, authenticated
  using (
    status in ('approved', 'live', 'completed')
    or builder_id = auth.uid()
    or public.is_zero_club_admin()
  );

-- ------------------------------------------------------------ moderation ---

/* Replaces the approval pair. Approval before publishing is gone; the ability
   to remove something that should not be up is not. */
drop function if exists public.zs_review_mvp(uuid, boolean, text);
drop function if exists public.zs_pending_mvps();

create or replace function public.zs_take_down_mvp(p_mvp_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  update public.zs_mvps
  set status = 'rejected', review_note = p_note, updated_at = now()
  where id = p_mvp_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  /* Its campaigns stop recruiting too. Leaving them live would let testers
     keep joining work on a product that has just been taken down, and they
     would have every right to expect to be paid for it. */
  update public.zs_campaigns
  set status = 'cancelled', updated_at = now()
  where mvp_id = p_mvp_id and status in ('live', 'paused');

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.zs_take_down_mvp(uuid, text) to authenticated;

/* Restoring, so a takedown is not a one-way door. */
create or replace function public.zs_restore_mvp(p_mvp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  update public.zs_mvps
  set status = 'live', review_note = null, updated_at = now()
  where id = p_mvp_id and status = 'rejected';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.zs_restore_mvp(uuid) to authenticated;

-- --------------------------------------------------------------- storage ---

/*
 * Public bucket: these are product screenshots meant to be seen by anyone
 * browsing, so signed URLs would add a round trip and an expiry problem for no
 * privacy benefit.
 *
 * Files are stored as <builder_id>/<random>.<ext>. The first folder segment is
 * what the policies key off, so nobody can write into anyone else's folder.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zerostart-media',
  'zerostart-media',
  true,
  52428800, -- 50 MB, enough for a short screen recording
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ZeroStart media is publicly readable" on storage.objects;
create policy "ZeroStart media is publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'zerostart-media');

drop policy if exists "ZeroStart builders upload to their own folder" on storage.objects;
create policy "ZeroStart builders upload to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'zerostart-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ZeroStart builders replace their own media" on storage.objects;
create policy "ZeroStart builders replace their own media" on storage.objects
  for update to authenticated
  using (bucket_id = 'zerostart-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ZeroStart builders delete their own media" on storage.objects;
create policy "ZeroStart builders delete their own media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'zerostart-media' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';

-- ===========================================================================
-- 20260901004000_zerostart_board.sql
-- ===========================================================================

-- ===========================================================================
-- The board: live counts, recent activity, and the tester leaderboard.
--
-- All three are SECURITY DEFINER because the honest policies hide most of what
-- they need. A participation is readable only by its tester and the campaign's
-- builder — correct, and it means no ordinary select can count how many tests
-- were approved this week. Rather than widening that policy and exposing
-- everyone's submissions to everyone, each function returns exactly the
-- aggregate or the handful of columns the board displays.
--
-- What is deliberately NOT exposed: feedback text, bug reports, review notes,
-- and any link between a named tester and what they actually wrote. The board
-- says "someone completed a test on X". It never says what they thought of it.
-- ===========================================================================

/*
 * The numbers in the pill under the header.
 *
 * One round trip for all of them. Five separate counts would be five requests
 * on a page that is already fetching campaigns, activity and a leaderboard.
 */
create or replace function public.zs_board_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'live_campaigns', (
      select count(*) from public.zs_campaigns where status = 'live'
    ),
    'open_seats', (
      select coalesce(sum(greatest(c.tester_limit - coalesce(taken.n, 0), 0)), 0)
      from public.zs_campaigns c
      left join (
        select campaign_id, count(*) as n
        from public.zs_participations
        where status in ('started','submitted','approved')
        group by campaign_id
      ) taken on taken.campaign_id = c.id
      where c.status = 'live'
    ),
    'testers', (
      select count(distinct tester_id) from public.zs_participations
    ),
    'tests_approved', (
      select count(*) from public.zs_participations where status = 'approved'
    ),
    'zp_paid', (
      -- Read from the ledger, not from zs_tester_stats. The ledger is the
      -- thing that actually moved the money; the stats table is a convenience
      -- that could in principle drift from it.
      select coalesce(sum(amount), 0) from public.zp_events
      where event_type = 'zerostart_testing_reward'
    )
  );
$$;

grant execute on function public.zs_board_stats() to anon, authenticated;

/*
 * Recent activity.
 *
 * Joins and approvals only — a submission is a private thing between a tester
 * and a builder until the builder has acted on it, and announcing "someone
 * just submitted" would put a spotlight on work that has not been reviewed.
 */
create or replace function public.zs_recent_activity(p_limit integer default 8)
returns table (
  id uuid,
  kind text,
  happened_at timestamptz,
  tester_name text,
  tester_avatar text,
  mvp_name text,
  mvp_logo text,
  campaign_id uuid,
  zp integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    case when p.status = 'approved' then 'approved' else 'joined' end as kind,
    case when p.status = 'approved' then p.reviewed_at else p.started_at end as happened_at,
    coalesce(nullif(trim(pr.full_name), ''), pr.username, 'A tester') as tester_name,
    pr.avatar_url,
    m.name,
    m.logo_url,
    c.id,
    case when p.status = 'approved' then c.zp_reward else 0 end
  from public.zs_participations p
  join public.zs_campaigns c on c.id = p.campaign_id
  join public.zs_mvps m on m.id = c.mvp_id
  join public.profiles pr on pr.id = p.tester_id
  where p.status in ('started', 'approved')
    and m.status in ('approved','live','completed')
  order by (case when p.status = 'approved' then p.reviewed_at else p.started_at end) desc nulls last
  limit greatest(1, least(coalesce(p_limit, 8), 40));
$$;

grant execute on function public.zs_recent_activity(integer) to anon, authenticated;

/*
 * The leaderboard.
 *
 * Ordered by approved tests first and ZP second. Ordering by ZP alone would
 * rank whoever happened to test the most generous campaigns, which rewards
 * luck rather than work.
 *
 * Reads zs_tester_stats rather than counting participations, because this runs
 * on every page load and the counters are already maintained by the flow
 * functions.
 */
create or replace function public.zs_leaderboard(p_limit integer default 10)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  avatar_url text,
  tests_approved integer,
  total_zp_earned integer,
  level text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.profile_id,
    coalesce(nullif(trim(pr.full_name), ''), pr.username, 'A tester'),
    pr.username,
    pr.avatar_url,
    s.tests_approved,
    s.total_zp_earned,
    public.zs_tester_level(s.tests_approved, s.tests_submitted)
  from public.zs_tester_stats s
  join public.profiles pr on pr.id = s.profile_id
  where s.tests_approved > 0
  order by s.tests_approved desc, s.total_zp_earned desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

grant execute on function public.zs_leaderboard(integer) to anon, authenticated;

notify pgrst, 'reload schema';

-- ===========================================================================
-- 20260901005000_zerostart_editing.sql
-- ===========================================================================

-- ===========================================================================
-- Editable campaigns, and the product page's numbers.
--
-- The policies already let a builder update their own campaign — it is
-- "for all". What they do not do is protect the people who already joined it,
-- and that is the part that has to be right before editing is offered at all.
-- ===========================================================================

/*
 * A tester takes a seat on the strength of a stated reward. Letting the
 * builder lower it afterwards would mean the deal on offer is not the deal
 * being honoured, and the tester has already spent the time by then.
 *
 * This lives in a trigger rather than the form because it is a promise, not a
 * validation. A disabled input is a courtesy; a trigger is the actual rule,
 * and it holds whatever sends the request.
 */
create or replace function public.zs_guard_campaign_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  taken integer;
begin
  select count(*) into taken
  from public.zs_participations
  where campaign_id = new.id and status in ('started','submitted','approved');

  if taken = 0 then
    -- Nobody has committed anything yet, so anything may still change.
    return new;
  end if;

  if new.zp_reward < old.zp_reward then
    raise exception
      'Cannot lower the reward: % tester(s) already joined at % ZP.', taken, old.zp_reward
      using errcode = 'check_violation';
  end if;

  if new.tester_limit < taken then
    raise exception
      'Cannot set the limit below % — that many testers already hold a seat.', taken
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists zs_campaigns_guard_edit on public.zs_campaigns;
create trigger zs_campaigns_guard_edit
  before update on public.zs_campaigns
  for each row
  when (old.zp_reward is distinct from new.zp_reward
     or old.tester_limit is distinct from new.tester_limit)
  execute function public.zs_guard_campaign_edit();

/*
 * Deleting a task somebody has already ticked would silently rewrite what they
 * agreed to do, and their completed_task_ids would point at nothing. Editing
 * the wording is fine; removing the task is not.
 */
create or replace function public.zs_guard_task_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.zs_participations
    where campaign_id = old.campaign_id and old.id = any(completed_task_ids)
  ) then
    raise exception 'Cannot remove a task that testers have already completed.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists zs_tasks_guard_delete on public.zs_tasks;
create trigger zs_tasks_guard_delete
  before delete on public.zs_tasks
  for each row
  execute function public.zs_guard_task_delete();

-- ------------------------------------------------------- the product page ---

/*
 * Everything the product page shows, in one call.
 *
 * The ranks are the reason this is a function rather than a query. Working out
 * "#24 of 41 in Productivity" from the client would mean fetching every live
 * MVP in the category and counting locally — fine at 41, useless at 4,100.
 *
 * Rank is by the best reward the product is currently offering. That is the
 * number a tester is choosing on, so it is the honest thing to be ranked by.
 */
create or replace function public.zs_mvp_overview(p_mvp_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mvp public.zs_mvps;
  best integer;
  result jsonb;
begin
  select * into mvp from public.zs_mvps where id = p_mvp_id;
  if mvp.id is null then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(max(zp_reward), 0) into best
  from public.zs_campaigns
  where mvp_id = p_mvp_id and status = 'live';

  with live as (
    select m.id, m.category, coalesce(max(c.zp_reward), 0) as best_zp
    from public.zs_mvps m
    left join public.zs_campaigns c on c.mvp_id = m.id and c.status = 'live'
    where m.status in ('approved','live','completed')
    group by m.id, m.category
  )
  select jsonb_build_object(
    'found', true,
    'zp_offered', best,
    'overall_rank', (select count(*) + 1 from live where best_zp > best),
    'overall_total', (select count(*) from live),
    'category_rank', (
      select count(*) + 1 from live
      where category = mvp.category and best_zp > best
    ),
    'category_total', (select count(*) from live where category = mvp.category),
    'campaigns', (
      select count(*) from public.zs_campaigns where mvp_id = p_mvp_id and status = 'live'
    ),
    'testers', (
      select count(*) from public.zs_participations p
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id
    ),
    'tests_approved', (
      select count(*) from public.zs_participations p
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id and p.status = 'approved'
    ),
    'feedback_count', (
      -- The count only. What anyone actually wrote stays between the tester
      -- and the builder.
      select count(*) from public.zs_feedback f
      join public.zs_participations p on p.id = f.participation_id
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id
    ),
    'average_rating', (
      select round(avg(f.overall_rating)::numeric, 1) from public.zs_feedback f
      join public.zs_participations p on p.id = f.participation_id
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id and p.status = 'approved'
    ),
    'zp_paid', (
      select coalesce(sum(c.zp_reward), 0) from public.zs_participations p
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id and p.status = 'approved'
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.zs_mvp_overview(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
