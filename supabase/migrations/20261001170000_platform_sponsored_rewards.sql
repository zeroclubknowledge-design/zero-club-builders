-- ALREADY APPLIED to Supabase project tiyifgfsuzhcvdvntjmp on 2026-10-01. Kept as a record only — do not re-run.
-- Zero Club–sponsored games and rewards.
-- Admins can host tournaments whose prizes are paid by Zero Club (no wallet
-- escrow from the admin's own account) and can reward any member directly.
-- Every naira and ZP paid this way is recorded in platform_rewards.

alter table public.zero_tournaments add column if not exists sponsored boolean not null default false;

create table if not exists public.platform_rewards (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('tournament_prize', 'direct_reward')),
  reward_type text not null check (reward_type in ('funds', 'zp')),
  admin_id uuid references public.profiles(id) on delete set null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  tournament_id uuid references public.zero_tournaments(id) on delete set null,
  place integer,
  amount bigint not null default 0,   -- ₦ paid (funds)
  zp integer not null default 0,      -- ZP paid
  naira_cost bigint not null,         -- what it cost Zero Club in ₦ (ZP / zp_per_naira)
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists platform_rewards_created_idx on public.platform_rewards (created_at desc);
create index if not exists platform_rewards_recipient_idx on public.platform_rewards (recipient_id);
alter table public.platform_rewards enable row level security;
create policy platform_rewards_admin_read on public.platform_rewards for select to authenticated using (public.is_zero_club_admin());

/* ── create: admins may sponsor ── */
create or replace function public.create_zero_tournament(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  t public.zero_tournaments;
  kind text := coalesce(p->>'reward_type', 'none');
  is_sponsored boolean := coalesce((p->>'sponsored')::boolean, false);
  prizes jsonb := '[]'::jsonb;
  item jsonb;
  pool bigint := 0;
  i int := 0;
  starts timestamptz := coalesce(nullif(p->>'starts_at', '')::timestamptz, now());
  mins int := coalesce((p->>'duration_minutes')::int, 60);
begin
  if caller is null then raise exception 'Sign in to create a tournament'; end if;
  if is_sponsored and not public.is_zero_club_admin() then raise exception 'Only Zero Club admins can host sponsored tournaments'; end if;
  if mins < 10 or mins > 60 * 24 * 30 then raise exception 'Tournaments last from 10 minutes to 30 days'; end if;
  if starts < now() - interval '2 minutes' then starts := now(); end if;
  if kind not in ('none', 'funds', 'zp', 'offer') then raise exception 'Unknown reward type'; end if;

  if kind <> 'none' then
    for item in select * from jsonb_array_elements(coalesce(p->'prizes', '[]'::jsonb)) loop
      i := i + 1;
      exit when i > 3;
      if kind = 'funds' then
        if coalesce((item->>'amount')::bigint, 0) <= 0 then raise exception 'Each prize needs an amount'; end if;
        if is_sponsored and (item->>'amount')::bigint > 5000000 then raise exception 'A single sponsored prize is capped at ₦5,000,000'; end if;
        pool := pool + (item->>'amount')::bigint;
        prizes := prizes || jsonb_build_object('place', i, 'amount', (item->>'amount')::bigint);
      elsif kind = 'zp' then
        if coalesce((item->>'zp')::int, 0) < 10 or (item->>'zp')::int % 10 <> 0 then raise exception 'ZP prizes go in steps of 10 (10 ZP = ₦1)'; end if;
        pool := pool + ((item->>'zp')::int / public.zp_per_naira())::bigint;
        prizes := prizes || jsonb_build_object('place', i, 'zp', (item->>'zp')::int);
      else
        if length(btrim(coalesce(item->>'label', ''))) < 3 then raise exception 'Describe each reward'; end if;
        prizes := prizes || jsonb_build_object('place', i, 'label', left(btrim(item->>'label'), 120));
      end if;
    end loop;
    if jsonb_array_length(prizes) = 0 then raise exception 'Add at least one prize'; end if;
  end if;

  insert into public.zero_tournaments (creator_id, game_type, title, description, difficulty, profession, starts_at, ends_at,
    max_players, visibility, eligibility, reward_type, prizes, prize_pool, sponsored)
  values (
    caller,
    p->>'game_type',
    btrim(p->>'title'),
    nullif(left(btrim(coalesce(p->>'description', '')), 600), ''),
    coalesce(nullif(p->>'difficulty', ''), 'medium'),
    nullif(p->>'profession', ''),
    starts,
    starts + make_interval(mins => mins),
    nullif(p->>'max_players', '')::int,
    coalesce(nullif(p->>'visibility', ''), 'public'),
    coalesce(nullif(p->>'eligibility', ''), 'everyone'),
    kind, prizes, pool, is_sponsored
  ) returning * into t;

  if is_sponsored then
    -- Zero Club pays at settlement; nothing leaves the admin's wallet.
    insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
    values (caller, 'sponsor_tournament', 'zero_tournament', t.id,
      jsonb_build_object('title', t.title, 'reward_type', kind, 'prizes', prizes, 'budget_naira', pool));
  elsif pool > 0 then
    perform public.wallet_apply(caller, 'debit', pool, 'game', 'Tournament prize pool: ' || left(t.title, 60),
      'zt_escrow_' || t.id, jsonb_build_object('tournament_id', t.id));
  end if;

  return jsonb_build_object('ok', true, 'id', t.id, 'share_code', t.share_code);
end;
$$;
grant execute on function public.create_zero_tournament(jsonb) to authenticated;

/* ── settle: sponsored prizes come from Zero Club and are recorded ── */
create or replace function public.settle_zero_tournament(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.zero_tournaments;
  prize jsonb;
  winner record;
  paid bigint := 0;
  place int;
begin
  select * into t from public.zero_tournaments where id = p_id for update;
  if t.id is null or t.settled_at is not null or t.ends_at > now() then return; end if;

  for prize in select * from jsonb_array_elements(t.prizes) loop
    place := (prize->>'place')::int;
    select * into winner from public.zero_tournament_players
    where tournament_id = t.id and best_score > 0 and profile_id <> t.creator_id
    order by best_score desc, best_at asc
    offset place - 1 limit 1;
    exit when winner.profile_id is null;

    insert into public.zero_tournament_awards (tournament_id, profile_id, place, score, amount, zp, label)
    values (t.id, winner.profile_id, place, winner.best_score, coalesce((prize->>'amount')::bigint, 0), coalesce((prize->>'zp')::int, 0), prize->>'label');

    if t.reward_type = 'funds' then
      perform public.wallet_apply(winner.profile_id, 'credit', (prize->>'amount')::bigint, 'game',
        case when t.sponsored then 'Zero Club prize: #' else 'Zero Games prize: #' end || place || ' in ' || left(t.title, 50),
        'zt_prize_' || t.id || '_' || place, jsonb_build_object('tournament_id', t.id, 'sponsored', t.sponsored));
      paid := paid + (prize->>'amount')::bigint;
    elsif t.reward_type = 'zp' then
      perform public.award_profile_zp(winner.profile_id, 'tournament', t.id::text || ':' || place, (prize->>'zp')::int,
        jsonb_build_object('tournament_id', t.id, 'sponsored', t.sponsored));
      paid := paid + ((prize->>'zp')::int / public.zp_per_naira())::bigint;
    end if;

    if t.sponsored and t.reward_type in ('funds', 'zp') then
      insert into public.platform_rewards (kind, reward_type, admin_id, recipient_id, tournament_id, place, amount, zp, naira_cost, reason)
      values ('tournament_prize', t.reward_type, t.creator_id, winner.profile_id, t.id, place,
        coalesce((prize->>'amount')::bigint, 0), coalesce((prize->>'zp')::int, 0),
        coalesce((prize->>'amount')::bigint, 0) + coalesce((prize->>'zp')::int, 0) / public.zp_per_naira(),
        '#' || place || ' in ' || t.title);
    end if;

    begin
      insert into public.notifications (recipient_id, actor_id, type, content, entity_id)
      values (winner.profile_id, t.creator_id, 'game_buzz',
        'You finished #' || place || ' in "' || t.title || '" 🏆' ||
        case t.reward_type when 'funds' then ' Your prize is in your wallet.'
                           when 'zp' then ' ' || (prize->>'zp') || ' ZP added.'
                           when 'offer' then ' You won: ' || (prize->>'label') || '.'
                           else '' end,
        t.id);
    exception when others then null;
    end;
    winner := null;
  end loop;

  -- Prizes nobody won go back to the host — unless Zero Club was paying.
  if not t.sponsored and t.prize_pool - paid > 0 then
    perform public.wallet_apply(t.creator_id, 'credit', t.prize_pool - paid, 'game', 'Unclaimed tournament prizes returned',
      'zt_refund_' || t.id, jsonb_build_object('tournament_id', t.id));
  end if;

  update public.zero_tournaments set settled_at = now() where id = t.id;
end;
$$;

/* ── direct rewards from Zero Club ── */
create or replace function public.admin_grant_reward(p_profile uuid, p_type text, p_amount bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  rid uuid := gen_random_uuid();
  cost bigint;
  who text;
begin
  if not public.is_zero_club_admin() then raise exception 'Admins only'; end if;
  if p_type not in ('funds', 'zp') then raise exception 'Choose funds or ZP'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Add a short reason for the record'; end if;
  if not exists (select 1 from public.profiles where id = p_profile) then raise exception 'Member not found'; end if;

  if p_type = 'funds' then
    if p_amount is null or p_amount < 1 or p_amount > 5000000 then raise exception 'Funds rewards go from ₦1 to ₦5,000,000'; end if;
    cost := p_amount;
    perform public.wallet_apply(p_profile, 'credit', p_amount, 'reward', 'Reward from Zero Club: ' || left(btrim(p_reason), 80),
      'admin_reward_' || rid, jsonb_build_object('platform_reward_id', rid, 'admin_id', caller));
  else
    if p_amount is null or p_amount < 10 or p_amount % 10 <> 0 or p_amount > 50000000 then raise exception 'ZP rewards go in steps of 10'; end if;
    cost := p_amount / public.zp_per_naira();
    perform public.award_profile_zp(p_profile, 'admin_reward', rid::text, p_amount::int,
      jsonb_build_object('platform_reward_id', rid, 'admin_id', caller, 'reason', left(btrim(p_reason), 200)));
  end if;

  insert into public.platform_rewards (id, kind, reward_type, admin_id, recipient_id, amount, zp, naira_cost, reason)
  values (rid, 'direct_reward', p_type, caller, p_profile,
    case when p_type = 'funds' then p_amount else 0 end,
    case when p_type = 'zp' then p_amount::int else 0 end,
    cost, left(btrim(p_reason), 300));

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (caller, 'grant_reward', 'profile', p_profile, jsonb_build_object('type', p_type, 'amount', p_amount, 'reason', btrim(p_reason)));

  begin
    insert into public.notifications (recipient_id, actor_id, type, content, entity_id)
    values (p_profile, caller, 'system',
      case when p_type = 'funds' then 'Zero Club sent you a reward 🎉 It''s in your wallet. ' else 'Zero Club sent you ' || p_amount || ' ZP 🎉 ' end
        || '"' || left(btrim(p_reason), 120) || '"',
      rid);
  exception when others then null;
  end;

  select coalesce(nullif(btrim(full_name), ''), username) into who from public.profiles where id = p_profile;
  return jsonb_build_object('ok', true, 'id', rid, 'recipient', who);
end;
$$;
grant execute on function public.admin_grant_reward(uuid, text, bigint, text) to authenticated;

/* ── admin panel: the record ── */
create or replace function public.admin_platform_rewards(p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'funds', coalesce(sum(amount), 0),
        'zp', coalesce(sum(zp), 0),
        'naira_cost', coalesce(sum(naira_cost), 0),
        'month_cost', coalesce(sum(naira_cost) filter (where created_at >= date_trunc('month', now())), 0),
        'count', count(*),
        'recipients', count(distinct recipient_id))
      from public.platform_rewards),
    'committed', (
      select coalesce(sum(prize_pool), 0) from public.zero_tournaments
      where sponsored and settled_at is null and ends_at > now() - interval '1 day'),
    'rewards', coalesce((
      select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
        select r.id, r.kind, r.reward_type, r.amount, r.zp, r.naira_cost, r.reason, r.place, r.created_at,
               r.recipient_id, coalesce(nullif(btrim(rp.full_name), ''), rp.username) as recipient_name, rp.username as recipient_username, rp.avatar_url as recipient_avatar,
               coalesce(nullif(btrim(ap.full_name), ''), ap.username) as admin_name,
               r.tournament_id, t.title as tournament_title
        from public.platform_rewards r
        join public.profiles rp on rp.id = r.recipient_id
        left join public.profiles ap on ap.id = r.admin_id
        left join public.zero_tournaments t on t.id = r.tournament_id
        order by r.created_at desc
        limit greatest(1, least(p_limit, 500))
      ) x), '[]'::jsonb),
    'tournaments', coalesce((
      select jsonb_agg(row_to_json(y) order by y.ends_at desc) from (
        select t.id, t.title, t.game_type, t.reward_type, t.prizes, t.prize_pool, t.starts_at, t.ends_at, t.settled_at,
               public.zt_status(t) as status,
               coalesce(nullif(btrim(c.full_name), ''), c.username) as host_name,
               (select count(*) from public.zero_tournament_players p where p.tournament_id = t.id) as players,
               (select coalesce(sum(naira_cost), 0) from public.platform_rewards r where r.tournament_id = t.id) as paid
        from public.zero_tournaments t join public.profiles c on c.id = t.creator_id
        where t.sponsored
        order by t.ends_at desc
        limit 50
      ) y), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.admin_platform_rewards(int) to authenticated;

/* ── list + detail also say whether Zero Club is sponsoring ── */
do $do$
declare def text; nd text;
begin
  def := pg_get_functiondef('public.zero_tournaments_list(text)'::regprocedure);
  nd := replace(def, 't.share_code, public.zt_status(t) as status,', 't.share_code, t.sponsored, public.zt_status(t) as status,');
  if nd = def then raise exception 'list patch did not apply'; end if;
  execute nd;

  def := pg_get_functiondef('public.zero_tournament_detail(uuid, text)'::regprocedure);
  nd := replace(def, '''status'', public.zt_status(t), ''creator_id''', '''status'', public.zt_status(t), ''sponsored'', t.sponsored, ''creator_id''');
  if nd = def then raise exception 'detail patch did not apply'; end if;
  execute nd;
end
$do$;
