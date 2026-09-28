-- ###########################################################################
-- ALREADY APPLIED TO PRODUCTION (2026-09-28). DO NOT RUN THIS AGAIN.
-- It is kept as a record of the database changes. Re-running an older file
-- after a newer one fails (or would roll functions back to an old version).
-- On a brand-new database, run the files in this folder in date order.
-- ###########################################################################

-- Applied to production on 2026-09-28.
-- ===========================================================================
-- ZeroStart campaigns, attribution and weekly payouts.
--
-- Ambassadors join campaigns (for Zero Club or a partner), share a personal
-- link/code, and are paid weekly into their Zero Club wallet for verified
-- results, plus volume bonuses per campaign per week.
--
-- Money is stored in the wallet's base unit (NGN), exactly like the rest of the
-- wallet. Ambassadors see it in their payout currency (NGN / GHS / USD) using
-- the same fixed rates the Zero Club wallet uses.
--
-- Results come from two places:
--   * automatic: a new member signs up through an ambassador's link
--     (zs_attribute_signup) and later makes a first post (activation trigger);
--   * proof: the ambassador submits evidence of offline results and an admin
--     verifies the count.
-- ===========================================================================

alter table public.zs_ambassadors
  add column if not exists payout_currency text not null default 'NGN';
alter table public.zs_ambassadors drop constraint if exists zs_ambassadors_payout_currency_check;
alter table public.zs_ambassadors
  add constraint zs_ambassadors_payout_currency_check check (payout_currency in ('NGN', 'GHS', 'USD'));

-- Monday-based weeks in Lagos time: the pay period.
create or replace function public.zs_week_start(p_at timestamptz default now())
returns date
language sql
stable
as $$
  select date_trunc('week', (p_at at time zone 'Africa/Lagos'))::date;
$$;

-- ------------------------------------------------------------ campaigns ----
create table if not exists public.zs_amb_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 4 and 120),
  summary text check (summary is null or length(summary) <= 280),
  description text check (description is null or length(description) <= 4000),
  cover_url text,
  partner_name text,
  partner_url text,
  goal text not null default 'signups'
    check (goal in ('signups', 'activations', 'event', 'sales', 'awareness', 'other')),
  tracking text not null default 'both' check (tracking in ('link', 'proof', 'both')),
  reward_signup numeric not null default 0 check (reward_signup >= 0),
  reward_activation numeric not null default 0 check (reward_activation >= 0),
  reward_proof numeric not null default 0 check (reward_proof >= 0),
  proof_unit_label text not null default 'result',
  bonus_tiers jsonb not null default '[]'::jsonb,
  locations text,
  max_ambassadors integer check (max_ambassadors is null or max_ambassadors > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'live', 'paused', 'ended')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.zs_amb_campaigns enable row level security;
drop policy if exists zs_amb_campaigns_read on public.zs_amb_campaigns;
create policy zs_amb_campaigns_read on public.zs_amb_campaigns for select to anon, authenticated
  using (status <> 'draft' or public.is_zero_club_admin());

create table if not exists public.zs_campaign_members (
  campaign_id uuid not null references public.zs_amb_campaigns(id) on delete cascade,
  profile_id uuid not null references public.zs_ambassadors(profile_id) on delete cascade,
  code text not null unique,
  joined_at timestamptz not null default now(),
  primary key (campaign_id, profile_id)
);

alter table public.zs_campaign_members enable row level security;
drop policy if exists zs_campaign_members_read on public.zs_campaign_members;
create policy zs_campaign_members_read on public.zs_campaign_members for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());

create table if not exists public.zs_payouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  results integer not null default 0,
  base_amount numeric not null default 0,
  bonus_amount numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'NGN',
  status text not null default 'paid' check (status in ('paid')),
  reference text not null unique,
  paid_by uuid references public.profiles(id),
  paid_at timestamptz not null default now(),
  unique (profile_id, week_start)
);

alter table public.zs_payouts enable row level security;
drop policy if exists zs_payouts_read on public.zs_payouts;
create policy zs_payouts_read on public.zs_payouts for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());

