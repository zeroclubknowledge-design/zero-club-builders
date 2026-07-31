-- Club giveaways use wallet-backed escrow. Publishing reserves the complete
-- prize pool; awarding winners releases it exactly once.

create table if not exists public.club_giveaways (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  message_id uuid unique references public.club_messages(id) on delete set null,
  creator_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 80),
  description text,
  amount_per_winner bigint not null check (amount_per_winner > 0),
  winner_count integer not null check (winner_count between 1 and 20),
  total_amount bigint not null check (total_amount > 0),
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'awarded', 'cancelled')),
  awarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.club_giveaway_entries (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.club_giveaways(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (giveaway_id, profile_id)
);

create table if not exists public.club_giveaway_awards (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.club_giveaways(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  amount bigint not null check (amount > 0),
  awarded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (giveaway_id, profile_id)
);

create table if not exists public.giveaway_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.club_giveaways(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  counterparty_id uuid references public.profiles(id) on delete set null,
  amount bigint not null check (amount > 0),
  direction text not null check (direction in ('debit', 'credit')),
  kind text not null check (kind in ('escrow', 'payout', 'refund')),
  created_at timestamptz not null default now()
);

create index if not exists club_giveaways_club_idx on public.club_giveaways (club_id, created_at desc);
create index if not exists club_giveaway_entries_giveaway_idx on public.club_giveaway_entries (giveaway_id, created_at);
create index if not exists club_giveaway_awards_giveaway_idx on public.club_giveaway_awards (giveaway_id);
create index if not exists giveaway_wallet_transactions_profile_idx on public.giveaway_wallet_transactions (profile_id, created_at desc);

alter table public.club_giveaways enable row level security;
alter table public.club_giveaway_entries enable row level security;
alter table public.club_giveaway_awards enable row level security;
alter table public.giveaway_wallet_transactions enable row level security;

drop policy if exists club_giveaways_select_members on public.club_giveaways;
create policy club_giveaways_select_members
  on public.club_giveaways for select to authenticated
  using (
    creator_id = auth.uid()
    or exists (
      select 1 from public.club_members member
      where member.club_id = club_giveaways.club_id and member.profile_id = auth.uid()
    )
  );

drop policy if exists club_giveaway_entries_select_members on public.club_giveaway_entries;
create policy club_giveaway_entries_select_members
  on public.club_giveaway_entries for select to authenticated
  using (
    exists (
      select 1
      from public.club_giveaways giveaway
      left join public.club_members member
        on member.club_id = giveaway.club_id and member.profile_id = auth.uid()
      where giveaway.id = club_giveaway_entries.giveaway_id
        and (giveaway.creator_id = auth.uid() or member.profile_id is not null)
    )
  );

drop policy if exists club_giveaway_awards_select_members on public.club_giveaway_awards;
create policy club_giveaway_awards_select_members
  on public.club_giveaway_awards for select to authenticated
  using (
    exists (
      select 1
      from public.club_giveaways giveaway
      left join public.club_members member
        on member.club_id = giveaway.club_id and member.profile_id = auth.uid()
      where giveaway.id = club_giveaway_awards.giveaway_id
        and (giveaway.creator_id = auth.uid() or member.profile_id is not null)
    )
  );

drop policy if exists giveaway_wallet_transactions_select_own on public.giveaway_wallet_transactions;
create policy giveaway_wallet_transactions_select_own
  on public.giveaway_wallet_transactions for select to authenticated
  using (profile_id = auth.uid());

create or replace function public.create_club_giveaway(
  p_club_id uuid,
  p_title text,
  p_description text,
  p_amount_per_winner bigint,
  p_winner_count integer,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  current_balance bigint;
  total_to_lock bigint;
  giveaway_id uuid := gen_random_uuid();
  message_id uuid := gen_random_uuid();
  message_content text;
begin
  if caller is null then raise exception 'You must be signed in'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Add a giveaway title'; end if;
  if char_length(trim(p_title)) > 80 then raise exception 'The giveaway title is too long'; end if;
  if p_amount_per_winner is null or p_amount_per_winner <= 0 then raise exception 'Enter a valid prize amount'; end if;
  if p_winner_count is null or p_winner_count < 1 or p_winner_count > 20 then raise exception 'Choose between 1 and 20 winners'; end if;
  if p_ends_at is null or p_ends_at <= now() then raise exception 'Choose a future closing time'; end if;

  if not exists (
    select 1
    from public.clubs club
    left join public.club_members member
      on member.club_id = club.id and member.profile_id = caller
    where club.id = p_club_id
      and (club.creator_id = caller or member.role = 'Administrator')
  ) then
    raise exception 'Only club admins can create giveaways';
  end if;

  total_to_lock := p_amount_per_winner * p_winner_count;
  select coalesce(coins, 0)::bigint into current_balance
  from public.profiles where id = caller for update;

  if current_balance < total_to_lock then
    raise exception 'Your wallet balance is too low. Add % more to publish this giveaway', total_to_lock - current_balance;
  end if;

  message_content := '::ZEROCLUB_GIVEAWAY::' || jsonb_build_object(
    'giveawayId', giveaway_id,
    'title', trim(p_title),
    'description', coalesce(trim(p_description), ''),
    'amountPerWinner', p_amount_per_winner,
    'totalAmount', total_to_lock,
    'endsAt', p_ends_at,
    'winners', p_winner_count
  )::text;

  insert into public.club_messages (id, club_id, profile_id, content, room_id)
  values (message_id, p_club_id, caller, message_content, 'general');

  insert into public.club_giveaways (
    id, club_id, message_id, creator_id, title, description,
    amount_per_winner, winner_count, total_amount, ends_at
  ) values (
    giveaway_id, p_club_id, message_id, caller, trim(p_title), nullif(trim(p_description), ''),
    p_amount_per_winner, p_winner_count, total_to_lock, p_ends_at
  );

  update public.profiles set coins = coalesce(coins, 0) - total_to_lock where id = caller;

  insert into public.giveaway_wallet_transactions (
    giveaway_id, profile_id, amount, direction, kind
  ) values (giveaway_id, caller, total_to_lock, 'debit', 'escrow');

  return jsonb_build_object(
    'giveaway_id', giveaway_id,
    'message_id', message_id,
    'amount_per_winner', p_amount_per_winner,
    'total_amount', total_to_lock
  );
end;
$$;

create or replace function public.enter_club_giveaway(p_giveaway_id uuid)
returns public.club_giveaway_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  giveaway public.club_giveaways;
  created_entry public.club_giveaway_entries;
begin
  if caller is null then raise exception 'You must be signed in'; end if;

  select * into giveaway from public.club_giveaways where id = p_giveaway_id for update;
  if giveaway.id is null then raise exception 'Giveaway not found'; end if;
  if giveaway.status <> 'open' or giveaway.ends_at <= now() then raise exception 'This giveaway is closed'; end if;
  if not exists (
    select 1 from public.club_members
    where club_id = giveaway.club_id and profile_id = caller
  ) then raise exception 'Join the club before entering'; end if;
  if giveaway.creator_id = caller or exists (
    select 1 from public.club_members
    where club_id = giveaway.club_id and profile_id = caller and role = 'Administrator'
  ) then raise exception 'Club admins cannot enter their own club giveaway'; end if;

  insert into public.club_giveaway_entries (giveaway_id, profile_id)
  values (giveaway.id, caller)
  on conflict (giveaway_id, profile_id) do update set profile_id = excluded.profile_id
  returning * into created_entry;

  insert into public.club_message_reactions (message_id, profile_id, emoji)
  values (giveaway.message_id, caller, U&'\+01F39F\FE0F')
  on conflict (message_id, profile_id, emoji) do nothing;

  return created_entry;
end;
$$;

create or replace function public.award_club_giveaway(
  p_giveaway_id uuid,
  p_winner_ids uuid[]
)
returns public.club_giveaways
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  giveaway public.club_giveaways;
  winner_id uuid;
  selected_count integer;
begin
  if caller is null then raise exception 'You must be signed in'; end if;

  select * into giveaway from public.club_giveaways where id = p_giveaway_id for update;
  if giveaway.id is null then raise exception 'Giveaway not found'; end if;
  if giveaway.status = 'awarded' then raise exception 'This giveaway has already been awarded'; end if;
  if giveaway.status <> 'open' then raise exception 'This giveaway cannot be awarded'; end if;
  if giveaway.ends_at > now() then raise exception 'Wait until the giveaway closes before choosing winners'; end if;

  if not exists (
    select 1
    from public.clubs club
    left join public.club_members member
      on member.club_id = club.id and member.profile_id = caller
    where club.id = giveaway.club_id
      and (club.creator_id = caller or member.role = 'Administrator')
  ) then raise exception 'Only club admins can award this giveaway'; end if;

  select count(distinct selected_id)::integer into selected_count
  from unnest(coalesce(p_winner_ids, array[]::uuid[])) selected_id;

  if selected_count <> giveaway.winner_count
    or selected_count <> coalesce(array_length(p_winner_ids, 1), 0)
  then raise exception 'Select exactly % unique winner(s)', giveaway.winner_count;
  end if;

  if exists (
    select 1 from unnest(p_winner_ids) selected_id
    where not exists (
      select 1 from public.club_giveaway_entries entry
      where entry.giveaway_id = giveaway.id and entry.profile_id = selected_id
    )
  ) then raise exception 'Every winner must be an eligible giveaway entrant'; end if;

  foreach winner_id in array p_winner_ids loop
    update public.profiles
      set coins = coalesce(coins, 0) + giveaway.amount_per_winner
      where id = winner_id;

    insert into public.club_giveaway_awards (giveaway_id, profile_id, amount, awarded_by)
    values (giveaway.id, winner_id, giveaway.amount_per_winner, caller);

    insert into public.giveaway_wallet_transactions (
      giveaway_id, profile_id, counterparty_id, amount, direction, kind
    ) values (
      giveaway.id, winner_id, giveaway.creator_id,
      giveaway.amount_per_winner, 'credit', 'payout'
    );
  end loop;

  update public.club_giveaways
  set status = 'awarded', awarded_at = now()
  where id = giveaway.id
  returning * into giveaway;

  return giveaway;
end;
$$;

revoke all on function public.create_club_giveaway(uuid, text, text, bigint, integer, timestamptz) from public;
revoke all on function public.enter_club_giveaway(uuid) from public;
revoke all on function public.award_club_giveaway(uuid, uuid[]) from public;
grant execute on function public.create_club_giveaway(uuid, text, text, bigint, integer, timestamptz) to authenticated;
grant execute on function public.enter_club_giveaway(uuid) to authenticated;
grant execute on function public.award_club_giveaway(uuid, uuid[]) to authenticated;

grant select on public.club_giveaways to authenticated;
grant select on public.club_giveaway_entries to authenticated;
grant select on public.club_giveaway_awards to authenticated;
grant select on public.giveaway_wallet_transactions to authenticated;
