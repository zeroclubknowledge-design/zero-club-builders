-- Admin-managed XP quests. Opportunities/gigs remain a separate marketplace.

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  type text not null default 'daily',
  reward_xp integer not null default 0,
  criteria_type text not null,
  criteria_count integer not null default 1,
  icon_name text,
  created_at timestamptz not null default now()
);

alter table public.quests add column if not exists slug text;
alter table public.quests add column if not exists status text not null default 'active';
alter table public.quests add column if not exists sort_order integer not null default 0;
alter table public.quests add column if not exists updated_at timestamptz not null default now();
alter table public.quests add column if not exists created_by uuid references public.profiles(id) on delete set null;

create table if not exists public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  completed_at timestamptz not null default now(),
  claimed_at timestamptz,
  unique (profile_id, quest_id)
);

update public.quests set reward_xp = 1 where reward_xp is null or reward_xp < 1;
update public.quests set criteria_count = 1 where criteria_count is null or criteria_count < 1;

update public.quests
set slug = coalesce(
  nullif(trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')), ''),
  'quest'
) || '-' || left(id::text, 8)
where slug is null or btrim(slug) = '';

alter table public.quests alter column slug set not null;

create unique index if not exists quests_slug_unique_idx on public.quests (slug);
create index if not exists quests_status_sort_idx on public.quests (status, sort_order, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quests'::regclass and conname = 'quests_status_check'
  ) then
    alter table public.quests
      add constraint quests_status_check check (status in ('draft', 'active', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quests'::regclass and conname = 'quests_reward_xp_check'
  ) then
    alter table public.quests
      add constraint quests_reward_xp_check check (reward_xp between 1 and 10000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quests'::regclass and conname = 'quests_criteria_count_check'
  ) then
    alter table public.quests
      add constraint quests_criteria_count_check check (criteria_count between 1 and 10000);
  end if;
end $$;

insert into public.quests (
  slug, title, description, type, reward_xp, criteria_type, criteria_count, icon_name, status, sort_order
)
values
  ('quest-login', 'Daily check-in', 'Open Zero Club and continue your building streak.', 'daily', 100, 'login', 1, 'Rocket', 'active', 10),
  ('quest-post', 'Share a build update', 'Post something useful about what you are learning or building today.', 'daily', 100, 'post_today', 1, 'Share2', 'active', 20),
  ('quest-comment', 'Support another builder', 'Leave a thoughtful comment on another builder''s post.', 'daily', 50, 'comment', 1, 'Users', 'active', 30),
  ('quest-quote', 'Add context to a post', 'Quote a post and add your own useful perspective.', 'daily', 50, 'quote', 1, 'Star', 'active', 40),
  ('quest-club', 'Grow a focused club', 'Create a club and build an active circle of at least 20 members.', 'milestone', 200, 'club', 20, 'Trophy', 'active', 50)
on conflict (slug) do nothing;

alter table public.quests enable row level security;
alter table public.quest_completions enable row level security;

drop policy if exists quests_select_public on public.quests;
drop policy if exists quests_read_active_or_admin on public.quests;
create policy quests_read_active_or_admin
  on public.quests for select to authenticated
  using (status = 'active' or public.is_zero_club_admin());

drop policy if exists quest_completions_select_own on public.quest_completions;
drop policy if exists quest_completions_insert_own on public.quest_completions;
create policy quest_completions_select_own
  on public.quest_completions for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());

create or replace function public.get_admin_xp_quests()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(quest_row) order by quest_row.sort_order, quest_row.created_at desc)
    from (
      select id, slug, title, description, type, reward_xp, criteria_type,
             criteria_count, icon_name, status, sort_order, created_at, updated_at
      from public.quests
    ) as quest_row
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_create_xp_quest(
  new_title text,
  new_description text,
  new_type text,
  new_reward_xp integer,
  new_criteria_type text,
  new_criteria_count integer,
  new_icon_name text default 'Trophy',
  new_status text default 'draft',
  new_sort_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  quest_id uuid;
  quest_slug text;
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if length(btrim(coalesce(new_title, ''))) < 3 then raise exception 'Quest title is too short'; end if;
  if length(btrim(coalesce(new_description, ''))) < 10 then raise exception 'Quest description is too short'; end if;
  if new_type not in ('daily', 'one-time', 'milestone') then raise exception 'Invalid quest frequency'; end if;
  if new_status not in ('draft', 'active', 'archived') then raise exception 'Invalid quest status'; end if;
  if new_criteria_type not in ('login', 'post_today', 'post', 'comment', 'quote', 'club', 'follow', 'profile', 'enrollment', 'ship') then
    raise exception 'Invalid quest requirement';
  end if;
  if new_reward_xp not between 1 and 10000 then raise exception 'XP reward must be between 1 and 10,000'; end if;
  if new_criteria_count not between 1 and 10000 then raise exception 'Target must be between 1 and 10,000'; end if;

  quest_id := gen_random_uuid();
  quest_slug := coalesce(
    nullif(trim(both '-' from regexp_replace(lower(new_title), '[^a-z0-9]+', '-', 'g')), ''),
    'quest'
  ) || '-' || left(quest_id::text, 8);

  insert into public.quests (
    id, slug, title, description, type, reward_xp, criteria_type, criteria_count,
    icon_name, status, sort_order, created_by
  ) values (
    quest_id, quest_slug, btrim(new_title), btrim(new_description), new_type,
    new_reward_xp, new_criteria_type, new_criteria_count,
    coalesce(nullif(btrim(new_icon_name), ''), 'Trophy'), new_status,
    coalesce(new_sort_order, 0), auth.uid()
  );

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'create_quest', 'quest', quest_id, jsonb_build_object('title', new_title, 'status', new_status));

  return quest_id;