create table if not exists public.zs_campaign_results (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.zs_amb_campaigns(id) on delete cascade,
  ambassador_id uuid not null references public.zs_ambassadors(profile_id) on delete cascade,
  kind text not null check (kind in ('signup', 'activation', 'proof')),
  referred_profile_id uuid references public.profiles(id) on delete set null,
  quantity integer not null default 1 check (quantity between 1 and 100000),
  evidence text,
  evidence_url text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  week_start date not null default public.zs_week_start(now()),
  payout_id uuid references public.zs_payouts(id),
  created_at timestamptz not null default now()
);

-- One signup attribution and one activation per referred person, ever.
create unique index if not exists zs_results_one_per_person
  on public.zs_campaign_results (kind, referred_profile_id)
  where referred_profile_id is not null;
create index if not exists zs_results_unpaid_idx
  on public.zs_campaign_results (ambassador_id, status, week_start) where payout_id is null;
create index if not exists zs_results_queue_idx
  on public.zs_campaign_results (status, created_at) where kind = 'proof';

alter table public.zs_campaign_results enable row level security;
drop policy if exists zs_campaign_results_read on public.zs_campaign_results;
create policy zs_campaign_results_read on public.zs_campaign_results for select to authenticated
  using (ambassador_id = auth.uid() or public.is_zero_club_admin());

-- ------------------------------------------------------------- helpers -----
create or replace function public.zs_result_value(p_kind text, p_quantity integer, c public.zs_amb_campaigns)
returns numeric
language sql
immutable
as $$
  select case p_kind
    when 'signup' then c.reward_signup
    when 'activation' then c.reward_activation
    else c.reward_proof * p_quantity
  end;
$$;

-- The best bonus a weekly count reaches. Tiers: [{"min": 25, "bonus": 5000}, ...]
create or replace function public.zs_bonus_for(p_tiers jsonb, p_count integer)
returns numeric
language sql
immutable
as $$
  select coalesce(max((t->>'bonus')::numeric), 0)
  from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) t
  where (t->>'min')::integer <= p_count;
$$;

/*
 * Unpaid, verified work for one ambassador, grouped the way it is paid:
 * per campaign per week, so each week's bonus is judged on that week's volume.
 */
create or replace function public.zs_unpaid_breakdown(p_profile uuid, p_until date default null)
returns table (
  campaign_id uuid,
  title text,
  week_start date,
  results integer,
  base_amount numeric,
  bonus_amount numeric,
  bonus_tiers jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, r.week_start,
         sum(r.quantity)::integer,
         sum(public.zs_result_value(r.kind, r.quantity, c)),
         public.zs_bonus_for(c.bonus_tiers, sum(r.quantity)::integer),
         c.bonus_tiers
  from public.zs_campaign_results r
  join public.zs_amb_campaigns c on c.id = r.campaign_id
  where r.ambassador_id = p_profile
    and r.status = 'verified'
    and r.payout_id is null
    and (p_until is null or r.week_start <= p_until)
  group by c.id, c.title, r.week_start, c.bonus_tiers
  order by r.week_start, c.title;
$$;

revoke all on function public.zs_unpaid_breakdown(uuid, date) from public, anon, authenticated;

create or replace function public.zs_new_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..7 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.zs_campaign_members where code = candidate);
  end loop;
  return candidate;
end;
$$;

