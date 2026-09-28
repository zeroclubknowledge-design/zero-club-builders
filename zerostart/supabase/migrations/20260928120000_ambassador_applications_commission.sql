-- ###########################################################################
-- ALREADY APPLIED TO PRODUCTION (2026-09-28). DO NOT RUN THIS AGAIN.
-- It is kept as a record of the database changes. Re-running an older file
-- after a newer one fails (or would roll functions back to an old version).
-- On a brand-new database, run the files in this folder in date order.
-- ###########################################################################

-- ===========================================================================
-- Ambassadors are approved, not self-appointed; they earn commission.
--
-- 1. Applications: anyone can apply; only a Zero Club admin can approve or
--    reject. Approval creates the ambassador and gives their Zero Club account
--    the "Zero Club Ambassador" affiliation badge (profiles.affiliation).
-- 2. Pay is commission: a percentage of every real-money payment (bootcamps,
--    memberships, store, club fees) made by members who joined through the
--    ambassador's campaign link. Each ambassador locks in the rate that is the
--    default when they are approved (20% for the first cohort); admins can
--    lower the default for later cohorts and adjust anyone individually.
-- 3. Bonuses are set by admins: weekly volume tiers on a campaign, plus one-off
--    bonuses for a specific ambassador.
-- Fixed per-signup/per-result rewards are no longer paid.
-- Applied to production on 2026-09-28.
-- ===========================================================================

-- ------------------------------------------------------------ settings ----
create table if not exists public.zs_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.zs_settings enable row level security;
drop policy if exists zs_settings_read on public.zs_settings;
create policy zs_settings_read on public.zs_settings for select to anon, authenticated using (true);

insert into public.zs_settings (key, value) values
  ('commission_rate', '20'::jsonb),
  ('commission_sources', '["bootcamp","membership","store","club"]'::jsonb)
on conflict (key) do nothing;

create or replace function public.zs_setting_rate()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::numeric from public.zs_settings where key = 'commission_rate'), 20);
$$;

alter table public.zs_ambassadors
  add column if not exists commission_rate numeric not null default 20;
alter table public.zs_ambassadors drop constraint if exists zs_ambassadors_commission_rate_check;
alter table public.zs_ambassadors
  add constraint zs_ambassadors_commission_rate_check check (commission_rate between 0 and 100);

-- Nobody makes themselves an ambassador any more, and a removed ambassador
-- cannot reactivate themselves.
drop policy if exists zs_ambassadors_self_write on public.zs_ambassadors;
drop policy if exists zs_ambassadors_self_update on public.zs_ambassadors;
create policy zs_ambassadors_self_update on public.zs_ambassadors
  for update to authenticated
  using (profile_id = auth.uid() and status <> 'removed')
  with check (profile_id = auth.uid() and status in ('active', 'paused'));

-- Nor can they change their own rate.
create or replace function public.zs_guard_ambassador_rate()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.commission_rate := old.commission_rate;
  end if;
  return new;
end;
$$;
drop trigger if exists zs_guard_ambassador_rate on public.zs_ambassadors;
create trigger zs_guard_ambassador_rate
  before update on public.zs_ambassadors
  for each row execute function public.zs_guard_ambassador_rate();

-- --------------------------------------------------- affiliation badge ----
alter table public.profiles add column if not exists affiliation text;
alter table public.profiles drop constraint if exists profiles_affiliation_check;
alter table public.profiles
  add constraint profiles_affiliation_check check (affiliation is null or affiliation in ('zero_ambassador'));

-- Only trusted server code (security definer functions) can set it.
create or replace function public.guard_profile_affiliation()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.affiliation := null;
    else
      new.affiliation := old.affiliation;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profile_affiliation on public.profiles;
create trigger guard_profile_affiliation
  before insert or update on public.profiles
  for each row execute function public.guard_profile_affiliation();

-- -------------------------------------------------------- applications ----
create table if not exists public.zs_ambassador_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  location text not null check (length(btrim(location)) between 2 and 120),
  country text,
  bio text,
  motivation text not null check (length(btrim(motivation)) between 20 and 2000),
  links text,
  focus text[] not null default '{}',
  bootcamps uuid[] not null default '{}',
  payout_currency text not null default 'NGN' check (payout_currency in ('NGN', 'GHS', 'USD')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists zs_applications_one_pending
  on public.zs_ambassador_applications (profile_id) where status = 'pending';
create index if not exists zs_applications_queue_idx
  on public.zs_ambassador_applications (status, created_at);

alter table public.zs_ambassador_applications enable row level security;
drop policy if exists zs_applications_read on public.zs_ambassador_applications;
create policy zs_applications_read on public.zs_ambassador_applications for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());

