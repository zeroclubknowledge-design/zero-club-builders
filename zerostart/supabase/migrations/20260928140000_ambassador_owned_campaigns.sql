-- ###########################################################################
-- ALREADY APPLIED TO PRODUCTION (2026-09-28). DO NOT RUN THIS AGAIN.
-- ###########################################################################
-- Ambassadors create their own campaigns; admins review them once they end.
--
--   * An approved ambassador launches a campaign (live immediately, with an
--     end date no more than 60 days out) and gets its link straight away.
--   * Commission accrues from payments by members who joined through it, but
--     is only payable once an admin reviews the ended campaign and approves
--     it — at which point it is paid at once, with any bonus the admin sets.
--     A rejected campaign's commission is never paid.
--   * Members referred by an approved campaign keep earning the ambassador
--     commission afterwards; that is paid by the regular payout run.
--   * Admins can pause or take down a campaign at any time.
-- ===========================================================================

alter table public.zs_amb_campaigns add column if not exists owner_id uuid references public.zs_ambassadors(profile_id) on delete cascade;
alter table public.zs_amb_campaigns add column if not exists review_status text;
alter table public.zs_amb_campaigns add column if not exists review_note text;
alter table public.zs_amb_campaigns add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.zs_amb_campaigns add column if not exists reviewed_at timestamptz;
alter table public.zs_amb_campaigns add column if not exists bonus_awarded numeric not null default 0;
alter table public.zs_amb_campaigns add column if not exists ended_at timestamptz;

alter table public.zs_amb_campaigns drop constraint if exists zs_amb_campaigns_status_check;
alter table public.zs_amb_campaigns add constraint zs_amb_campaigns_status_check
  check (status in ('draft', 'live', 'paused', 'ended', 'removed'));
alter table public.zs_amb_campaigns drop constraint if exists zs_amb_campaigns_review_status_check;
alter table public.zs_amb_campaigns add constraint zs_amb_campaigns_review_status_check
  check (review_status is null or review_status in ('pending', 'approved', 'rejected'));

create index if not exists zs_campaigns_owner_idx on public.zs_amb_campaigns (owner_id, created_at desc);
create index if not exists zs_campaigns_review_idx on public.zs_amb_campaigns (review_status, ended_at);

-- Several payouts can now happen in one week (one per approved campaign).
alter table public.zs_payouts drop constraint if exists zs_payouts_profile_id_week_start_key;

-- Campaigns past their end date close themselves and wait for review.
create or replace function public.zs_close_expired_campaigns()
returns void
language sql
security definer
set search_path = public
as $$
  update public.zs_amb_campaigns
  set status = 'ended', ended_at = coalesce(ended_at, ends_at), review_status = coalesce(review_status, 'pending'), updated_at = now()
  where status in ('live', 'paused') and ends_at is not null and ends_at <= now();
$$;

