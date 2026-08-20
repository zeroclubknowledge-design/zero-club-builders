-- Paid clubs: a fee to get in, enforced by the database.
--
-- Clubs already had a `price` column, set when the club was created and then
-- never looked at again: joining was a plain insert into club_members from the
-- browser. Anyone could join any public club for nothing, whatever the owner
-- had set, and nothing stopped a hand-written request either.
--
-- So the rule lives here, not in the app:
--
--   • the fee is charged from the joiner's Zero Club wallet, in the same
--     transaction that creates the membership — there is no window in which
--     somebody is a member without having paid;
--   • the row-level policy only lets a person add themselves to a club that is
--     actually free, so the paid path cannot be sidestepped by calling
--     PostgREST directly;
--   • two doors stay open, because the owner controls them: adding a member
--     directly by username (add_club_member), and switching the club to free
--     access without losing the fee that was set.

-- --------------------------------------------------------------- columns ---

alter table public.clubs
  add column if not exists subscription_fee numeric not null default 0
    check (subscription_fee >= 0);

-- Suspends charging without discarding the amount, so "free this month" does
-- not mean retyping the fee afterwards.
alter table public.clubs
  add column if not exists access_free boolean not null default false;

-- Carry over whatever the old creation form recorded.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clubs' and column_name = 'price'
  ) then
    update public.clubs
    set subscription_fee = coalesce(price, 0)
    where coalesce(subscription_fee, 0) = 0 and coalesce(price, 0) > 0;
  end if;
end $$;

create table if not exists public.club_subscriptions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  reference text unique,
  created_at timestamptz not null default now(),
  unique (club_id, profile_id)
);

alter table public.club_subscriptions enable row level security;

drop policy if exists club_subscriptions_select_own on public.club_subscriptions;
create policy club_subscriptions_select_own
  on public.club_subscriptions for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.clubs c where c.id = club_id and c.creator_id = auth.uid())
  );

-- ------------------------------------------------------------- functions ---

/* What it costs to walk in right now: the fee unless the owner has opened the
   doors. Everything else asks this rather than reading the columns, so the
   two flags can never be interpreted differently in two places. */
create or replace function public.club_entry_fee(p_club_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
           when coalesce(c.access_free, false) then 0
           else coalesce(c.subscription_fee, 0)
         end
  from public.clubs c
  where c.id = p_club_id
$$;

/* Separated out so the row-level policy below can ask "is this person running
   the club?" without querying club_members from a policy on club_members,
   which recurses. */
create or replace function public.is_club_admin(p_club_id uuid, p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clubs c
    where c.id = p_club_id and c.creator_id = coalesce(p_profile_id, auth.uid())
  ) or exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.profile_id = coalesce(p_profile_id, auth.uid())
      and m.role = 'Administrator'
  )
$$;

