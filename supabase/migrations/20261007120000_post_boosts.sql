-- ALREADY APPLIED to Supabase project tiyifgfsuzhcvdvntjmp on 2026-10-07 (migration "post_boosts"). Record only — do not re-run.
--
-- Member boosts replace admin-made ad campaigns.
--  * Members boost their own posts from /app/boost, paying from their wallet or with ZP
--    (₦500–₦500,000, 1–30 days, feed and/or clubs).
--  * 30% of the budget pays for reach. 70% is a reward pool: each member who does what the
--    boost asks (engage = like or comment, follow = follow the author, visit = open the link)
--    earns 20 ZP + 10 XP, once per boost, checked server-side. Accounts under a day old, and
--    the booster, cannot earn.
--  * Launching a boost earns the booster 50 XP.
--  * Unclaimed rewards are refunded (wallet or ZP) when a boost ends, runs out, is stopped by
--    the member, or is removed by an admin.
--
-- Tables (RLS on, no table policies — all access through the functions):
--   post_boosts, post_boost_actions (one reward per member per boost),
--   post_boost_views (one view per member per boost per day), post_boost_clicks.
--
-- Functions (definitions live in the database; see get_sponsored_posts etc.):
--   boost_quote(budget)                       pricing, shared with the app (features/boost/api.ts)
--   create_post_boost(...)                     charge + create + 50 XP
--   get_sponsored_posts(placement, limit)      what a viewer sees as Sponsored
--   record_boost_view(id) / record_boost_click(id)
--   claim_boost_reward(id)                     verify the action, pay 20 ZP + 10 XP
--   get_my_boosts() / pause_post_boost(id, paused) / stop_post_boost(id)
--   admin_list_boosts() / admin_set_boost_status(id, status)
--   boost_close(id, status) / boost_settle_due(owner)   internal: refunds + closing (not callable by the app)

create table if not exists public.post_boosts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  owner_id uuid not null,
  goal text not null check (goal in ('engage', 'follow', 'visit')),
  target_url text,
  show_in_feed boolean not null default true,
  show_in_clubs boolean not null default true,
  paid_with text not null check (paid_with in ('wallet', 'zp')),
  budget_naira integer not null check (budget_naira between 500 and 500000),
  reach_naira integer not null,
  reward_pool_naira integer not null,
  reward_zp integer not null default 20,
  reward_xp integer not null default 10,
  max_actions integer not null check (max_actions > 0),
  actions_count integer not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'stopped', 'removed')),
  refunded_naira integer not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.post_boost_actions (
  boost_id uuid not null, profile_id uuid not null, action text not null,
  zp_awarded integer not null, xp_awarded integer not null, created_at timestamptz not null default now(),
  primary key (boost_id, profile_id)
);
create table if not exists public.post_boost_views (
  boost_id uuid not null, profile_id uuid not null, day date not null default current_date,
  primary key (boost_id, profile_id, day)
);
create table if not exists public.post_boost_clicks (
  boost_id uuid not null, profile_id uuid not null, created_at timestamptz not null default now(),
  primary key (boost_id, profile_id)
);