create or replace function public.zs_apply_ambassador(
  p_location text,
  p_country text,
  p_bio text,
  p_motivation text,
  p_links text,
  p_focus text[],
  p_bootcamps uuid[],
  p_currency text default 'NGN'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if exists (select 1 from public.zs_ambassadors where profile_id = caller and status <> 'removed') then
    return jsonb_build_object('ok', false, 'reason', 'already_ambassador');
  end if;
  if length(btrim(coalesce(p_location, ''))) < 2 then return jsonb_build_object('ok', false, 'reason', 'location_required'); end if;
  if coalesce(array_length(p_focus, 1), 0) = 0 then return jsonb_build_object('ok', false, 'reason', 'focus_required'); end if;
  if length(btrim(coalesce(p_motivation, ''))) < 20 then return jsonb_build_object('ok', false, 'reason', 'motivation_required'); end if;

  update public.zs_ambassador_applications set
    location = btrim(p_location), country = nullif(btrim(coalesce(p_country, '')), ''),
    bio = nullif(btrim(coalesce(p_bio, '')), ''), motivation = btrim(p_motivation),
    links = nullif(btrim(coalesce(p_links, '')), ''), focus = coalesce(p_focus, '{}'),
    bootcamps = coalesce(p_bootcamps, '{}'),
    payout_currency = case when p_currency in ('NGN', 'GHS', 'USD') then p_currency else 'NGN' end,
    updated_at = now()
  where profile_id = caller and status = 'pending';

  if not found then
    insert into public.zs_ambassador_applications
      (profile_id, location, country, bio, motivation, links, focus, bootcamps, payout_currency)
    values (caller, btrim(p_location), nullif(btrim(coalesce(p_country, '')), ''), nullif(btrim(coalesce(p_bio, '')), ''),
            btrim(p_motivation), nullif(btrim(coalesce(p_links, '')), ''), coalesce(p_focus, '{}'), coalesce(p_bootcamps, '{}'),
            case when p_currency in ('NGN', 'GHS', 'USD') then p_currency else 'NGN' end);
  end if;

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;
grant execute on function public.zs_apply_ambassador(text, text, text, text, text, text[], uuid[], text) to authenticated;

create or replace function public.zs_my_application()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select to_jsonb(a) - 'reviewed_by'
    from public.zs_ambassador_applications a
    where a.profile_id = auth.uid()
    order by a.created_at desc
    limit 1
  ), jsonb_build_object('status', 'none'));
$$;
grant execute on function public.zs_my_application() to authenticated;