-- ------------------------------------------------------ ambassador side ----
create or replace function public.zs_set_payout_currency(p_currency text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_currency not in ('NGN', 'GHS', 'USD') then
    return jsonb_build_object('ok', false, 'reason', 'bad_currency');
  end if;
  update public.zs_ambassadors set payout_currency = p_currency, updated_at = now()
  where profile_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_an_ambassador'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.zs_set_payout_currency(text) to authenticated;

create or replace function public.zs_campaigns_feed()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.sort_key, x.starts_at desc), '[]'::jsonb)
  from (
    select c.id, c.title, c.summary, c.description, c.cover_url, c.partner_name, c.partner_url,
           c.goal, c.tracking, c.reward_signup, c.reward_activation, c.reward_proof,
           c.proof_unit_label, c.bonus_tiers, c.locations, c.max_ambassadors,
           c.starts_at, c.ends_at, c.status,
           case c.status when 'live' then 0 when 'paused' then 1 else 2 end as sort_key,
           (select count(*) from public.zs_campaign_members m2 where m2.campaign_id = c.id) as ambassadors,
           m.code as my_code,
           (m.profile_id is not null) as joined,
           coalesce((select sum(r.quantity) from public.zs_campaign_results r
                     where r.campaign_id = c.id and r.ambassador_id = auth.uid()
                       and r.status = 'verified' and r.week_start = public.zs_week_start()), 0) as my_week_results,
           coalesce((select sum(r.quantity) from public.zs_campaign_results r
                     where r.campaign_id = c.id and r.ambassador_id = auth.uid()
                       and r.status = 'verified'), 0) as my_total_results,
           coalesce((select sum(r.quantity) from public.zs_campaign_results r
                     where r.campaign_id = c.id and r.ambassador_id = auth.uid()
                       and r.status = 'pending'), 0) as my_pending_results
    from public.zs_amb_campaigns c
    left join public.zs_campaign_members m on m.campaign_id = c.id and m.profile_id = auth.uid()
    where c.status <> 'draft'
  ) x;
$$;
grant execute on function public.zs_campaigns_feed() to authenticated;

create or replace function public.zs_join_amb_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  c public.zs_amb_campaigns;
  existing text;
  new_code text;
begin
  if caller is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if not exists (select 1 from public.zs_ambassadors where profile_id = caller and status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'not_an_ambassador');
  end if;

  select * into c from public.zs_amb_campaigns where id = p_campaign_id;
  if c.id is null or c.status <> 'live' then
    return jsonb_build_object('ok', false, 'reason', 'not_live');
  end if;
  if c.ends_at is not null and c.ends_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'ended');
  end if;

  select code into existing from public.zs_campaign_members where campaign_id = c.id and profile_id = caller;
  if existing is not null then return jsonb_build_object('ok', true, 'code', existing); end if;

  if c.max_ambassadors is not null
     and (select count(*) from public.zs_campaign_members where campaign_id = c.id) >= c.max_ambassadors then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  new_code := public.zs_new_code();
  insert into public.zs_campaign_members (campaign_id, profile_id, code) values (c.id, caller, new_code);
  return jsonb_build_object('ok', true, 'code', new_code);
end;
$$;
grant execute on function public.zs_join_amb_campaign(uuid) to authenticated;

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
  if c.id is null or c.status not in ('live', 'paused') then
    return jsonb_build_object('ok', false, 'reason', 'not_live');
  end if;
  if c.tracking = 'link' then return jsonb_build_object('ok', false, 'reason', 'link_only'); end if;
  if not exists (select 1 from public.zs_campaign_members where campaign_id = c.id and profile_id = caller) then
    return jsonb_build_object('ok', false, 'reason', 'not_joined');
  end if;
  if coalesce(p_quantity, 0) < 1 or p_quantity > 100000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_quantity');
  end if;
  if length(btrim(coalesce(p_evidence, ''))) < 15 then
    return jsonb_build_object('ok', false, 'reason', 'evidence_required');
  end if;

  insert into public.zs_campaign_results (campaign_id, ambassador_id, kind, quantity, evidence, evidence_url, status)
  values (c.id, caller, 'proof', p_quantity, btrim(p_evidence), nullif(btrim(coalesce(p_evidence_url, '')), ''), 'pending');

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.zs_submit_campaign_proof(uuid, integer, text, text) to authenticated;

/*
 * Called by Zero Club right after a new member's first sign-in, with the code
 * from the link they arrived on. Only a brand-new account can be attributed,
 * only once, and never to themselves.
 */
