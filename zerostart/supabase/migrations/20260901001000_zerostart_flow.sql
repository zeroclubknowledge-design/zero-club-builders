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