-- Profile edits are for approved ambassadors only now.
create or replace function public.zs_save_ambassador(
  p_location text,
  p_country text default null,
  p_bio text default null,
  p_focus text[] default '{}',
  p_bootcamps uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if not exists (select 1 from public.zs_ambassadors where profile_id = caller and status <> 'removed') then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;
  if length(btrim(coalesce(p_location, ''))) < 2 then return jsonb_build_object('ok', false, 'reason', 'location_required'); end if;
  if coalesce(array_length(p_focus, 1), 0) = 0 then return jsonb_build_object('ok', false, 'reason', 'focus_required'); end if;

  update public.zs_ambassadors
  set location = btrim(p_location), country = nullif(btrim(coalesce(p_country, '')), ''),
      bio = nullif(btrim(coalesce(p_bio, '')), ''), updated_at = now()
  where profile_id = caller;

  delete from public.zs_ambassador_focus where profile_id = caller;
  insert into public.zs_ambassador_focus (profile_id, focus_slug)
  select caller, slug from public.zs_focus_areas where slug = any(p_focus) and active
  on conflict do nothing;

  delete from public.zs_ambassador_bootcamps where profile_id = caller;
  if coalesce(array_length(p_bootcamps, 1), 0) > 0 then
    insert into public.zs_ambassador_bootcamps (profile_id, bootcamp_id)
    select caller, unnest(p_bootcamps) on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- -------------------------------------------------------- commissions -----
create table if not exists public.zs_bonuses (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.zs_ambassadors(profile_id) on delete cascade,
  amount numeric not null check (amount > 0),
  reason text not null check (length(btrim(reason)) between 3 and 200),
  week_start date not null default public.zs_week_start(now()),
  payout_id uuid references public.zs_payouts(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.zs_bonuses enable row level security;
drop policy if exists zs_bonuses_read on public.zs_bonuses;
create policy zs_bonuses_read on public.zs_bonuses for select to authenticated
  using (ambassador_id = auth.uid() or public.is_zero_club_admin());

create table if not exists public.zs_commissions (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.zs_ambassadors(profile_id) on delete cascade,
  campaign_id uuid references public.zs_amb_campaigns(id) on delete set null,
  buyer_id uuid references public.profiles(id) on delete set null,
  wallet_transaction_id uuid not null unique,
  source text not null,
  description text,
  gross numeric not null,
  rate numeric not null,
  amount numeric not null,
  week_start date not null default public.zs_week_start(now()),
  payout_id uuid references public.zs_payouts(id),
  created_at timestamptz not null default now()
);
create index if not exists zs_commissions_unpaid_idx
  on public.zs_commissions (ambassador_id, week_start) where payout_id is null;
alter table public.zs_commissions enable row level security;
drop policy if exists zs_commissions_read on public.zs_commissions;
create policy zs_commissions_read on public.zs_commissions for select to authenticated
  using (ambassador_id = auth.uid() or public.is_zero_club_admin());

/*
 * Every real-money purchase is a wallet debit. When the payer joined Zero Club
 * through an active ambassador's campaign link, the ambassador earns their
 * locked-in rate on it. Never allowed to break a payment.
 */
create or replace function public.zs_record_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  attribution record;
  rate numeric;
  sources jsonb;
begin
  if new.direction <> 'debit' or coalesce(new.amount, 0) <= 0 then return new; end if;

  begin
    select value into sources from public.zs_settings where key = 'commission_sources';
    if sources is null or not (sources ? new.source) then return new; end if;

    select r.ambassador_id, r.campaign_id into attribution
    from public.zs_campaign_results r
    where r.kind = 'signup' and r.status = 'verified' and r.referred_profile_id = new.profile_id
    limit 1;
    if attribution.ambassador_id is null or attribution.ambassador_id = new.profile_id then return new; end if;

    select a.commission_rate into rate
    from public.zs_ambassadors a
    where a.profile_id = attribution.ambassador_id and a.status = 'active';
    if rate is null or rate <= 0 then return new; end if;

    insert into public.zs_commissions
      (ambassador_id, campaign_id, buyer_id, wallet_transaction_id, source, description, gross, rate, amount)
    values
      (attribution.ambassador_id, attribution.campaign_id, new.profile_id, new.id, new.source, new.description,
       new.amount, rate, round(new.amount * rate / 100.0, 2))
    on conflict (wallet_transaction_id) do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists zs_record_commission on public.wallet_transactions;
create trigger zs_record_commission
  after insert on public.wallet_transactions
  for each row execute function public.zs_record_commission();

-- ------------------------------------------------ what is owed, redone ----
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
  with r as (
    select x.campaign_id, x.week_start, sum(x.quantity)::integer as cnt
    from public.zs_campaign_results x
    where x.ambassador_id = p_profile and x.status = 'verified' and x.payout_id is null
      and (p_until is null or x.week_start <= p_until)
    group by x.campaign_id, x.week_start
  ),
  k as (
    select x.campaign_id, x.week_start, sum(x.gross) as sales, sum(x.amount) as comm
    from public.zs_commissions x
    where x.ambassador_id = p_profile and x.payout_id is null
      and (p_until is null or x.week_start <= p_until)
    group by x.campaign_id, x.week_start
  ),
  keys as (
    select campaign_id, week_start from r
    union
    select campaign_id, week_start from k
  )
  select keys.campaign_id,
         coalesce(c.title, 'Referred members'),
         keys.week_start,
         coalesce(r.cnt, 0),
         coalesce(k.sales, 0),
         coalesce(k.comm, 0),
         case when c.id is null then 0 else public.zs_bonus_for(c.bonus_tiers, coalesce(r.cnt, 0)) end,
         coalesce(c.bonus_tiers, '[]'::jsonb)
  from keys
  left join r on r.campaign_id is not distinct from keys.campaign_id and r.week_start = keys.week_start
  left join k on k.campaign_id is not distinct from keys.campaign_id and k.week_start = keys.week_start
  left join public.zs_amb_campaigns c on c.id = keys.campaign_id
  union all
  select null::uuid, 'Bonus: ' || b.reason, b.week_start, 0, 0::numeric, 0::numeric, b.amount, '[]'::jsonb
  from public.zs_bonuses b
  where b.ambassador_id = p_profile and b.payout_id is null and (p_until is null or b.week_start <= p_until);
$$;
revoke all on function public.zs_unpaid_breakdown(uuid, date) from public, anon, authenticated;

create or replace function public.zs_my_earnings()
returns jsonb
language plpgsql
stable
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

  return jsonb_build_object(
    'found', true,
    'currency', amb.payout_currency,
    'commission_rate', amb.commission_rate,
    'week_start', this_week,
    'next_payout_on', this_week + 7,
    'this_week', coalesce((
      select jsonb_agg(jsonb_build_object(
        'campaign_id', b.campaign_id, 'title', b.title, 'results', b.results, 'sales', b.sales,
        'base', b.base_amount, 'bonus', b.bonus_amount, 'tiers', b.bonus_tiers))
      from public.zs_unpaid_breakdown(caller, null) b where b.week_start = this_week
    ), '[]'::jsonb),
    'this_week_total', coalesce((
      select sum(b.base_amount + b.bonus_amount) from public.zs_unpaid_breakdown(caller, null) b
      where b.week_start = this_week), 0),
    'this_week_sales', coalesce((
      select sum(b.sales) from public.zs_unpaid_breakdown(caller, null) b where b.week_start = this_week), 0),
    'unpaid_total', coalesce((
      select sum(b.base_amount + b.bonus_amount) from public.zs_unpaid_breakdown(caller, null) b), 0),
    'paid_total', coalesce((select sum(total) from public.zs_payouts where profile_id = caller), 0),
    'referred_members', (select count(*) from public.zs_campaign_results
                         where ambassador_id = caller and kind = 'signup' and status = 'verified'),
    'paying_members', (select count(distinct buyer_id) from public.zs_commissions where ambassador_id = caller),
    'pending_proofs', (select count(*) from public.zs_campaign_results
                       where ambassador_id = caller and status = 'pending'),
    'recent_commissions', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'source', c.source, 'description', c.description,
                                          'gross', c.gross, 'rate', c.rate, 'amount', c.amount,
                                          'created_at', c.created_at) order by c.created_at desc)
      from (select * from public.zs_commissions where ambassador_id = caller order by created_at desc limit 20) c
    ), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'week_start', p.week_start, 'results', p.results,
        'base', p.base_amount, 'bonus', p.bonus_amount, 'total', p.total, 'paid_at', p.paid_at)
        order by p.week_start desc)
      from (select * from public.zs_payouts where profile_id = caller order by week_start desc limit 26) p
    ), '[]'::jsonb),
    'weekly_results', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'results', w.results) order by w.week_start)
      from (
        select r.week_start, sum(r.quantity)::integer as results
        from public.zs_campaign_results r
        where r.ambassador_id = caller and r.status = 'verified' and r.week_start > this_week - 56
        group by r.week_start
      ) w
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.zs_my_earnings() to authenticated;

