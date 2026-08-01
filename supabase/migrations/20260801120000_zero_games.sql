-- Zero Games: free-entry multiplayer competitions with either a verified
-- platform offer or a creator-funded cash prize held in escrow.

create table if not exists public.zero_game_competitions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete restrict,
  game_type text not null check (game_type in ('sudoku', 'words')),
  title text not null check (char_length(title) between 3 and 80),
  profession text,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard', 'expert')),
  visibility text not null default 'public' check (visibility in ('public', 'link', 'followers')),
  reward_type text not null check (reward_type in ('offer', 'cash')),
  offer_type text,
  offer_label text,
  prize_amount bigint not null default 0 check (prize_amount >= 0),
  max_players integer not null default 8 check (max_players between 2 and 20),
  duration_seconds integer not null default 300 check (duration_seconds between 60 and 1800),
  status text not null default 'open' check (status in ('open', 'countdown', 'active', 'completed', 'cancelled')),
  starts_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  winner_id uuid references public.profiles(id) on delete set null,
  puzzle jsonb not null,
  share_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (reward_type = 'cash' and prize_amount > 0 and offer_type is null)
    or (reward_type = 'offer' and prize_amount = 0 and offer_type is not null)
  )
);

create table if not exists public.zero_game_competition_secrets (
  competition_id uuid primary key references public.zero_game_competitions(id) on delete cascade,
  solution jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.zero_game_players (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.zero_game_competitions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'joined' check (status in ('joined', 'ready', 'playing', 'finished')),
  progress integer not null default 0 check (progress between 0 and 100),
  mistakes integer not null default 0 check (mistakes >= 0),
  score integer not null default 0 check (score >= 0),
  finished_at timestamptz,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, profile_id)
);