create or replace function public.set_club_access(
  p_club_id uuid,
  p_fee numeric,
  p_free boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_id uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if p_fee is null or p_fee < 0 then raise exception 'Enter a valid fee'; end if;
  if p_fee > 10000000 then raise exception 'That fee is too large'; end if;

  select creator_id into owner_id from public.clubs where id = p_club_id;
  if owner_id is null then raise exception 'Club not found'; end if;
  if owner_id <> caller then raise exception 'Only the club owner can change the fee'; end if;

  update public.clubs
  set subscription_fee = round(p_fee, 2),
      access_free = coalesce(p_free, false)
  where id = p_club_id;

  return jsonb_build_object('fee', round(p_fee, 2), 'access_free', coalesce(p_free, false));
end;
$$;

create or replace function public.join_club(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  club public.clubs;
  fee numeric;
  balance numeric;
  reference text;
  joiner_name text;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into club from public.clubs where id = p_club_id;
  if club.id is null then raise exception 'Club not found'; end if;

  if exists (select 1 from public.club_members where club_id = p_club_id and profile_id = caller) then
    return jsonb_build_object('status', 'already_member', 'paid', 0);
  end if;

  -- Private clubs are joined by request and approval, never by paying.
  if coalesce(club.is_private, false) then
    raise exception 'This club is private. Send a request to the admin instead.';
  end if;

  fee := public.club_entry_fee(p_club_id);

  if fee > 0 then
    select coalesce(coins, 0) into balance from public.profiles where id = caller;
    if balance < fee then
      return jsonb_build_object(
        'status', 'insufficient_funds',
        'fee', fee,
        'shortfall', fee - balance
      );
    end if;

    select coalesce(full_name, username) into joiner_name from public.profiles where id = caller;
    reference := 'club:' || p_club_id::text || ':' || caller::text;

    -- Debit first. If the credit or the membership insert fails, the whole
    -- function rolls back together and nobody is left out of pocket.
    perform public.wallet_apply(
      caller, 'debit', fee, 'club',
      'Subscription to ' || club.name,
      reference || ':out',
      jsonb_build_object('club_id', p_club_id)
    );

    perform public.wallet_apply(
      club.creator_id, 'credit', fee, 'club',
      coalesce(joiner_name, 'Someone') || ' subscribed to ' || club.name,
      reference || ':in',
      jsonb_build_object('club_id', p_club_id, 'member_id', caller)
    );

    insert into public.club_subscriptions (club_id, profile_id, amount, reference)
    values (p_club_id, caller, fee, reference)
    on conflict (club_id, profile_id) do nothing;

    insert into public.notifications (profile_id, actor_id, type, content)
    values (club.creator_id, caller, 'system',
            coalesce(joiner_name, 'Someone') || ' paid to join ' || club.name);
  end if;

  insert into public.club_members (club_id, profile_id, role)
  values (p_club_id, caller, 'Member')
  on conflict do nothing;

  return jsonb_build_object('status', 'joined', 'paid', fee);
end;
$$;

grant execute on function public.club_entry_fee(uuid) to authenticated, anon;
grant execute on function public.is_club_admin(uuid, uuid) to authenticated;
grant execute on function public.set_club_access(uuid, numeric, boolean) to authenticated;
grant execute on function public.join_club(uuid) to authenticated;

-- ------------------------------------------------------------- the fence ---
--
-- Without this the function above is decoration: the browser could still
-- insert a membership row directly. Every existing insert policy is replaced,
-- because a single permissive one left behind would reopen the hole.

alter table public.club_members enable row level security;

do $$
declare
  policy_name text;
  blanket text;
begin
  -- Only INSERT policies. A FOR ALL policy also grants select, update and
  -- delete, so dropping one here would take the member list away with it.
  for policy_name in
    select polname from pg_policy
    where polrelid = 'public.club_members'::regclass and polcmd = 'a'
  loop
    execute format('drop policy if exists %I on public.club_members', policy_name);
  end loop;

  select string_agg(polname, ', ') into blanket
  from pg_policy
  where polrelid = 'public.club_members'::regclass and polcmd = '*';

  if blanket is not null then
    raise notice 'Heads up: club_members still has FOR ALL policy(s) [%]. They permit inserts too, so the paywall is only as strong as their USING clause. Narrow them to select/update/delete if joins slip through.', blanket;
  end if;
end $$;

create policy club_members_join_free
  on public.club_members for insert to authenticated
  with check (
    -- Yourself, into a club that costs nothing today.
    (
      profile_id = auth.uid()
      and exists (
        select 1 from public.clubs c
        where c.id = club_id
          and coalesce(c.is_private, false) = false
      )
      and public.club_entry_fee(club_id) = 0
    )
    -- Or anybody, if you run the club. This is the owner's override: adding a
    -- member by username is exactly how a paid club lets someone in free.
    or public.is_club_admin(club_id)
  );

notify pgrst, 'reload schema';

do $$
begin
  raise notice 'Paid clubs are live. Existing members keep their access; only new joins are charged.';
end $$;
