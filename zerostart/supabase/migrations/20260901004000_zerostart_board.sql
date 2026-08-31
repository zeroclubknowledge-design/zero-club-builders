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
