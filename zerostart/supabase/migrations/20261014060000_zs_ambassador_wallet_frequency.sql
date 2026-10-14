-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp on 2026-10-14 (migration "zs_ambassador_wallet_frequency").
-- Kept as a record only. Do not re-run.
--
-- Zero Wallet for ambassadors: weekly or monthly payout schedule, self-service withdrawal.
--
-- * zs_ambassadors.payout_frequency, zs_ambassador_applications.payout_frequency
--     text not null default 'weekly' check (payout_frequency in ('weekly','monthly'))
-- * Trigger zs_ambassadors_copy_frequency (BEFORE INSERT on zs_ambassadors) copies the
--   frequency the person chose on their latest application.
-- * zs_cycle_start(freq, at)  -> Monday of the week, or the 1st of the month.
-- * zs_cycle_paid(profile)    -> true when a payout already exists since the cycle started.
-- * zs_set_payout_frequency(p_frequency) -> updates the ambassador row and any pending application.
-- * zs_withdraw_earnings()    -> active ambassadors only; advisory-locked; once per cycle;
--   moves approved ("ready") earnings to the Zero Club wallet via zs_pay_ambassador.
--   Returns {ok, amount} | {ok:false, reason:'already_withdrawn', next_on} | {ok:false, reason:'nothing_to_withdraw'}.
-- * zs_pay_ambassador: now takes pg_advisory_xact_lock(hashtext('zs_pay_'||p_profile)) so a
--   withdrawal and an admin payout run can't pay the same commission twice.
-- * zs_admin_run_payouts: skips ambassadors whose current cycle is already paid.
-- * zs_my_earnings: also returns payout_frequency, cycle_paid, next_withdraw_on.
-- * zs_ambassador_me: also returns payout_frequency.
--
-- Verified in a rolled-back test: frequency copied from the application; first withdrawal
-- credited the wallet; second returned already_withdrawn (next Monday); switching to monthly
-- moved next_withdraw_on to the 1st of next month.

create or replace function public.zs_cycle_start(p_frequency text, p_at timestamptz default now())
returns date language sql immutable as $$
  select case when p_frequency = 'monthly' then date_trunc('month', p_at)::date else public.zs_week_start(p_at) end;
$$;

create or replace function public.zs_cycle_paid(p_profile uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.zs_payouts p join public.zs_ambassadors a on a.profile_id = p.profile_id
    where p.profile_id = p_profile and p.paid_at >= public.zs_cycle_start(a.payout_frequency)::timestamptz
  );
$$;

create or replace function public.zs_set_payout_frequency(p_frequency text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); n integer := 0;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if p_frequency not in ('weekly', 'monthly') then return jsonb_build_object('ok', false, 'reason', 'bad_frequency'); end if;
  update public.zs_ambassadors set payout_frequency = p_frequency, updated_at = now() where profile_id = me;
  get diagnostics n = row_count;
  update public.zs_ambassador_applications set payout_frequency = p_frequency, updated_at = now()
  where profile_id = me and status = 'pending';
  return jsonb_build_object('ok', true, 'ambassador', n > 0);
end $$;

create or replace function public.zs_withdraw_earnings()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); amb public.zs_ambassadors; paid numeric;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  select * into amb from public.zs_ambassadors where profile_id = me and status = 'active';
  if amb.profile_id is null then return jsonb_build_object('ok', false, 'reason', 'not_an_ambassador'); end if;
  perform pg_advisory_xact_lock(hashtext('zs_pay_' || me::text));
  if public.zs_cycle_paid(me) then
    return jsonb_build_object('ok', false, 'reason', 'already_withdrawn',
      'next_on', public.zs_cycle_start(amb.payout_frequency) + case when amb.payout_frequency = 'monthly' then interval '1 month' else interval '7 days' end);
  end if;
  paid := public.zs_pay_ambassador(me, me, 'ZeroStart earnings withdrawal');
  if coalesce(paid, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_to_withdraw'); end if;
  return jsonb_build_object('ok', true, 'amount', paid);
end $$;

-- (zs_pay_ambassador, zs_admin_run_payouts, zs_my_earnings and zs_ambassador_me were patched
--  in place; see the live definitions with pg_get_functiondef.)