create or replace function public.zs_admin_run_payouts(p_until date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := auth.uid();
  until_week date := coalesce(p_until, public.zs_week_start() - 7);
  rec record;
  v_payout uuid;
  ref text;
  paid_count integer := 0;
  paid_sum numeric := 0;
begin
  if not public.is_zero_club_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  if until_week >= public.zs_week_start() then
    return jsonb_build_object('ok', false, 'reason', 'week_not_finished');
  end if;

  for rec in select * from public.zs_admin_payout_preview(until_week) loop
    ref := 'zs-payout-' || rec.profile_id || '-' || until_week;

    insert into public.zs_payouts (profile_id, week_start, results, base_amount, bonus_amount, total, currency, reference, paid_by)
    values (rec.profile_id, until_week, rec.results, rec.base_amount, rec.bonus_amount, rec.total, rec.currency, ref, admin_id)
    on conflict (profile_id, week_start) do nothing
    returning id into v_payout;

    if v_payout is null then continue; end if;

    update public.zs_campaign_results set payout_id = v_payout
    where ambassador_id = rec.profile_id and status = 'verified' and payout_id is null and week_start <= until_week;
    update public.zs_commissions set payout_id = v_payout
    where ambassador_id = rec.profile_id and payout_id is null and week_start <= until_week;
    update public.zs_bonuses set payout_id = v_payout
    where ambassador_id = rec.profile_id and payout_id is null and week_start <= until_week;

    perform public.wallet_apply(
      rec.profile_id, 'credit', rec.total, 'zerostart_payout',
      'ZeroStart weekly payout', ref,
      jsonb_build_object('week_until', until_week, 'results', rec.results,
                         'commission', rec.base_amount, 'bonus', rec.bonus_amount, 'payout_id', v_payout)
    );

    begin
      insert into public.notifications (recipient_id, actor_id, type, content)
      values (rec.profile_id, rec.profile_id, 'system',
              'Your ZeroStart ambassador payout has landed in your Zero Club wallet.');
    exception when others then null;
    end;

    paid_count := paid_count + 1;
    paid_sum := paid_sum + rec.total;
    v_payout := null;
  end loop;

  return jsonb_build_object('ok', true, 'ambassadors_paid', paid_count, 'total', paid_sum, 'until', until_week);
end;
$$;

-- --------------------------------------------------------- admin side -----
create or replace function public.zs_admin_applications(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at asc)
    from (
      select a.*, pr.username, pr.avatar_url,
             coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'Member') as display_name,
             pr.created_at as member_since,
             (select count(*) from public.posts p where p.author_id = a.profile_id) as posts,
             (select coalesce(array_agg(f.label order by f.sort_order), '{}') from public.zs_focus_areas f where f.slug = any(a.focus)) as focus_labels
      from public.zs_ambassador_applications a
      join public.profiles pr on pr.id = a.profile_id
      where p_status = 'all' or a.status = p_status
    ) x
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.zs_admin_applications(text) to authenticated;