-- ------------------------------------------------ what is payable now -----
-- Only commission from approved campaigns, plus admin bonuses, is payable.
drop function if exists public.zs_unpaid_breakdown(uuid, date);
create function public.zs_unpaid_breakdown(p_profile uuid, p_until date default null)
returns table (
  campaign_id uuid,
  title text,
  week_start date,
  results integer,
  sales numeric,
  base_amount numeric,
  bonus_amount numeric,
  bonus_tiers jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, min(k.week_start), 0, sum(k.gross), sum(k.amount), 0::numeric, '[]'::jsonb
  from public.zs_commissions k
  join public.zs_amb_campaigns c on c.id = k.campaign_id
  where k.ambassador_id = p_profile and k.payout_id is null
    and c.review_status = 'approved'
    and (p_until is null or k.week_start <= p_until)
  group by c.id, c.title
  union all
  select null::uuid, 'Bonus: ' || b.reason, b.week_start, 0, 0::numeric, 0::numeric, b.amount, '[]'::jsonb
  from public.zs_bonuses b
  where b.ambassador_id = p_profile and b.payout_id is null and (p_until is null or b.week_start <= p_until);
$$;
revoke all on function public.zs_unpaid_breakdown(uuid, date) from public, anon, authenticated;

-- Pays one ambassador everything payable right now. Internal.
create or replace function public.zs_pay_ambassador(p_profile uuid, p_admin uuid, p_label text default 'ZeroStart payout')
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  comm numeric;
  bonus numeric;
  n integer;
  total numeric;
  v_payout uuid;
  ref text := 'zs-payout-' || gen_random_uuid();
  cur text;
begin
  select coalesce(sum(b.base_amount), 0), coalesce(sum(b.bonus_amount), 0)
  into comm, bonus
  from public.zs_unpaid_breakdown(p_profile, null) b;
  total := comm + bonus;
  if total <= 0 then return 0; end if;

  select payout_currency into cur from public.zs_ambassadors where profile_id = p_profile;
  select count(distinct k.buyer_id) into n
  from public.zs_commissions k join public.zs_amb_campaigns c on c.id = k.campaign_id
  where k.ambassador_id = p_profile and k.payout_id is null and c.review_status = 'approved';

  insert into public.zs_payouts (profile_id, week_start, results, base_amount, bonus_amount, total, currency, reference, paid_by)
  values (p_profile, public.zs_week_start(), coalesce(n, 0), comm, bonus, total, coalesce(cur, 'NGN'), ref, p_admin)
  returning id into v_payout;

  update public.zs_commissions k set payout_id = v_payout
  from public.zs_amb_campaigns c
  where c.id = k.campaign_id and k.ambassador_id = p_profile and k.payout_id is null and c.review_status = 'approved';
  update public.zs_bonuses set payout_id = v_payout where ambassador_id = p_profile and payout_id is null;

  perform public.wallet_apply(p_profile, 'credit', total, 'zerostart_payout', p_label, ref,
    jsonb_build_object('commission', comm, 'bonus', bonus, 'payout_id', v_payout));

  begin
    insert into public.notifications (recipient_id, actor_id, type, content)
    values (p_profile, coalesce(p_admin, p_profile), 'system',
            'Your ZeroStart ambassador payout has landed in your Zero Club wallet.');
  exception when others then null;
  end;

  return total;
end;
$$;
revoke all on function public.zs_pay_ambassador(uuid, uuid, text) from public, anon, authenticated;

-- --------------------------------------------------- ambassador side -----
create or replace function public.zs_create_campaign(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  ends timestamptz := nullif(p->>'ends_at', '')::timestamptz;
  cid uuid;
  new_code text;
begin
  if caller is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if not exists (select 1 from public.zs_ambassadors where profile_id = caller and status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'not_an_ambassador');
  end if;
  if length(btrim(coalesce(p->>'title', ''))) < 4 then return jsonb_build_object('ok', false, 'reason', 'title_required'); end if;
  if ends is null or ends <= now() + interval '1 day' or ends > now() + interval '60 days' then
    return jsonb_build_object('ok', false, 'reason', 'bad_end_date');
  end if;

  perform public.zs_close_expired_campaigns();
  if (select count(*) from public.zs_amb_campaigns where owner_id = caller and status in ('live', 'paused')) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_live');
  end if;

  insert into public.zs_amb_campaigns (
    title, summary, description, cover_url, partner_name, partner_url, goal, tracking,
    locations, starts_at, ends_at, status, owner_id, created_by
  ) values (
    btrim(p->>'title'),
    nullif(left(btrim(coalesce(p->>'summary', '')), 280), ''),
    nullif(left(btrim(coalesce(p->>'description', '')), 4000), ''),
    nullif(btrim(coalesce(p->>'cover_url', '')), ''),
    nullif(btrim(coalesce(p->>'partner_name', '')), ''),
    nullif(btrim(coalesce(p->>'partner_url', '')), ''),
    case when p->>'goal' in ('signups', 'activations', 'event', 'sales', 'awareness', 'other') then p->>'goal' else 'signups' end,
    case when p->>'tracking' in ('link', 'both') then p->>'tracking' else 'both' end,
    nullif(btrim(coalesce(p->>'locations', '')), ''),
    now(), ends, 'live', caller, caller
  ) returning id into cid;

  new_code := public.zs_new_code();
  insert into public.zs_campaign_members (campaign_id, profile_id, code) values (cid, caller, new_code);

  return jsonb_build_object('ok', true, 'id', cid, 'code', new_code);
end;
$$;
grant execute on function public.zs_create_campaign(jsonb) to authenticated;

create or replace function public.zs_update_my_campaign(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.zs_amb_campaigns;
  ends timestamptz := nullif(p->>'ends_at', '')::timestamptz;
begin
  select * into c from public.zs_amb_campaigns where id = p_id for update;
  if c.id is null or c.owner_id is distinct from auth.uid() then return jsonb_build_object('ok', false, 'reason', 'not_yours'); end if;
  if c.status not in ('live', 'paused') then return jsonb_build_object('ok', false, 'reason', 'not_editable'); end if;
  if ends is not null and (ends <= now() or ends > c.starts_at + interval '60 days') then
    return jsonb_build_object('ok', false, 'reason', 'bad_end_date');
  end if;

  update public.zs_amb_campaigns set
    title = coalesce(nullif(btrim(coalesce(p->>'title', '')), ''), title),
    summary = case when p ? 'summary' then nullif(left(btrim(coalesce(p->>'summary', '')), 280), '') else summary end,
    description = case when p ? 'description' then nullif(left(btrim(coalesce(p->>'description', '')), 4000), '') else description end,
    cover_url = case when p ? 'cover_url' then nullif(btrim(coalesce(p->>'cover_url', '')), '') else cover_url end,
    locations = case when p ? 'locations' then nullif(btrim(coalesce(p->>'locations', '')), '') else locations end,
    ends_at = coalesce(ends, ends_at),
    updated_at = now()
  where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.zs_update_my_campaign(uuid, jsonb) to authenticated;

create or replace function public.zs_end_my_campaign(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.zs_amb_campaigns
  set status = 'ended', ended_at = now(), review_status = 'pending', updated_at = now()
  where id = p_id and owner_id = auth.uid() and status in ('live', 'paused');
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_editable'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.zs_end_my_campaign(uuid) to authenticated;

-- The ambassador's own campaigns, with everything the dashboard shows.
create or replace function public.zs_my_campaigns()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then return '[]'::jsonb; end if;
  perform public.zs_close_expired_campaigns();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.sort_key, x.created_at desc)
    from (
      select c.id, c.title, c.summary, c.description, c.cover_url, c.partner_name, c.partner_url, c.goal, c.tracking,
             c.locations, c.starts_at, c.ends_at, c.ended_at, c.status, c.review_status, c.review_note,
             c.bonus_awarded, c.created_at, m.code as my_code, true as joined,
             case when c.status = 'live' then 0 when c.status = 'paused' then 1 when c.review_status = 'pending' then 2 else 3 end as sort_key,
             (select count(*) from public.zs_campaign_results r where r.campaign_id = c.id and r.kind = 'signup' and r.status = 'verified') as new_members,
             (select count(distinct k.buyer_id) from public.zs_commissions k where k.campaign_id = c.id) as paying_members,
             coalesce((select sum(k.gross) from public.zs_commissions k where k.campaign_id = c.id), 0) as sales,
             coalesce((select sum(k.amount) from public.zs_commissions k where k.campaign_id = c.id), 0) as commission,
             coalesce((select sum(k.amount) from public.zs_commissions k where k.campaign_id = c.id and k.payout_id is not null), 0) as commission_paid,
             coalesce((select sum(r.quantity) from public.zs_campaign_results r where r.campaign_id = c.id and r.kind = 'proof' and r.status <> 'rejected'), 0) as reported_results,
             (select count(*) from public.zs_campaign_results r where r.campaign_id = c.id and r.kind = 'signup' and r.status = 'verified' and r.week_start = public.zs_week_start()) as my_week_results,
             (select count(*) from public.zs_campaign_results r where r.campaign_id = c.id and r.kind = 'signup' and r.status = 'verified') as my_total_results,
             coalesce((select sum(r.quantity) from public.zs_campaign_results r where r.campaign_id = c.id and r.status = 'pending'), 0) as my_pending_results,
             1 as ambassadors,
             c.bonus_tiers, c.reward_signup, c.reward_activation, c.reward_proof, c.proof_unit_label, c.max_ambassadors
      from public.zs_amb_campaigns c
      join public.zs_campaign_members m on m.campaign_id = c.id and m.profile_id = caller
      where c.status <> 'removed' or c.owner_id = caller
    ) x
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.zs_my_campaigns() to authenticated;

-- Proof of offline results is now evidence for the review, whoever owns it.
create or replace function public.zs_submit_campaign_proof(
  p_campaign_id uuid,
  p_quantity integer,
  p_evidence text,
  p_evidence_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  c public.zs_amb_campaigns;
begin
  if caller is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  select * into c from public.zs_amb_campaigns where id = p_campaign_id;
  if c.id is null or c.status in ('removed', 'draft') or coalesce(c.review_status, 'pending') <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_live');
  end if;
  if not exists (select 1 from public.zs_campaign_members where campaign_id = c.id and profile_id = caller) then
    return jsonb_build_object('ok', false, 'reason', 'not_joined');
  end if;
  if coalesce(p_quantity, 0) < 1 or p_quantity > 100000 then return jsonb_build_object('ok', false, 'reason', 'bad_quantity'); end if;
  if length(btrim(coalesce(p_evidence, ''))) < 15 then return jsonb_build_object('ok', false, 'reason', 'evidence_required'); end if;

  insert into public.zs_campaign_results (campaign_id, ambassador_id, kind, quantity, evidence, evidence_url, status)
  values (c.id, caller, 'proof', p_quantity, btrim(p_evidence), nullif(btrim(coalesce(p_evidence_url, '')), ''), 'pending');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.zs_my_earnings()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  this_week date := public.zs_week_start();
  amb public.zs_ambassadors;
begin
  if caller is null then return jsonb_build_object('found', false); end if;
  select * into amb from public.zs_ambassadors where profile_id = caller;
  if amb.profile_id is null then return jsonb_build_object('found', false); end if;
  perform public.zs_close_expired_campaigns();

  return jsonb_build_object(
    'found', true,
    'currency', amb.payout_currency,
    'commission_rate', amb.commission_rate,
    'week_start', this_week,
    'next_payout_on', this_week + 7,
    -- Earned from campaigns still running or waiting for review.
    'in_review_total', coalesce((
      select sum(k.amount) from public.zs_commissions k join public.zs_amb_campaigns c on c.id = k.campaign_id
      where k.ambassador_id = caller and k.payout_id is null and coalesce(c.review_status, 'pending') = 'pending'), 0),
    -- Approved but not yet paid (bonuses included).
    'ready_total', coalesce((select sum(b.base_amount + b.bonus_amount) from public.zs_unpaid_breakdown(caller, null) b), 0),
    'paid_total', coalesce((select sum(total) from public.zs_payouts where profile_id = caller), 0),
    'this_week_sales', coalesce((select sum(gross) from public.zs_commissions where ambassador_id = caller and week_start = this_week), 0),
    'this_week_commission', coalesce((select sum(amount) from public.zs_commissions where ambassador_id = caller and week_start = this_week), 0),
    'referred_members', (select count(*) from public.zs_campaign_results
                         where ambassador_id = caller and kind = 'signup' and status = 'verified'),
    'paying_members', (select count(distinct buyer_id) from public.zs_commissions where ambassador_id = caller),
    'recent_commissions', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'source', c.source, 'description', c.description,
                                          'gross', c.gross, 'rate', c.rate, 'amount', c.amount,
                                          'paid', c.payout_id is not null, 'created_at', c.created_at) order by c.created_at desc)
      from (select * from public.zs_commissions where ambassador_id = caller order by created_at desc limit 20) c
    ), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'week_start', p.week_start, 'results', p.results,
        'base', p.base_amount, 'bonus', p.bonus_amount, 'total', p.total, 'paid_at', p.paid_at)
        order by p.paid_at desc)
      from (select * from public.zs_payouts where profile_id = caller order by paid_at desc limit 26) p
    ), '[]'::jsonb),
    'weekly_sales', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'sales', w.sales) order by w.week_start)
      from (
        select k.week_start, sum(k.gross) as sales from public.zs_commissions k
        where k.ambassador_id = caller and k.week_start > this_week - 56
        group by k.week_start
      ) w
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.zs_my_earnings() to authenticated;