create table if not exists public.zero_game_rewards (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null unique references public.zero_game_competitions(id) on delete restrict,
  winner_id uuid not null references public.profiles(id) on delete restrict,
  reward_type text not null check (reward_type in ('offer', 'cash')),
  amount bigint not null default 0 check (amount >= 0),
  offer_type text,
  offer_label text,
  redemption_code text,
  status text not null default 'unlocked' check (status in ('unlocked', 'redeemed')),
  expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.zero_game_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.zero_game_competitions(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  counterparty_id uuid references public.profiles(id) on delete set null,
  amount bigint not null check (amount > 0),
  direction text not null check (direction in ('debit', 'credit')),
  kind text not null check (kind in ('escrow', 'payout', 'refund')),
  created_at timestamptz not null default now()
);

create table if not exists public.zero_game_sudoku_bank (
  id bigint generated always as identity primary key,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard', 'expert')),
  puzzle text not null unique check (char_length(puzzle) = 81),
  solution text not null check (char_length(solution) = 81),
  created_at timestamptz not null default now()
);

insert into public.zero_game_sudoku_bank (difficulty, puzzle, solution) values
  ('easy', '2-9-----8-1-62---38--4-912-42-----69--32--4--7-59--38---4-62891-587-------21--754', '249315678517628943836479125421837569983256417765941382374562891158794236692183754'),
  ('easy', '--29--6855---4-----6-2-5-9-895-213-713475-----7-8-9--1------9--918-7-54-6--5--13-', '742913685589647213361285794895421367134756829276839451453168972918372546627594138'),
  ('medium', '8----4-3----9-7-----45---7-6-----72--954---1614--7----321----9-5--2---4-4---6--81', '817624539253917468964583172638159724795432816142876953321748695586291347479365281'),
  ('medium', '1837--62-6--9--4-3--9------------7--7-2----3--96437-5--4-12---6-6-----4-3---5-8--', '183745629657912483429863517534291768712586934896437251945128376268379145371654892'),
  ('hard', '-9-1----31---69-2---8----1-76--8-1---843-------27---6-6-----5--3-1--2------5-----', '496127853135869427278453916763285194984316275512794368627938541351642789849571632'),
  ('hard', '-97------3----5--2-5--7---1---------5--8---1-6----3--4-----7-9-9-6-3--8-1----4-6-', '497128356361495872258376941712549638543862719689713524824657193976231485135984267'),
  ('expert', '--3--1-5-5------2-------681-4----7-6-3-6---------28--9---8-5-----62-----19-------', '263781954581946327479532681842159736935674812617328549724895163356217498198463275'),
  ('expert', '--7----4-----9-3--14--5---2-9-5--61---692-------1--8----------36-8--7---------4-8', '967832145285491376143756982392578614816924537574163829421689753658347291739215468')
on conflict (puzzle) do nothing;

create index if not exists zero_game_competitions_discovery_idx
  on public.zero_game_competitions (status, visibility, created_at desc);
create index if not exists zero_game_competitions_creator_idx
  on public.zero_game_competitions (creator_id, created_at desc);
create index if not exists zero_game_players_competition_idx
  on public.zero_game_players (competition_id, joined_at);
create index if not exists zero_game_players_profile_idx
  on public.zero_game_players (profile_id, joined_at desc);
create index if not exists zero_game_rewards_winner_idx
  on public.zero_game_rewards (winner_id, created_at desc);
create index if not exists zero_game_wallet_transactions_profile_idx
  on public.zero_game_wallet_transactions (profile_id, created_at desc);

alter table public.zero_game_competitions enable row level security;
alter table public.zero_game_competition_secrets enable row level security;
alter table public.zero_game_players enable row level security;
alter table public.zero_game_rewards enable row level security;
alter table public.zero_game_wallet_transactions enable row level security;
alter table public.zero_game_sudoku_bank enable row level security;

drop policy if exists zero_game_competitions_select_authenticated on public.zero_game_competitions;
create policy zero_game_competitions_select_authenticated
  on public.zero_game_competitions for select to authenticated using (true);

drop policy if exists zero_game_players_select_authenticated on public.zero_game_players;
create policy zero_game_players_select_authenticated
  on public.zero_game_players for select to authenticated using (true);

drop policy if exists zero_game_rewards_select_involved on public.zero_game_rewards;
create policy zero_game_rewards_select_involved
  on public.zero_game_rewards for select to authenticated
  using (
    winner_id = auth.uid()
    or exists (
      select 1 from public.zero_game_competitions competition
      where competition.id = zero_game_rewards.competition_id
        and competition.creator_id = auth.uid()
    )
  );

drop policy if exists zero_game_wallet_transactions_select_own on public.zero_game_wallet_transactions;
create policy zero_game_wallet_transactions_select_own
  on public.zero_game_wallet_transactions for select to authenticated
  using (profile_id = auth.uid());

create or replace function public.create_zero_game_competition(
  p_game_type text,
  p_title text,
  p_profession text,
  p_difficulty text,
  p_visibility text,
  p_reward_type text,
  p_offer_type text,
  p_prize_amount bigint,
  p_max_players integer,
  p_starts_at timestamptz,
  p_duration_seconds integer,
  p_host_plays boolean,
  p_words_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  competition_id uuid := gen_random_uuid();
  generated_share_code text := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10));
  current_balance bigint;
  selected_puzzle text;
  selected_solution text;
  public_puzzle jsonb;
  secret_solution jsonb;
  resolved_offer_label text;