create or replace function public.zs_admin_review_application(
  p_id uuid,
  p_approve boolean,
  p_note text default null,
  p_rate numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.zs_ambassador_applications;
  rate numeric;
begin
  if not public.is_zero_club_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  select * into app from public.zs_ambassador_applications where id = p_id for update;
  if app.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if app.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'already_reviewed'); end if;

  update public.zs_ambassador_applications
  set status = case when p_approve then 'approved' else 'rejected' end,
      review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_id;

  if p_approve then
    rate := coalesce(p_rate, public.zs_setting_rate());
    insert into public.zs_ambassadors (profile_id, location, country, bio, status, payout_currency, commission_rate)
    values (app.profile_id, app.location, app.country, app.bio, 'active', app.payout_currency, rate)
    on conflict (profile_id) do update
      set location = excluded.location, country = excluded.country, bio = excluded.bio,
          status = 'active', payout_currency = excluded.payout_currency,
          commission_rate = excluded.commission_rate, updated_at = now();

    delete from public.zs_ambassador_focus where profile_id = app.profile_id;
    insert into public.zs_ambassador_focus (profile_id, focus_slug)
    select app.profile_id, slug from public.zs_focus_areas where slug = any(app.focus)
    on conflict do nothing;

    delete from public.zs_ambassador_bootcamps where profile_id = app.profile_id;
    insert into public.zs_ambassador_bootcamps (profile_id, bootcamp_id)
    select app.profile_id, unnest(app.bootcamps) on conflict do nothing;

    update public.profiles set affiliation = 'zero_ambassador' where id = app.profile_id;
  end if;

  begin
    insert into public.notifications (recipient_id, actor_id, type, content)
    values (app.profile_id, coalesce(auth.uid(), app.profile_id), 'system',
            case when p_approve
              then 'Welcome, Zero Club Ambassador! Your application was approved — your badge is now on your profile.'
              else 'Your Zero Ambassador application was not approved this time.' || coalesce(' ' || p_note, '')
            end);
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'approved', p_approve, 'rate', rate);
end;
$$;
grant execute on function public.zs_admin_review_application(uuid, boolean, text, numeric) to authenticated;