end;
$$;

create or replace function public.admin_update_xp_quest(
  target_quest_id uuid,
  new_title text,
  new_description text,
  new_type text,
  new_reward_xp integer,
  new_criteria_type text,
  new_criteria_count integer,
  new_icon_name text,
  new_status text,
  new_sort_order integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if length(btrim(coalesce(new_title, ''))) < 3 then raise exception 'Quest title is too short'; end if;
  if length(btrim(coalesce(new_description, ''))) < 10 then raise exception 'Quest description is too short'; end if;
  if new_type not in ('daily', 'one-time', 'milestone') then raise exception 'Invalid quest frequency'; end if;
  if new_status not in ('draft', 'active', 'archived') then raise exception 'Invalid quest status'; end if;
  if new_criteria_type not in ('login', 'post_today', 'post', 'comment', 'quote', 'club', 'follow', 'profile', 'enrollment', 'ship') then
    raise exception 'Invalid quest requirement';
  end if;
  if new_reward_xp not between 1 and 10000 then raise exception 'XP reward must be between 1 and 10,000'; end if;
  if new_criteria_count not between 1 and 10000 then raise exception 'Target must be between 1 and 10,000'; end if;

  update public.quests
  set title = btrim(new_title),
      description = btrim(new_description),
      type = new_type,
      reward_xp = new_reward_xp,
      criteria_type = new_criteria_type,
      criteria_count = new_criteria_count,
      icon_name = coalesce(nullif(btrim(new_icon_name), ''), 'Trophy'),
      status = new_status,
      sort_order = coalesce(new_sort_order, 0),
      updated_at = now()
  where id = target_quest_id;

  if not found then raise exception 'Quest not found'; end if;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'update_quest', 'quest', target_quest_id, jsonb_build_object('title', new_title, 'status', new_status));
end;
$$;

create or replace function public.admin_delete_xp_quest(target_quest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_title text;
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;

  select title into deleted_title from public.quests where id = target_quest_id;
  if deleted_title is null then raise exception 'Quest not found'; end if;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'delete_quest', 'quest', target_quest_id, jsonb_build_object('title', deleted_title));

  delete from public.quests where id = target_quest_id;
end;
$$;

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

  if not completed then raise exception 'Complete this quest before claiming XP'; end if;

  source_key := case when quest.type = 'daily'
    then quest.slug || ':' || lagos_today::text
    else quest.slug
  end;

  awarded := public.award_profile_xp(
    caller, 'daily_quest', source_key, quest.reward_xp,
    jsonb_build_object('quest_id', quest.id, 'quest_slug', quest.slug, 'frequency', quest.type, 'date', lagos_today)
  );
  if not awarded then raise exception 'Quest reward already claimed'; end if;

  insert into public.quest_completions (profile_id, quest_id, completed_at, claimed_at)
  values (caller, quest.id, now(), now())
  on conflict (profile_id, quest_id)
  do update set completed_at = excluded.completed_at, claimed_at = excluded.claimed_at;

  return jsonb_build_object('success', true, 'reward', quest.reward_xp, 'xp_awarded', true);
end;
$$;

revoke all on function public.get_admin_xp_quests() from public;
revoke all on function public.admin_create_xp_quest(text, text, text, integer, text, integer, text, text, integer) from public;
revoke all on function public.admin_update_xp_quest(uuid, text, text, text, integer, text, integer, text, text, integer) from public;
revoke all on function public.admin_delete_xp_quest(uuid) from public;
revoke all on function public.claim_daily_xp_quest(text) from public;

grant execute on function public.get_admin_xp_quests() to authenticated;
grant execute on function public.admin_create_xp_quest(text, text, text, integer, text, integer, text, text, integer) to authenticated;
grant execute on function public.admin_update_xp_quest(uuid, text, text, text, integer, text, integer, text, text, integer) to authenticated;
grant execute on function public.admin_delete_xp_quest(uuid) to authenticated;
grant execute on function public.claim_daily_xp_quest(text) to authenticated;

grant select on public.quests to authenticated;
grant select on public.quest_completions to authenticated;