begin
  if caller is null then raise exception 'You must be signed in'; end if;
  if p_game_type not in ('sudoku', 'words') then raise exception 'Choose a Zero Game'; end if;
  if coalesce(char_length(trim(p_title)), 0) < 3 or char_length(trim(p_title)) > 80 then
    raise exception 'Use a competition name between 3 and 80 characters';
  end if;
  if p_difficulty not in ('easy', 'medium', 'hard', 'expert') then raise exception 'Choose a valid difficulty'; end if;
  if p_visibility not in ('public', 'link', 'followers') then raise exception 'Choose who can join'; end if;
  if p_reward_type not in ('offer', 'cash') then raise exception 'Choose a reward'; end if;
  if p_max_players is null or p_max_players < 2 or p_max_players > 20 then raise exception 'Choose between 2 and 20 players'; end if;
  if p_duration_seconds is null or p_duration_seconds < 60 or p_duration_seconds > 1800 then raise exception 'Choose a duration between 1 and 30 minutes'; end if;

  if p_reward_type = 'cash' then
    if coalesce(p_prize_amount, 0) < 100 then raise exception 'The minimum secured prize is 100'; end if;
    select coalesce(coins, 0)::bigint into current_balance
    from public.profiles where id = caller for update;
    if current_balance < p_prize_amount then
      raise exception 'Your wallet balance is too low. Add % more to secure this prize', p_prize_amount - current_balance;
    end if;
  else
    if p_offer_type not in ('bootcamp_discount', 'store_credit', 'membership_pass', 'profile_spotlight') then
      raise exception 'Choose a verified Zero Club offer';
    end if;
    resolved_offer_label := case p_offer_type
      when 'bootcamp_discount' then '15% off one Zero Club Bootcamp'
      when 'store_credit' then 'Zero Store reward voucher'
      when 'membership_pass' then '7-day Premium access pass'
      when 'profile_spotlight' then '24-hour profile spotlight'
    end;
  end if;

  if p_game_type = 'sudoku' then
    select bank.puzzle, bank.solution into selected_puzzle, selected_solution
    from public.zero_game_sudoku_bank bank
    where bank.difficulty = p_difficulty
    order by random()
    limit 1;
    if selected_puzzle is null then raise exception 'No Sudoku puzzle is available for this difficulty'; end if;
    public_puzzle := jsonb_build_object('puzzle', selected_puzzle, 'difficulty', p_difficulty);
    secret_solution := jsonb_build_object('solution', selected_solution);
  else
    if coalesce(trim(p_profession), '') = '' then raise exception 'Choose a professional field'; end if;
    if jsonb_typeof(p_words_payload -> 'letters') <> 'array'
      or jsonb_array_length(p_words_payload -> 'letters') <> 144
      or jsonb_typeof(p_words_payload -> 'words') <> 'array'
      or jsonb_array_length(p_words_payload -> 'words') < 6
      or jsonb_typeof(p_words_payload -> 'placements') <> 'array'
      or jsonb_array_length(p_words_payload -> 'placements') <> jsonb_array_length(p_words_payload -> 'words')
    then raise exception 'The Zero Words board is invalid'; end if;
    public_puzzle := jsonb_build_object(
      'size', 12,
      'letters', p_words_payload -> 'letters',
      'words', p_words_payload -> 'words'
    );
    secret_solution := jsonb_build_object(
      'words', p_words_payload -> 'words',
      'placements', p_words_payload -> 'placements'
    );
  end if;

  insert into public.zero_game_competitions (
    id, creator_id, game_type, title, profession, difficulty, visibility,
    reward_type, offer_type, offer_label, prize_amount, max_players,
    duration_seconds, starts_at, puzzle, share_code
  ) values (
    competition_id, caller, p_game_type, trim(p_title), nullif(trim(p_profession), ''),
    p_difficulty, p_visibility, p_reward_type,
    case when p_reward_type = 'offer' then p_offer_type else null end,
    case when p_reward_type = 'offer' then resolved_offer_label else null end,
    case when p_reward_type = 'cash' then p_prize_amount else 0 end,
    p_max_players, p_duration_seconds, greatest(coalesce(p_starts_at, now()), now()),
    public_puzzle, generated_share_code
  );

  insert into public.zero_game_competition_secrets (competition_id, solution)
  values (competition_id, secret_solution);

  if coalesce(p_host_plays, true) then
    insert into public.zero_game_players (competition_id, profile_id, status)
    values (competition_id, caller, 'ready');
  end if;

  if p_reward_type = 'cash' then
    update public.profiles set coins = coalesce(coins, 0) - p_prize_amount where id = caller;
    insert into public.zero_game_wallet_transactions (
      competition_id, profile_id, amount, direction, kind
    ) values (competition_id, caller, p_prize_amount, 'debit', 'escrow');
  end if;

  return jsonb_build_object(
    'competition_id', competition_id,
    'share_code', generated_share_code,
    'reward_secured', p_reward_type = 'cash'
  );