-- ------------------------------------------------------- admin side -------
create or replace function public.zs_admin_campaign_reviews(p_filter text default 'pending')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  perform public.zs_close_expired_campaigns();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.ended_at asc nulls last, x.created_at desc)
    from (
      select c.id, c.title, c.summary, c.description, c.cover_url, c.partner_name, c.partner_url, c.goal,
             c.locations, c.starts_at, c.ends_at, c.ended_at, c.status, c.review_status, c.review_note,
             c.bonus_awarded, c.created_at, c.owner_id,
             coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'Ambassador') as owner_name,
             pr.username as owner_username, pr.avatar_url as owner_avatar, a.commission_rate, a.location as owner_location,
             (select count(*) from public.zs_campaign_results r where r.campaign_id = c.id and r.kind = 'signup' and r.status = 'verified') as new_members,
             (select count(*) from public.zs_campaign_results r where r.campaign_id = c.id and r.kind = 'activation') as active_members,
             (select count(distinct k.buyer_id) from public.zs_commissions k where k.campaign_id = c.id) as paying_members,
             coalesce((select sum(k.gross) from public.zs_commissions k where k.campaign_id = c.id), 0) as sales,
             coalesce((select sum(k.amount) from public.zs_commissions k where k.campaign_id = c.id and k.payout_id is null), 0) as commission_owed,
             coalesce((select jsonb_agg(jsonb_build_object('quantity', r.quantity, 'evidence', r.evidence, 'evidence_url', r.evidence_url, 'created_at', r.created_at) order by r.created_at)
                       from public.zs_campaign_results r where r.campaign_id = c.id and r.kind = 'proof'), '[]'::jsonb) as reports
      from public.zs_amb_campaigns c
      left join public.zs_ambassadors a on a.profile_id = c.owner_id
      left join public.profiles pr on pr.id = c.owner_id
      where c.owner_id is not null
        and case p_filter
              when 'pending' then c.review_status = 'pending'
              when 'live' then c.status in ('live', 'paused')
              when 'reviewed' then c.review_status in ('approved', 'rejected') or c.status = 'removed'
              else true
            end
    ) x
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.zs_admin_campaign_reviews(text) to authenticated;