create or replace function public.zs_admin_ambassadors()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.joined_at asc)
    from (
      select a.profile_id, a.location, a.status, a.commission_rate, a.payout_currency, a.joined_at,
             pr.username, pr.avatar_url,
             coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'Member') as display_name,
             (select count(*) from public.zs_campaign_results r where r.ambassador_id = a.profile_id and r.kind = 'signup' and r.status = 'verified') as referred,
             coalesce((select sum(gross) from public.zs_commissions c where c.ambassador_id = a.profile_id), 0) as sales,
             coalesce((select sum(total) from public.zs_payouts p where p.profile_id = a.profile_id), 0) as paid
      from public.zs_ambassadors a
      join public.profiles pr on pr.id = a.profile_id
    ) x
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.zs_admin_ambassadors() to authenticated;

create or replace function public.zs_admin_update_ambassador(p_profile uuid, p_status text default null, p_rate numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  if p_status is not null and p_status not in ('active', 'paused', 'removed') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 100) then
    return jsonb_build_object('ok', false, 'reason', 'bad_rate');
  end if;

  update public.zs_ambassadors
  set status = coalesce(p_status, status), commission_rate = coalesce(p_rate, commission_rate), updated_at = now()
  where profile_id = p_profile;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  -- The badge follows the role: removed ambassadors lose it.
  update public.profiles
  set affiliation = case when (select status from public.zs_ambassadors where profile_id = p_profile) = 'removed'
                         then null else 'zero_ambassador' end
  where id = p_profile;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.zs_admin_update_ambassador(uuid, text, numeric) to authenticated;

create or replace function public.zs_admin_set_default_rate(p_rate numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  if p_rate is null or p_rate < 0 or p_rate > 100 then return jsonb_build_object('ok', false, 'reason', 'bad_rate'); end if;
  insert into public.zs_settings (key, value, updated_at) values ('commission_rate', to_jsonb(p_rate), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('ok', true, 'rate', p_rate);
end;
$$;
grant execute on function public.zs_admin_set_default_rate(numeric) to authenticated;

create or replace function public.zs_admin_add_bonus(p_profile uuid, p_amount numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  if coalesce(p_amount, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'bad_amount'); end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then return jsonb_build_object('ok', false, 'reason', 'reason_required'); end if;
  if not exists (select 1 from public.zs_ambassadors where profile_id = p_profile) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into public.zs_bonuses (ambassador_id, amount, reason, created_by)
  values (p_profile, p_amount, btrim(p_reason), auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.zs_admin_add_bonus(uuid, numeric, text) to authenticated;

-- The ambassador's own view gains their rate and application state.
create or replace function public.zs_ambassador_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  amb public.zs_ambassadors;
  approved integer;
begin
  if caller is null then return jsonb_build_object('found', false); end if;

  select * into amb from public.zs_ambassadors where profile_id = caller and status <> 'removed';
  if amb.profile_id is null then
    return jsonb_build_object('found', false, 'application', public.zs_my_application(),
                              'default_rate', public.zs_setting_rate());
  end if;

  select count(*) into approved from public.zs_ambassador_task_log where profile_id = caller and status = 'approved';

  return jsonb_build_object(
    'found', true,
    'location', amb.location,
    'country', amb.country,
    'bio', amb.bio,
    'status', amb.status,
    'joined_at', amb.joined_at,
    'commission_rate', amb.commission_rate,
    'payout_currency', amb.payout_currency,
    'focus', coalesce((select jsonb_agg(focus_slug order by focus_slug) from public.zs_ambassador_focus where profile_id = caller), '[]'::jsonb),
    'bootcamps', coalesce((select jsonb_agg(bootcamp_id) from public.zs_ambassador_bootcamps where profile_id = caller), '[]'::jsonb),
    'tasks_approved', approved,
    'tasks_submitted', (select count(*) from public.zs_ambassador_task_log where profile_id = caller and status = 'submitted'),
    'zp_earned', coalesce((select sum(zp_awarded) from public.zs_ambassador_task_log where profile_id = caller and status = 'approved'), 0),
    'level', public.zs_ambassador_level(approved)
  );
end;
$$;

notify pgrst, 'reload schema';