end;
$$;

create or replace function public.join_zero_game_competition(p_competition_id uuid)
returns public.zero_game_players
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  competition public.zero_game_competitions;
  player public.zero_game_players;
  player_count integer;
begin
  if caller is null then raise exception 'You must be signed in'; end if;
  select * into competition from public.zero_game_competitions where id = p_competition_id for update;
  if competition.id is null then raise exception 'Competition not found'; end if;
  if competition.status <> 'open' then raise exception 'This competition is no longer accepting players'; end if;
  if competition.visibility = 'followers'
    and caller <> competition.creator_id
    and not exists (
      select 1 from public.follows
      where follower_id = caller and following_id = competition.creator_id
    )
  then raise exception 'Only this host''s followers can join'; end if;
  select count(*) into player_count from public.zero_game_players where competition_id = competition.id;
  if player_count >= competition.max_players then raise exception 'This competition is full'; end if;

  insert into public.zero_game_players (competition_id, profile_id)
  values (competition.id, caller)
  on conflict (competition_id, profile_id) do update set updated_at = now()
  returning * into player;
  return player;
end;
$$;

create or replace function public.set_zero_game_ready(p_competition_id uuid, p_ready boolean)
returns public.zero_game_players
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.zero_game_players;
begin
  update public.zero_game_players
  set status = case when p_ready then 'ready' else 'joined' end, updated_at = now()
  where competition_id = p_competition_id and profile_id = auth.uid()
  returning * into player;
  if player.id is null then raise exception 'Join the competition first'; end if;
  return player;
end;
$$;

create or replace function public.start_zero_game_competition(p_competition_id uuid)
returns public.zero_game_competitions
language plpgsql
security definer
set search_path = public
as $$
declare
  competition public.zero_game_competitions;
  player_count integer;
  ready_count integer;
begin
  select * into competition from public.zero_game_competitions where id = p_competition_id for update;
  if competition.id is null then raise exception 'Competition not found'; end if;
  if competition.creator_id <> auth.uid() then raise exception 'Only the host can start this race'; end if;
  if competition.status <> 'open' then raise exception 'This race has already started'; end if;
  select count(*), count(*) filter (where status = 'ready') into player_count, ready_count
  from public.zero_game_players where competition_id = competition.id;
  if player_count < 2 then raise exception 'At least two players are required'; end if;
  if ready_count < player_count then raise exception 'Wait until every player is ready'; end if;

  update public.zero_game_competitions
  set status = 'countdown', started_at = greatest(now() + interval '5 seconds', starts_at), updated_at = now()
  where id = competition.id
  returning * into competition;

  update public.zero_game_players
  set status = 'playing', updated_at = now()
  where competition_id = competition.id;

  return competition;
end;
$$;