create or replace function public.zs_admin_review_campaign(p_id uuid, p_approve boolean, p_bonus numeric default 0, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.zs_amb_campaigns;
  bonus numeric := greatest(0, coalesce(p_bonus, 0));
  paid numeric := 0;
begin
  if not public.is_zero_club_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  perform public.zs_close_expired_campaigns();
  select * into c from public.zs_amb_campaigns where id = p_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if c.review_status is distinct from 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_awaiting_review'); end if;

  update public.zs_amb_campaigns
  set review_status = case when p_approve then 'approved' else 'rejected' end,
      review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(),
      bonus_awarded = case when p_approve then bonus else 0 end, updated_at = now()
  where id = p_id;

  -- Pending offline reports are settled with the campaign.
  update public.zs_campaign_results
  set status = case when p_approve then 'verified' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now()
  where campaign_id = p_id and kind = 'proof' and status = 'pending';

  if p_approve then
    if bonus > 0 then
      insert into public.zs_bonuses (ambassador_id, amount, reason, created_by)
      values (c.owner_id, bonus, 'Campaign: ' || left(c.title, 180), auth.uid());
    end if;
    paid := public.zs_pay_ambassador(c.owner_id, auth.uid(), 'ZeroStart campaign payout: ' || left(c.title, 80));
  else
    begin
      insert into public.notifications (recipient_id, actor_id, type, content)
      values (c.owner_id, coalesce(auth.uid(), c.owner_id), 'system',
              'Your ZeroStart campaign "' || left(c.title, 80) || '" was not approved for payout.' || coalesce(' ' || p_note, ''));
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'approved', p_approve, 'paid', paid);
end;
$$;
grant execute on function public.zs_admin_review_campaign(uuid, boolean, numeric, text) to authenticated;

