-- Quests pay ZP, not XP.
--
-- XP is reputation: it says what someone has done and it should not be
-- spendable, or the record can be bought. ZP is the spendable balance. A quest
-- is a task the platform sets and rewards, so its payout belongs on the
-- spendable side — which is also what makes "1000 ZP = 100 naira" mean
-- something.
--
-- The quest rows keep their reward_xp column name. Renaming it would break the
-- admin dashboard, the API layer and every deployed client at once, for no
-- gain: what the number *is* has changed, not where it is stored. The award
-- path below is the part that decides which balance it lands in.

/* The ZP ledger, mirroring the XP one.
 *
 * The point of both is the unique key: an award is written once per
 * (person, event type, source key), so a double-tapped claim, a retried
 * request and a replayed webhook all collapse into the same single row. The
 * balance is only moved when that row is genuinely new. */
create table if not exists public.zp_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  source_key text not null,
  amount integer not null check (amount > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, event_type, source_key)
);

create index if not exists zp_events_profile_idx on public.zp_events (profile_id, created_at desc);

alter table public.zp_events enable row level security;

drop policy if exists zp_events_select_own on public.zp_events;
create policy zp_events_select_own
  on public.zp_events for select to authenticated
  using (profile_id = auth.uid());

-- No insert policy: awards are only ever made by the function below.

create or replace function public.award_profile_zp(
  p_profile_id uuid,
  p_event_type text,
  p_source_key text,
  p_amount integer,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_rows integer;
begin
  if p_profile_id is null or coalesce(trim(p_event_type), '') = ''
    or coalesce(trim(p_source_key), '') = '' or p_amount <= 0
  then
    raise exception 'Invalid ZP award';
  end if;

  insert into public.zp_events (profile_id, event_type, source_key, amount, metadata)
  values (p_profile_id, trim(p_event_type), trim(p_source_key), p_amount, coalesce(p_metadata, '{}'::jsonb))
  on conflict (profile_id, event_type, source_key) do nothing;

  get diagnostics inserted_rows = row_count;
  -- Already awarded. Not an error — the caller decides what to say.
  if inserted_rows = 0 then return false; end if;

  update public.profiles
  set zp = coalesce(zp, 0) + p_amount
  where id = p_profile_id;

  return true;
end;
$$;

revoke all on function public.award_profile_zp(uuid, text, text, integer, jsonb) from public, anon, authenticated;

-- Reclaimed under the same name so no deployed client has to change.
create or replace function public.claim_daily_xp_quest(p_quest_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  lagos_today date := (clock_timestamp() at time zone 'Africa/Lagos')::date;
  quest public.quests%rowtype;
  completed boolean := false;
  awarded boolean;
  source_key text;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into quest
  from public.quests
  where status = 'active' and (slug = p_quest_id or id::text = p_quest_id)
  limit 1;
  if quest.id is null then raise exception 'Quest is unavailable'; end if;

  completed := case quest.criteria_type
    when 'login' then true
    when 'post_today' then (
      select count(*) >= quest.criteria_count from public.posts
      where author_id = caller and (created_at at time zone 'Africa/Lagos')::date = lagos_today
    )
    when 'post' then (
      select count(*) >= quest.criteria_count from public.posts where author_id = caller
    )
    when 'comment' then (
      select count(*) >= quest.criteria_count from public.comments
      where profile_id = caller
        and (quest.type <> 'daily' or (created_at at time zone 'Africa/Lagos')::date = lagos_today)
    )
    when 'quote' then (
      select count(*) >= quest.criteria_count from public.posts
      where author_id = caller and quoted_post_id is not null
        and (quest.type <> 'daily' or (created_at at time zone 'Africa/Lagos')::date = lagos_today)
    )
    when 'club' then (
      select count(*) >= quest.criteria_count
      from public.club_members as member
      join public.clubs as club on club.id = member.club_id
      where club.creator_id = caller and coalesce(member.status, 'active') = 'active'
    )
    when 'follow' then (
      select count(*) >= quest.criteria_count from public.follows where follower_id = caller
    )
    when 'profile' then exists (
      select 1 from public.profiles where id = caller and length(btrim(coalesce(bio, ''))) > 0
    )
    when 'enrollment' then (
      select count(*) >= quest.criteria_count from public.enrollments where profile_id = caller
    )
    when 'ship' then (
      select count(*) >= quest.criteria_count from public.posts
      where author_id = caller and coalesce(is_build_post, false)
    )
    else false
  end;

  if not completed then raise exception 'Complete this quest before claiming its reward'; end if;

  source_key := case when quest.type = 'daily'
    then quest.slug || ':' || lagos_today::text
    else quest.slug
  end;

  awarded := public.award_profile_zp(
    caller, 'daily_quest', source_key, quest.reward_xp,
    jsonb_build_object('quest_id', quest.id, 'quest_slug', quest.slug, 'frequency', quest.type, 'date', lagos_today)
  );
  if not awarded then raise exception 'Quest reward already claimed'; end if;

  insert into public.quest_completions (profile_id, quest_id, completed_at, claimed_at)
  values (caller, quest.id, now(), now())
  on conflict (profile_id, quest_id)
  do update set completed_at = excluded.completed_at, claimed_at = excluded.claimed_at;

  return jsonb_build_object('success', true, 'reward', quest.reward_xp, 'zp_awarded', true);
end;
$$;

revoke all on function public.claim_daily_xp_quest(text) from public;
grant execute on function public.claim_daily_xp_quest(text) to authenticated;

notify pgrst, 'reload schema';

/* Quests claimed before this change awarded XP. Those are left alone: taking
   reputation back off people because the rules moved would be worse than the
   inconsistency. From here the payout is ZP. */
do $$
declare
  already integer;
begin
  select count(*) into already from public.xp_events where event_type = 'daily_quest';
  if already > 0 then
    raise notice '% quest rewards were paid as XP before this change and have been left as they are.', already;
  end if;
end $$;