create or replace function public.zs_attribute_signup(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  member public.zs_campaign_members;
  c public.zs_amb_campaigns;
  joined timestamptz;
begin
  if caller is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;

  select * into member from public.zs_campaign_members where code = upper(btrim(coalesce(p_code, '')));
  if member.code is null then return jsonb_build_object('ok', false, 'reason', 'unknown_code'); end if;
  if member.profile_id = caller then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  select * into c from public.zs_amb_campaigns where id = member.campaign_id;
  if c.status <> 'live' or c.tracking = 'proof' then
    return jsonb_build_object('ok', false, 'reason', 'not_live');
  end if;

  select created_at into joined from public.profiles where id = caller;
  if joined is null or joined < now() - interval '3 days' then
    return jsonb_build_object('ok', false, 'reason', 'not_new');
  end if;

  insert into public.zs_campaign_results (campaign_id, ambassador_id, kind, referred_profile_id, status, reviewed_at)
  values (c.id, member.profile_id, 'signup', caller, 'verified', now())
  on conflict do nothing;

  if not found then return jsonb_build_object('ok', false, 'reason', 'already_attributed'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.zs_attribute_signup(text) to authenticated;

-- Activation: a referred member's first post within 30 days of signing up.
create or replace function public.zs_track_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.zs_campaign_results;
begin
  begin
    select * into s from public.zs_campaign_results
    where kind = 'signup' and referred_profile_id = new.author_id and status = 'verified'
      and created_at > now() - interval '30 days'
    limit 1;

    if s.id is not null then
      insert into public.zs_campaign_results (campaign_id, ambassador_id, kind, referred_profile_id, status, reviewed_at)
      values (s.campaign_id, s.ambassador_id, 'activation', new.author_id, 'verified', now())
      on conflict do nothing;
    end if;
  exception when others then
    -- Never let attribution get in the way of someone posting.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists zs_track_activation on public.posts;
create trigger zs_track_activation
  after insert on public.posts
  for each row execute function public.zs_track_activation();

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
  cur text;
begin
  if caller is null then return jsonb_build_object('found', false); end if;
  select payout_currency into cur from public.zs_ambassadors where profile_id = caller;
  if cur is null then return jsonb_build_object('found', false); end if;

  return jsonb_build_object(
    'found', true,
    'currency', cur,
    'week_start', this_week,
    'next_payout_on', this_week + 7,
    'this_week', coalesce((
      select jsonb_agg(jsonb_build_object(
        'campaign_id', b.campaign_id, 'title', b.title, 'results', b.results,
        'base', b.base_amount, 'bonus', b.bonus_amount, 'tiers', b.bonus_tiers))
      from public.zs_unpaid_breakdown(caller, null) b where b.week_start = this_week
    ), '[]'::jsonb),
    'this_week_total', coalesce((
      select sum(b.base_amount + b.bonus_amount) from public.zs_unpaid_breakdown(caller, null) b
      where b.week_start = this_week), 0),
    'unpaid_total', coalesce((
      select sum(b.base_amount + b.bonus_amount) from public.zs_unpaid_breakdown(caller, null) b), 0),
    'paid_total', coalesce((select sum(total) from public.zs_payouts where profile_id = caller), 0),
    'pending_proofs', (select count(*) from public.zs_campaign_results
                       where ambassador_id = caller and status = 'pending'),
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

create or replace function public.zs_campaign_leaderboard(p_period text default 'week', p_limit integer default 50)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  avatar_url text,
  location text,
  results integer,
  level text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.profile_id,
         coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'An ambassador'),
         pr.username, pr.avatar_url, a.location,
         coalesce(sum(r.quantity), 0)::integer,
         public.zs_ambassador_level((select count(*)::integer from public.zs_ambassador_task_log l
                                      where l.profile_id = a.profile_id and l.status = 'approved'))
  from public.zs_ambassadors a
  join public.profiles pr on pr.id = a.profile_id
  left join public.zs_campaign_results r
    on r.ambassador_id = a.profile_id and r.status = 'verified'
   and (p_period <> 'week' or r.week_start = public.zs_week_start())
  where a.status = 'active'
  group by a.profile_id, pr.full_name, pr.username, pr.avatar_url, a.location, a.joined_at
  order by coalesce(sum(r.quantity), 0) desc, a.joined_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
grant execute on function public.zs_campaign_leaderboard(text, integer) to anon, authenticated;

-- ------------------------------------------------------------ admin side ---
create or replace function public.zs_admin_save_campaign(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := nullif(p->>'id', '')::uuid;
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if length(btrim(coalesce(p->>'title', ''))) < 4 then raise exception 'Give the campaign a title'; end if;

  if cid is null then
    insert into public.zs_amb_campaigns (
      title, summary, description, cover_url, partner_name, partner_url, goal, tracking,
      reward_signup, reward_activation, reward_proof, proof_unit_label, bonus_tiers,
      locations, max_ambassadors, starts_at, ends_at, status, created_by
    ) values (
      btrim(p->>'title'), nullif(btrim(coalesce(p->>'summary', '')), ''), nullif(btrim(coalesce(p->>'description', '')), ''),
      nullif(btrim(coalesce(p->>'cover_url', '')), ''), nullif(btrim(coalesce(p->>'partner_name', '')), ''),
      nullif(btrim(coalesce(p->>'partner_url', '')), ''),
      coalesce(nullif(p->>'goal', ''), 'signups'), coalesce(nullif(p->>'tracking', ''), 'both'),
      coalesce((p->>'reward_signup')::numeric, 0), coalesce((p->>'reward_activation')::numeric, 0),
      coalesce((p->>'reward_proof')::numeric, 0), coalesce(nullif(btrim(coalesce(p->>'proof_unit_label', '')), ''), 'result'),
      coalesce(p->'bonus_tiers', '[]'::jsonb), nullif(btrim(coalesce(p->>'locations', '')), ''),
      nullif(p->>'max_ambassadors', '')::integer,
      coalesce(nullif(p->>'starts_at', '')::timestamptz, now()), nullif(p->>'ends_at', '')::timestamptz,
      coalesce(nullif(p->>'status', ''), 'draft'), auth.uid()
    ) returning id into cid;
  else
    update public.zs_amb_campaigns set
      title = btrim(p->>'title'),
      summary = nullif(btrim(coalesce(p->>'summary', '')), ''),
      description = nullif(btrim(coalesce(p->>'description', '')), ''),
      cover_url = nullif(btrim(coalesce(p->>'cover_url', '')), ''),
      partner_name = nullif(btrim(coalesce(p->>'partner_name', '')), ''),
      partner_url = nullif(btrim(coalesce(p->>'partner_url', '')), ''),
      goal = coalesce(nullif(p->>'goal', ''), goal),
      tracking = coalesce(nullif(p->>'tracking', ''), tracking),
      reward_signup = coalesce((p->>'reward_signup')::numeric, reward_signup),
      reward_activation = coalesce((p->>'reward_activation')::numeric, reward_activation),
      reward_proof = coalesce((p->>'reward_proof')::numeric, reward_proof),
      proof_unit_label = coalesce(nullif(btrim(coalesce(p->>'proof_unit_label', '')), ''), proof_unit_label),
      bonus_tiers = coalesce(p->'bonus_tiers', bonus_tiers),
      locations = nullif(btrim(coalesce(p->>'locations', '')), ''),
      max_ambassadors = nullif(p->>'max_ambassadors', '')::integer,
      starts_at = coalesce(nullif(p->>'starts_at', '')::timestamptz, starts_at),
      ends_at = nullif(p->>'ends_at', '')::timestamptz,
      status = coalesce(nullif(p->>'status', ''), status),
      updated_at = now()
    where id = cid;
    if not found then raise exception 'Campaign not found'; end if;
  end if;
  return cid;
end;
$$;
grant execute on function public.zs_admin_save_campaign(jsonb) to authenticated;

create or replace function public.zs_admin_campaigns()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select c.*,
             (select count(*) from public.zs_campaign_members m where m.campaign_id = c.id) as ambassadors,
             coalesce((select sum(quantity) from public.zs_campaign_results r
                       where r.campaign_id = c.id and r.status = 'verified'), 0) as verified_results,
             coalesce((select sum(quantity) from public.zs_campaign_results r
                       where r.campaign_id = c.id and r.status = 'pending'), 0) as pending_results
      from public.zs_amb_campaigns c
    ) x
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.zs_admin_campaigns() to authenticated;

create or replace function public.zs_admin_pending_proofs()
returns table (
  id uuid,
  campaign_id uuid,
  campaign_title text,
  proof_unit_label text,
  reward_proof numeric,
  ambassador_id uuid,
  ambassador_name text,
  ambassador_avatar text,
  location text,
  quantity integer,
  evidence text,
  evidence_url text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then return; end if;
  return query
    select r.id, c.id, c.title, c.proof_unit_label, c.reward_proof, r.ambassador_id,
           coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'An ambassador'),
           pr.avatar_url, a.location, r.quantity, r.evidence, r.evidence_url, r.created_at
    from public.zs_campaign_results r
    join public.zs_amb_campaigns c on c.id = r.campaign_id
    join public.zs_ambassadors a on a.profile_id = r.ambassador_id
    join public.profiles pr on pr.id = r.ambassador_id
    where r.kind = 'proof' and r.status = 'pending'
    order by r.created_at asc;
end;
$$;
grant execute on function public.zs_admin_pending_proofs() to authenticated;

create or replace function public.zs_admin_review_proof(
  p_id uuid,
  p_approve boolean,
  p_quantity integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.zs_campaign_results;
begin
  if not public.is_zero_club_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  select * into r from public.zs_campaign_results where id = p_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'already_reviewed'); end if;

  update public.zs_campaign_results set
    status = case when p_approve then 'verified' else 'rejected' end,
    quantity = case when p_approve and coalesce(p_quantity, 0) between 1 and 100000 then p_quantity else quantity end,
    review_note = p_note,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    -- Verified work counts toward the week it was verified in.
    week_start = public.zs_week_start()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.zs_admin_review_proof(uuid, boolean, integer, text) to authenticated;

-- What each ambassador is owed for all completed weeks up to p_until.
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
declare
  until_week date := coalesce(p_until, public.zs_week_start() - 7);
begin
  if not public.is_zero_club_admin() then return; end if;
  if until_week >= public.zs_week_start() then until_week := public.zs_week_start() - 7; end if;

  return query
    select a.profile_id,
           coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'An ambassador'),
           pr.avatar_url, a.payout_currency,
           sum(b.results)::integer, sum(b.base_amount), sum(b.bonus_amount),
           sum(b.base_amount + b.bonus_amount)
    from public.zs_ambassadors a
    join public.profiles pr on pr.id = a.profile_id
    cross join lateral public.zs_unpaid_breakdown(a.profile_id, until_week) b
    group by a.profile_id, pr.full_name, pr.username, pr.avatar_url, a.payout_currency
    having sum(b.base_amount + b.bonus_amount) > 0
    order by sum(b.base_amount + b.bonus_amount) desc;
end;
$$;
grant execute on function public.zs_admin_payout_preview(date) to authenticated;

/*
 * Pays every completed week up to p_until. Idempotent: each payout has a unique
 * reference, the wallet ignores a reference it has seen, and paid results are
 * stamped with their payout so they can never be counted twice.
 */
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

    update public.zs_campaign_results
    set payout_id = v_payout
    where ambassador_id = rec.profile_id and status = 'verified' and payout_id is null and week_start <= until_week;

    perform public.wallet_apply(
      rec.profile_id, 'credit', rec.total, 'zerostart_payout',
      'ZeroStart weekly payout', ref,
      jsonb_build_object('week_until', until_week, 'results', rec.results,
                         'base', rec.base_amount, 'bonus', rec.bonus_amount, 'payout_id', v_payout)
    );

    begin
      insert into public.notifications (recipient_id, actor_id, type, content)
      values (rec.profile_id, rec.profile_id, 'system',
              'Your ZeroStart payout for ' || rec.results || ' results has landed in your Zero Club wallet.');
    exception when others then null;
    end;

    paid_count := paid_count + 1;
    paid_sum := paid_sum + rec.total;
    v_payout := null;
  end loop;

  return jsonb_build_object('ok', true, 'ambassadors_paid', paid_count, 'total', paid_sum, 'until', until_week);
end;
$$;
grant execute on function public.zs_admin_run_payouts(date) to authenticated;

notify pgrst, 'reload schema';