create or replace function public.zs_admin_set_campaign_status(p_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  if p_status not in ('live', 'paused', 'removed') then return jsonb_build_object('ok', false, 'reason', 'bad_status'); end if;
  update public.zs_amb_campaigns
  set status = p_status,
      review_status = case when p_status = 'removed' then 'rejected' else review_status end,
      review_note = coalesce(p_note, review_note), updated_at = now()
  where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.zs_admin_set_campaign_status(uuid, text, text) to authenticated;

-- Commission that became payable after a campaign was approved (members who
-- keep paying), plus bonuses: who is owed what right now.
create or replace function public.zs_admin_payout_preview(p_until date default null)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  currency text,
  results integer,
  base_amount numeric,
  bonus_amount numeric,
  total numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then return; end if;
  return query
    select a.profile_id,
           coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'An ambassador'),
           pr.avatar_url, a.payout_currency,
           0, sum(b.base_amount), sum(b.bonus_amount), sum(b.base_amount + b.bonus_amount)
    from public.zs_ambassadors a
    join public.profiles pr on pr.id = a.profile_id
    cross join lateral public.zs_unpaid_breakdown(a.profile_id, null) b
    group by a.profile_id, pr.full_name, pr.username, pr.avatar_url, a.payout_currency
    having sum(b.base_amount + b.bonus_amount) > 0
    order by sum(b.base_amount + b.bonus_amount) desc;
end;
$$;

create or replace function public.zs_admin_run_payouts(p_until date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  paid numeric;
  paid_count integer := 0;
  paid_sum numeric := 0;
begin
  if not public.is_zero_club_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  for rec in select profile_id from public.zs_admin_payout_preview(null) loop
    paid := public.zs_pay_ambassador(rec.profile_id, auth.uid(), 'ZeroStart ambassador payout');
    if paid > 0 then
      paid_count := paid_count + 1;
      paid_sum := paid_sum + paid;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'ambassadors_paid', paid_count, 'total', paid_sum);
end;
$$;

notify pgrst, 'reload schema';
