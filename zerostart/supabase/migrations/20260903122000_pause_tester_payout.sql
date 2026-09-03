-- ===========================================================================
-- ZeroStart stops paying ZP.
--
-- Two reasons, and the second is the real one:
--
--   1. The rule is now that only a referral and an admin-created quest mint
--      ZP. A tester reward is approved by a builder, not by Zero Club, so it
--      does not qualify.
--   2. ZeroStart is being repointed at Zero Ambassadors, so the campaign model
--      that this reward belongs to is on its way out regardless.
--
-- The review itself still works: a builder can still approve or reject, the
-- participation still moves to its final state, and the tester's counters
-- still update. Only the payment is withheld — so no work is lost and nothing
-- has to be re-reviewed when rewards come back under the ambassador model.
-- ===========================================================================

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

  /*
   * No award_profile_zp call. The idempotency work that used to guard it is
   * not deleted so much as no longer needed: with nothing being paid there is
   * nothing to pay twice. When the ambassador model defines its rewards, the
   * ledger call comes back here with the participation id as its source key,
   * exactly as before.
   */
  if p_approve then
    update public.zs_participations
    set status = 'approved', reviewed_at = now(), review_note = p_note
    where id = p_participation_id;

    insert into public.zs_tester_stats (profile_id, tests_approved)
    values (participation.tester_id, 1)
    on conflict (profile_id) do update
      set tests_approved = public.zs_tester_stats.tests_approved + 1,
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

  update public.zs_campaigns
  set status = 'completed'
  where id = campaign.id
    and status = 'live'
    and (
      select count(*) from public.zs_participations
      where campaign_id = campaign.id and status = 'approved'
    ) >= campaign.tester_limit;

  return jsonb_build_object('ok', true, 'approved', p_approve, 'zp_awarded', 0);
end;
$$;

grant execute on function public.zs_review_submission(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
