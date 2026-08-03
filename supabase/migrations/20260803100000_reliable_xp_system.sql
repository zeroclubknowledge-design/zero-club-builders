-- Make XP a durable, non-transferable record of qualifying experience.
-- Every award is tied to a unique source so retries cannot duplicate XP.

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  source_key text not null,
  amount integer not null check (amount > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (profile_id, event_type, source_key)
);

create index if not exists xp_events_profile_created_idx
  on public.xp_events (profile_id, created_at desc);

alter table public.xp_events enable row level security;

drop policy if exists xp_events_select_own on public.xp_events;
create policy xp_events_select_own
  on public.xp_events for select to authenticated
  using (profile_id = auth.uid());

grant select on public.xp_events to authenticated;

create or replace function public.award_profile_xp(
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
    raise exception 'Invalid XP award';
  end if;

  insert into public.xp_events (profile_id, event_type, source_key, amount, metadata)
  values (p_profile_id, trim(p_event_type), trim(p_source_key), p_amount, coalesce(p_metadata, '{}'::jsonb))
  on conflict (profile_id, event_type, source_key) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then return false; end if;

  perform set_config('app.awarding_profile_xp', 'true', true);
  update public.profiles
  set xp = coalesce(xp, 0) + p_amount
  where id = p_profile_id;

  if not found then raise exception 'XP recipient not found'; end if;
  return true;
end;
$$;

revoke all on function public.award_profile_xp(uuid, text, text, integer, jsonb) from public;

create or replace function public.prevent_direct_xp_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.xp is distinct from old.xp
    and auth.uid() is not null
    and coalesce(current_setting('app.awarding_profile_xp', true), '') <> 'true'
  then
    raise exception 'XP is awarded automatically and cannot be edited directly';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_xp on public.profiles;
create trigger protect_profile_xp
  before update of xp on public.profiles
  for each row execute function public.prevent_direct_xp_changes();

create or replace function public.handle_post_xp_awards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_build_post, false) then
      perform public.award_profile_xp(
        new.author_id, 'ship_created', new.id::text, 50,
        jsonb_build_object('post_id', new.id)
      );
    end if;
    if coalesce(new.is_verified_build, false) then
      perform public.award_profile_xp(
        new.author_id, 'ship_verified', new.id::text, 50,
        jsonb_build_object('post_id', new.id, 'bootcamp_id', new.bootcamp_id)
      );
    end if;
  else
    if coalesce(new.is_build_post, false) and not coalesce(old.is_build_post, false) then
      perform public.award_profile_xp(
        new.author_id, 'ship_created', new.id::text, 50,
        jsonb_build_object('post_id', new.id)
      );
    end if;
    if coalesce(new.is_verified_build, false) and not coalesce(old.is_verified_build, false) then
      perform public.award_profile_xp(
        new.author_id, 'ship_verified', new.id::text, 50,
        jsonb_build_object('post_id', new.id, 'bootcamp_id', new.bootcamp_id)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_post_xp_awards on public.posts;
create trigger on_post_xp_awards
  after insert or update of is_build_post, is_verified_build on public.posts
  for each row execute function public.handle_post_xp_awards();

-- Verification is still authorized by the bootcamp tutor; the trigger above
-- performs the idempotent XP award when the verified state changes.
create or replace function public.verify_build_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_post_id uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select post.id into target_post_id
  from public.posts as post
  join public.bootcamps as bootcamp on bootcamp.id = post.bootcamp_id
  where post.id = post_id
    and coalesce(post.is_build_post, false)
    and not coalesce(post.is_verified_build, false)
    and bootcamp.creator_id = caller;

  if target_post_id is null then raise exception 'Not authorized to verify this post'; end if;
  update public.posts set is_verified_build = true where id = target_post_id;
end;
$$;

grant execute on function public.verify_build_post(uuid) to authenticated;

create or replace function public.handle_featured_club_join_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  club_name text;
begin
  if coalesce(new.status, 'active') <> 'active' then return new; end if;
  if tg_op = 'UPDATE' then
    if coalesce(old.status, 'active') = 'active' then return new; end if;
  end if;

  select name into club_name from public.clubs where id = new.club_id;
  if club_name = 'Zero K Bootcamp' then
    perform public.award_profile_xp(
      new.profile_id, 'featured_club_join', new.club_id::text, 100,
      jsonb_build_object('club_id', new.club_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_featured_club_join_xp on public.club_members;
create trigger on_featured_club_join_xp
  after insert or update of status on public.club_members
  for each row execute function public.handle_featured_club_join_xp();

create or replace function public.handle_featured_club_message_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  club_name text;
begin
  select name into club_name from public.clubs where id = new.club_id;
  if club_name = 'Zero K Bootcamp' then
    perform public.award_profile_xp(
      new.profile_id, 'featured_club_first_message', new.club_id::text, 100,
      jsonb_build_object('club_id', new.club_id, 'message_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_featured_club_message_xp on public.club_messages;
create trigger on_featured_club_message_xp
  after insert on public.club_messages
  for each row execute function public.handle_featured_club_message_xp();

create or replace function public.claim_daily_xp_quest(p_quest_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  lagos_today date := (clock_timestamp() at time zone 'Africa/Lagos')::date;
  reward integer;
  completed boolean := false;
  awarded boolean;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  reward := case p_quest_id
    when 'quest_login' then 100
    when 'quest_post' then 100
    when 'quest_comment' then 50
    when 'quest_quote' then 50
    when 'quest_club' then 200
    else null
  end;
  if reward is null then raise exception 'Unknown XP quest'; end if;

  completed := case p_quest_id
    when 'quest_login' then true
    when 'quest_post' then exists (
      select 1 from public.posts
      where author_id = caller and (created_at at time zone 'Africa/Lagos')::date = lagos_today
    )
    when 'quest_comment' then exists (
      select 1 from public.comments
      where profile_id = caller and (created_at at time zone 'Africa/Lagos')::date = lagos_today
    )
    when 'quest_quote' then exists (
      select 1 from public.posts
      where author_id = caller and quoted_post_id is not null
        and (created_at at time zone 'Africa/Lagos')::date = lagos_today
    )
    when 'quest_club' then (
      select count(*) >= 20
      from public.club_members as member
      join public.clubs as club on club.id = member.club_id
      where club.creator_id = caller and coalesce(member.status, 'active') = 'active'
    )
    else false
  end;

  if not completed then raise exception 'Complete this quest before claiming XP'; end if;

  awarded := public.award_profile_xp(
    caller, 'daily_quest', p_quest_id || ':' || lagos_today::text, reward,
    jsonb_build_object('quest_id', p_quest_id, 'date', lagos_today)
  );
  if not awarded then raise exception 'Quest already claimed today'; end if;

  return jsonb_build_object('success', true, 'reward', reward, 'xp_awarded', true);
end;
$$;

revoke all on function public.claim_daily_xp_quest(text) from public;
grant execute on function public.claim_daily_xp_quest(text) to authenticated;

-- Shipping has always displayed +50 XP but older clients never wrote it.
-- Honour that promise once for every existing Ship.
do $$
declare
  ship record;
begin
  for ship in
    select id, author_id from public.posts where coalesce(is_build_post, false)
  loop
    perform public.award_profile_xp(
      ship.author_id, 'ship_created', ship.id::text, 50,
      jsonb_build_object('post_id', ship.id, 'backfilled', true)
    );
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

notify pgrst, 'reload schema';