create or replace function public.update_zero_game_progress(p_competition_id uuid, p_progress integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.zero_game_players
  set progress = greatest(progress, least(100, greatest(0, p_progress))), updated_at = now()
  where competition_id = p_competition_id and profile_id = auth.uid();
end;
$$;

create or replace function public.submit_zero_game_result(p_competition_id uuid, p_submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  competition public.zero_game_competitions;
  secret jsonb;
  valid_submission boolean := false;
  elapsed_ms integer;
  reward_code text;
begin
  if caller is null then raise exception 'You must be signed in'; end if;
  select * into competition from public.zero_game_competitions where id = p_competition_id for update;
  if competition.id is null then raise exception 'Competition not found'; end if;
  if competition.status = 'completed' then
    return jsonb_build_object('winner', false, 'finished', true, 'winner_id', competition.winner_id);
  end if;
  if competition.status not in ('countdown', 'active') or competition.started_at is null or competition.started_at > now() then
    raise exception 'The race has not started';
  end if;
  if now() >= competition.started_at + make_interval(secs => competition.duration_seconds) then
    raise exception 'The race timer has ended';
  end if;
  if not exists (
    select 1 from public.zero_game_players
    where competition_id = competition.id and profile_id = caller
  ) then raise exception 'Join this competition before playing'; end if;

  select solution into secret from public.zero_game_competition_secrets
  where competition_id = competition.id;

  if competition.game_type = 'sudoku' then
    valid_submission := coalesce(p_submission ->> 'solution', '') = coalesce(secret ->> 'solution', '');
  else
    valid_submission := not exists (
      select 1
      from jsonb_array_elements(secret -> 'placements') required(placement)
      where not exists (
        select 1
        from jsonb_array_elements(coalesce(p_submission -> 'found', '[]'::jsonb)) submitted(placement)
        where upper(submitted.placement ->> 'word') = upper(required.placement ->> 'word')
          and (
            submitted.placement -> 'path' = required.placement -> 'path'
            or submitted.placement -> 'path' = (
              select jsonb_agg(path_cell.value order by path_cell.ordinality desc)
              from jsonb_array_elements(required.placement -> 'path') with ordinality path_cell(value, ordinality)
            )
          )
      )
    );
  end if;

  if not valid_submission then
    update public.zero_game_players
    set mistakes = mistakes + 1, updated_at = now()
    where competition_id = competition.id and profile_id = caller;
    return jsonb_build_object('winner', false, 'valid', false);
  end if;

  elapsed_ms := greatest(0, floor(extract(epoch from (clock_timestamp() - competition.started_at)) * 1000)::integer);
  update public.zero_game_players
  set status = 'finished', progress = 100, finished_at = clock_timestamp(),
      score = greatest(1, competition.duration_seconds * 1000 - elapsed_ms), updated_at = now()
  where competition_id = competition.id and profile_id = caller;

  update public.zero_game_competitions
  set status = 'completed', winner_id = caller, completed_at = clock_timestamp(), updated_at = now()
  where id = competition.id;

  if competition.reward_type = 'cash' then
    update public.profiles set coins = coalesce(coins, 0) + competition.prize_amount where id = caller;
    insert into public.zero_game_wallet_transactions (
      competition_id, profile_id, counterparty_id, amount, direction, kind
    ) values (competition.id, caller, competition.creator_id, competition.prize_amount, 'credit', 'payout');
    insert into public.zero_game_rewards (
      competition_id, winner_id, reward_type, amount, status
    ) values (competition.id, caller, 'cash', competition.prize_amount, 'redeemed');
  else
    reward_code := 'ZERO-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
    insert into public.zero_game_rewards (
      competition_id, winner_id, reward_type, offer_type, offer_label,
      redemption_code, status, expires_at
    ) values (
      competition.id, caller, 'offer', competition.offer_type, competition.offer_label,
      reward_code, 'unlocked', now() + interval '30 days'
    );
  end if;

  insert into public.notifications (recipient_id, actor_id, type, content, entity_id)
  values (
    caller, competition.creator_id, 'system',
    case when competition.reward_type = 'cash'
      then 'You won ' || competition.title || ' and your secured prize is now in your wallet.'
      else 'You won ' || competition.title || ' and unlocked ' || competition.offer_label || '.'
    end,
    competition.id
  );

  return jsonb_build_object('winner', true, 'valid', true, 'winner_id', caller);
end;
$$;

create or replace function public.cancel_zero_game_competition(p_competition_id uuid)
returns public.zero_game_competitions
language plpgsql
security definer
set search_path = public
as $$
declare
  competition public.zero_game_competitions;
begin
  select * into competition from public.zero_game_competitions where id = p_competition_id for update;
  if competition.id is null then raise exception 'Competition not found'; end if;
  if competition.creator_id <> auth.uid() then raise exception 'Only the host can cancel this competition'; end if;
  if competition.status not in ('open', 'countdown') then raise exception 'An active or completed race cannot be cancelled'; end if;
  if competition.started_at is not null and competition.started_at <= now() then raise exception 'This race has already started'; end if;

  if competition.reward_type = 'cash' then
    update public.profiles set coins = coalesce(coins, 0) + competition.prize_amount
    where id = competition.creator_id;
    insert into public.zero_game_wallet_transactions (
      competition_id, profile_id, amount, direction, kind
    ) values (competition.id, competition.creator_id, competition.prize_amount, 'credit', 'refund');
  end if;

  update public.zero_game_competitions
  set status = 'cancelled', updated_at = now()
  where id = competition.id
  returning * into competition;
  return competition;
end;
$$;

create or replace function public.redeem_zero_game_offer(p_reward_id uuid)
returns public.zero_game_rewards
language plpgsql
security definer
set search_path = public
as $$
declare
  reward public.zero_game_rewards;
begin
  update public.zero_game_rewards
  set status = 'redeemed', redeemed_at = now()
  where id = p_reward_id and winner_id = auth.uid() and reward_type = 'offer' and status = 'unlocked'
  returning * into reward;
  if reward.id is null then raise exception 'This offer cannot be redeemed'; end if;
  return reward;
end;
$$;

create or replace function public.expire_zero_game_competition(p_competition_id uuid)
returns public.zero_game_competitions
language plpgsql
security definer
set search_path = public
as $$
declare
  competition public.zero_game_competitions;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;

  select * into competition
  from public.zero_game_competitions
  where id = p_competition_id
  for update;

  if competition.id is null then raise exception 'Competition not found'; end if;
  if competition.status in ('completed', 'cancelled') then return competition; end if;
  if competition.started_at is null
    or now() < competition.started_at + make_interval(secs => competition.duration_seconds)
  then raise exception 'This competition has not expired'; end if;

  if competition.reward_type = 'cash' then
    update public.profiles
    set coins = coalesce(coins, 0) + competition.prize_amount
    where id = competition.creator_id;

    insert into public.zero_game_wallet_transactions (
      competition_id, profile_id, amount, direction, kind
    ) values (
      competition.id, competition.creator_id, competition.prize_amount, 'credit', 'refund'
    );
  end if;

  update public.zero_game_competitions
  set status = 'cancelled', updated_at = now()
  where id = competition.id
  returning * into competition;

  return competition;
end;
$$;

revoke all on function public.create_zero_game_competition(text, text, text, text, text, text, text, bigint, integer, timestamptz, integer, boolean, jsonb) from public;
revoke all on function public.join_zero_game_competition(uuid) from public;
revoke all on function public.set_zero_game_ready(uuid, boolean) from public;
revoke all on function public.start_zero_game_competition(uuid) from public;
revoke all on function public.update_zero_game_progress(uuid, integer) from public;
revoke all on function public.submit_zero_game_result(uuid, jsonb) from public;
revoke all on function public.cancel_zero_game_competition(uuid) from public;
revoke all on function public.redeem_zero_game_offer(uuid) from public;
revoke all on function public.expire_zero_game_competition(uuid) from public;

grant execute on function public.create_zero_game_competition(text, text, text, text, text, text, text, bigint, integer, timestamptz, integer, boolean, jsonb) to authenticated;
grant execute on function public.join_zero_game_competition(uuid) to authenticated;
grant execute on function public.set_zero_game_ready(uuid, boolean) to authenticated;
grant execute on function public.start_zero_game_competition(uuid) to authenticated;
grant execute on function public.update_zero_game_progress(uuid, integer) to authenticated;
grant execute on function public.submit_zero_game_result(uuid, jsonb) to authenticated;
grant execute on function public.cancel_zero_game_competition(uuid) to authenticated;
grant execute on function public.redeem_zero_game_offer(uuid) to authenticated;
grant execute on function public.expire_zero_game_competition(uuid) to authenticated;

grant select on public.zero_game_competitions to authenticated;
grant select on public.zero_game_players to authenticated;
grant select on public.zero_game_rewards to authenticated;
grant select on public.zero_game_wallet_transactions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'zero_game_competitions'
  ) then alter publication supabase_realtime add table public.zero_game_competitions; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'zero_game_players'
  ) then alter publication supabase_realtime add table public.zero_game_players; end if;
end $$;
