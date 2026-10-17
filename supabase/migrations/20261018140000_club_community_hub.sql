-- Clubs as communities, with cohorts inside them.
--
-- Until now a "cohort" was not a thing of its own: it was a separate row in
-- `clubs` with club_type = 'bootcamp_cohort', a bootcamp_id pointing at the
-- product, and no relation to any community. The Clubs tab had to filter those
-- rows out of My Clubs and Discover and put them in a separate "Boot clubs"
-- tab, because a cohort was not a joinable community and had nowhere else to
-- live. That is exactly backwards: a cohort is a class inside a community.
--
-- So:
--
--   • a club is a community (club_type = 'permanent');
--   • a cohort is a child row in the same table, with parent_club_id set and
--     club_type = 'cohort'. It keeps its own `id`, so club chat, quizzes, the
--     assignment board and messages.club_id keep working untouched — opening a
--     cohort is still opening a club, it just has a community above it;
--   • bootcamp cohorts stay exactly as they were (bootcamp_id, no parent) and
--     gain a parent only when someone puts them in a community.
--
-- Keeping cohorts in `clubs` rather than a new `club_cohorts` table is a
-- deliberate trade: a little denormalisation, no change to the ~6k-line chat
-- route, and one membership table for both levels.
--
-- The hub (src/features/community/CommunityHub.tsx) reads everything through
-- club_hub() and writes through the functions at the bottom of this file.

-- ---------------------------------------------------------------- columns ---

alter table public.clubs
  add column if not exists parent_club_id uuid references public.clubs(id) on delete cascade;

alter table public.clubs
  add column if not exists cohort_skill text,
  add column if not exists cohort_join_mode text not null default 'open'
    check (cohort_join_mode in ('open', 'approval', 'invite', 'bootcamp'));

alter table public.club_members
  add column if not exists request_message text;

alter table public.clubs drop constraint if exists clubs_club_type_check;
alter table public.clubs add constraint clubs_club_type_check
  check (club_type in ('permanent', 'bootcamp_cohort', 'cohort'));

create index if not exists clubs_parent_idx on public.clubs (parent_club_id) where parent_club_id is not null;

-- --------------------------------------------------- clear old definitions ---

/* `create or replace function` cannot change a function's return type, and it
   cannot replace a function whose argument list differs — it only adds an
   overload. The live project already has an earlier draft of these functions
   (the same session that wrote the hub UI), so running this file would stop at
   the first one with "cannot change return type of existing function", and any
   surviving overload would make PostgREST refuse every call to that name with
   an ambiguous-function error.
--
   Drop every version of these by name before defining them again. Only these
   eight: the helpers below keep their signatures, and dropping one of those
   would take its policies and triggers with it. */
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'club_hub',
        'create_club_cohort',
        'update_club_cohort',
        'join_club_cohort',
        'add_cohort_member',
        'decide_club_join_request',
        'set_community_staff',
        'remove_club_hub_item'
      )
    order by p.proname
  loop
    execute format('drop function %s', f.signature);
  end loop;
end $$;

/* A cohort is one level deep: a cohort cannot own cohorts, and a cohort's
   parent must be a community. */
create or replace function public.clubs_guard_cohort_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare parent_type text;
begin
  if new.parent_club_id is null then
    return new;
  end if;
  if new.parent_club_id = new.id then
    raise exception 'A club cannot be its own cohort';
  end if;

  select club_type into parent_type from public.clubs where id = new.parent_club_id;
  if parent_type is null then
    raise exception 'That community no longer exists';
  end if;
  if parent_type = 'cohort' then
    raise exception 'A cohort cannot contain other cohorts';
  end if;

  new.club_type := 'cohort';
  return new;
end $$;

drop trigger if exists clubs_guard_cohort_hierarchy on public.clubs;
create trigger clubs_guard_cohort_hierarchy
  before insert or update of parent_club_id on public.clubs
  for each row execute function public.clubs_guard_cohort_hierarchy();

-- -------------------------------------------------------- membership rules ---

/* Members of a community are members of the community, not of its cohorts.
   Someone can be in two cohorts and one community, or in a cohort alone.
   Defined before the policies below use them. */

create or replace function public.is_club_staff(p_club_id uuid, p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.profile_id = coalesce(p_profile_id, auth.uid())
      and m.status = 'active'
      and m.role in ('Owner', 'Admin', 'Administrator')
  );
$$;

create or replace function public.is_community_member(p_club_id uuid, p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members m
    join public.clubs c on c.id = m.club_id
    where (c.id = p_club_id or c.parent_club_id = p_club_id)
      and m.profile_id = coalesce(p_profile_id, auth.uid())
      and m.status = 'active'
  );
$$;

-- --------------------------------------------------------- announcements ---

create table if not exists public.club_announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_announcements_club_idx
  on public.club_announcements (club_id, pinned desc, created_at desc);

alter table public.club_announcements enable row level security;

drop policy if exists club_announcements_read on public.club_announcements;
create policy club_announcements_read on public.club_announcements
  for select to authenticated
  using (public.is_community_member(club_id) or exists (
    select 1 from public.clubs c where c.id = club_announcements.club_id and c.creator_id = auth.uid()
  ));

drop policy if exists club_announcements_write on public.club_announcements;
create policy club_announcements_write on public.club_announcements
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_club_admin(club_id));

drop policy if exists club_announcements_update on public.club_announcements;
create policy club_announcements_update on public.club_announcements
  for update to authenticated
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

drop policy if exists club_announcements_delete on public.club_announcements;
create policy club_announcements_delete on public.club_announcements
  for delete to authenticated
  using (public.is_club_admin(club_id));

/* Announcing reaches every member of the community and of its cohorts, once
   each, including people who are only in one cohort. */
create or replace function public.notify_club_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare community uuid; label text;
begin
  select coalesce(c.parent_club_id, c.id), c.name into community, label
  from public.clubs c where c.id = new.club_id;

  insert into public.notifications (profile_id, recipient_id, actor_id, type, entity_id, content, link)
  select distinct m.profile_id, m.profile_id, new.author_id, 'system', new.club_id,
         'New announcement in ' || label,
         '/app/clubs/' || community
  from public.club_members m
  where m.club_id in (select id from public.clubs where id = community or parent_club_id = community)
    and m.status = 'active'
    and m.profile_id <> new.author_id;

  return null;
end $$;

drop trigger if exists club_announcements_notify on public.club_announcements;
create trigger club_announcements_notify after insert on public.club_announcements
  for each row execute function public.notify_club_announcement();

-- -------------------------------------------------------------- meetings ---

create table if not exists public.club_meetings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  cohort_id uuid references public.clubs(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  meeting_url text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'ended')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint club_meetings_window check (ends_at is null or ends_at > starts_at)
);

create index if not exists club_meetings_club_time_idx on public.club_meetings (club_id, starts_at desc);

alter table public.club_meetings enable row level security;

drop policy if exists club_meetings_read on public.club_meetings;
create policy club_meetings_read on public.club_meetings
  for select to authenticated
  using (public.is_community_member(club_id) or exists (
    select 1 from public.clubs c where c.id = club_meetings.club_id and c.creator_id = auth.uid()
  ));

drop policy if exists club_meetings_write on public.club_meetings;
create policy club_meetings_write on public.club_meetings
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_club_admin(club_id));

drop policy if exists club_meetings_update on public.club_meetings;
create policy club_meetings_update on public.club_meetings
  for update to authenticated
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

drop policy if exists club_meetings_delete on public.club_meetings;
create policy club_meetings_delete on public.club_meetings
  for delete to authenticated
  using (public.is_club_admin(club_id));

-- ------------------------------------------------------------- club_hub() ---

/* Everything the hub screen draws, in one call.
   Pass a community id to get the whole workspace, or a cohort id to get the
   same workspace with that cohort flagged (redirect_cohort) so the caller can
   be sent to the cohort's chat rooms instead. */
create or replace function public.club_hub(p_club uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  asked public.clubs;
  community public.clubs;
  mine public.club_members;
  is_mgr boolean := false;
  result jsonb;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into asked from public.clubs where id = p_club;
  if asked.id is null then raise exception 'Club not found'; end if;

  if asked.parent_club_id is not null then
    select * into community from public.clubs where id = asked.parent_club_id;
  else
    community := asked;
  end if;

  select * into mine from public.club_members
  where club_id = community.id and profile_id = caller and status = 'active';

  is_mgr := community.creator_id = caller or public.is_club_staff(community.id, caller);

  /* A private community is invisible to people who are not in it — except
     that a public preview of it is still wanted, so we return the shell with
     `me.member = false` and let the screen show the join card. Only a club
     that does not exist is an error. */

  result := jsonb_build_object(
    'redirect_cohort', asked.parent_club_id is not null,
    'parent_club_id', community.parent_club_id,
    'club', jsonb_build_object(
      'id', community.id,
      'name', community.name,
      'description', community.description,
      'category', community.category,
      'banner_url', community.banner_url,
      'logo_url', community.logo_url,
      'rules', community.rules,
      'is_private', community.is_private,
      'requires_approval', community.requires_approval,
      'subscription_fee', community.subscription_fee,
      'access_free', community.access_free,
      'creator_id', community.creator_id,
      'entry_fee', public.club_entry_fee(community.id)
    ),
    'owner', (
      select jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url)
      from public.profiles p where p.id = community.creator_id
    ),
    'me', jsonb_build_object(
      'member', mine.profile_id is not null,
      'admin', is_mgr,
      'role', mine.role,
      'is_owner', community.creator_id = caller,
      'requested', exists (
        select 1 from public.club_members r
        where r.club_id = community.id and r.profile_id = caller and r.status = 'pending'
      )
    ),
    'counts', jsonb_build_object(
      'members', (
        select count(*) from public.club_members m
        where m.club_id in (select id from public.clubs where id = community.id or parent_club_id = community.id)
          and m.status = 'active'
      ),
      'cohorts', (select count(*) from public.clubs c where c.parent_club_id = community.id),
      'staff', (
        select count(*) from public.club_members m
        where m.club_id = community.id and m.status = 'active'
          and m.role in ('Owner', 'Admin', 'Administrator')
      )
    ),
    'cohorts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'skill', c.cohort_skill,
        'description', c.description,
        'banner_url', c.banner_url,
        'logo_url', c.logo_url,
        'join_mode', c.cohort_join_mode,
        'bootcamp_id', c.bootcamp_id,
        'bootcamp_title', (select b.title from public.bootcamps b where b.id = c.bootcamp_id),
        'bootcamp_price', (select public.bootcamp_current_price(b.id) from public.bootcamps b where b.id = c.bootcamp_id),
        'status', c.status,
        'members', (select count(*) from public.club_members m where m.club_id = c.id and m.status = 'active'),
        'my_status', (
          select case when m.status = 'active' then 'member' when m.status = 'pending' then 'pending' end
          from public.club_members m where m.club_id = c.id and m.profile_id = caller
        ),
        'created_at', c.created_at
      ) order by c.created_at desc)
      from public.clubs c
      where c.parent_club_id = community.id
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
        'headline', null,
        'is_owner', m.role = 'Owner' or p.id = community.creator_id,
        'role', m.role
      ) order by (m.role = 'Owner' or p.id = community.creator_id) desc, m.joined_at)
      from public.club_members m
      join public.profiles p on p.id = m.profile_id
      where m.club_id = community.id and m.status = 'active'
        and (m.role in ('Owner', 'Admin', 'Administrator') or p.id = community.creator_id)
    ), '[]'::jsonb),
    'meetings', case when mine.profile_id is null and not is_mgr then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', mt.id, 'title', mt.title, 'description', mt.description,
        'starts_at', mt.starts_at, 'ends_at', mt.ends_at, 'meeting_url', mt.meeting_url,
        'status', mt.status, 'cohort_id', mt.cohort_id,
        'cohort_name', (select c.name from public.clubs c where c.id = mt.cohort_id)
      ) order by mt.starts_at desc)
      from public.club_meetings mt
      where mt.club_id = community.id
        and (is_mgr or mt.cohort_id is null or public.is_club_member(mt.cohort_id, caller))
    ), '[]'::jsonb) end,
    'announcements', case when mine.profile_id is null and not is_mgr then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'body', a.body, 'pinned', a.pinned,
        'created_at', a.created_at, 'edited_at', a.updated_at,
        'author', jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url)
      ) order by a.pinned desc, a.created_at desc)
      from public.club_announcements a
      join public.profiles p on p.id = a.author_id
      where a.club_id = community.id
    ), '[]'::jsonb) end,
    'requests', case when is_mgr then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.club_id::text || ':' || r.profile_id::text,
        'cohort_id', r.club_id, 'cohort_name', c.name,
        'message', r.request_message, 'created_at', r.joined_at,
        'profile', jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url)
      ) order by r.joined_at desc)
      from public.club_members r
      join public.clubs c on c.id = r.club_id
      join public.profiles p on p.id = r.profile_id
      where c.parent_club_id = community.id and r.status = 'pending'
    ), '[]'::jsonb) else '[]'::jsonb end
  );

  return result;
end $$;

grant execute on function public.club_hub(uuid) to authenticated;

-- ------------------------------------------------------- create cohorts ---

create or replace function public.create_club_cohort(
  p_parent uuid,
  p_name text,
  p_skill text default null,
  p_description text default null,
  p_join_mode text default 'open',
  p_bootcamp uuid default null,
  p_banner text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  community public.clubs;
  mode text := coalesce(p_join_mode, 'open');
  made uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Give the cohort a name'; end if;
  if mode not in ('open', 'approval', 'invite', 'bootcamp') then raise exception 'Unknown join mode'; end if;

  select * into community from public.clubs where id = p_parent;
  if community.id is null then raise exception 'Club not found'; end if;
  if community.parent_club_id is not null then raise exception 'Cohorts live inside a community, not inside another cohort'; end if;
  if not public.is_club_admin(community.id) then raise exception 'Only the club team can create cohorts'; end if;

  if mode = 'bootcamp' then
    if p_bootcamp is null then raise exception 'Pick the bootcamp this cohort follows'; end if;
    if not public.can_manage_bootcamp(p_bootcamp) then raise exception 'You do not run that bootcamp'; end if;
  end if;

  insert into public.clubs (
    name, description, category, banner_url, creator_id,
    parent_club_id, club_type, cohort_skill, cohort_join_mode, bootcamp_id,
    is_private, requires_approval, subscription_fee, access_free, price
  ) values (
    left(trim(p_name), 80),
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(nullif(community.category, ''), 'Cohort'),
    p_banner,
    caller,
    community.id,
    'cohort',
    nullif(trim(coalesce(p_skill, '')), ''),
    case when mode = 'bootcamp' then 'open' else mode end,
    case when mode = 'bootcamp' then p_bootcamp else null end,
    coalesce(community.is_private, false),
    false,
    0, true, 0
  )
  returning id into made;

  -- The creator runs the cohort they just made.
  insert into public.club_members (club_id, profile_id, role, status)
  values (made, caller, 'Owner', 'active')
  on conflict (club_id, profile_id) do update set status = 'active', role = 'Owner';

  return made;
end $$;

grant execute on function public.create_club_cohort(uuid, text, text, text, text, uuid, text) to authenticated;

create or replace function public.update_club_cohort(
  p_cohort uuid,
  p_name text,
  p_skill text default null,
  p_description text default null,
  p_join_mode text default 'open'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  cohort public.clubs;
  mode text := coalesce(p_join_mode, 'open');
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Give the cohort a name'; end if;
  if mode not in ('open', 'approval', 'invite') then raise exception 'Unknown join mode'; end if;

  select * into cohort from public.clubs where id = p_cohort;
  if cohort.id is null or cohort.parent_club_id is null then raise exception 'Cohort not found'; end if;
  if not public.is_club_admin(cohort.parent_club_id) then raise exception 'Only the club team can edit cohorts'; end if;

  update public.clubs set
    name = left(trim(p_name), 80),
    cohort_skill = nullif(trim(coalesce(p_skill, '')), ''),
    description = nullif(trim(coalesce(p_description, '')), ''),
    /* A bootcamp-linked cohort is filled by enrolment, so its own join mode
       is left as open and is irrelevant. */
    cohort_join_mode = case when cohort.bootcamp_id is not null then cohort.cohort_join_mode else mode end,
    updated_at = now()
  where id = p_cohort;

  return jsonb_build_object('status', 'updated');
end $$;

grant execute on function public.update_club_cohort(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------- join a cohort ---

/* Returns the same status vocabulary the hub already switches on:
   joined | requested | needs_bootcamp | join_community | invite_only |
   already_member. */
create or replace function public.join_club_cohort(p_cohort uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  cohort public.clubs;
  community public.clubs;
  already public.club_members;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into cohort from public.clubs where id = p_cohort;
  if cohort.id is null or cohort.parent_club_id is null then raise exception 'Cohort not found'; end if;

  select * into community from public.clubs where id = cohort.parent_club_id;

  select * into already from public.club_members where club_id = p_cohort and profile_id = caller;
  if already.status = 'active' then
    return jsonb_build_object('status', 'already_member');
  end if;
  if already.status = 'pending' then
    return jsonb_build_object('status', 'requested');
  end if;

  /* You join the community before its classes. Every path below assumes an
     active membership row on the community itself — that row is what puts you
     in the hub's member count, its announcements and its meetings. Joining a
     class alone would leave you inside a cohort that the community does not
     think you belong to. */
  if not exists (
    select 1 from public.club_members m
    where m.club_id = community.id and m.profile_id = caller and m.status = 'active'
  ) then
    return jsonb_build_object('status', 'join_community', 'fee', public.club_entry_fee(community.id));
  end if;

  if cohort.bootcamp_id is not null then
    if not public.is_bootcamp_learner(cohort.bootcamp_id) then
      return jsonb_build_object('status', 'needs_bootcamp', 'bootcamp_id', cohort.bootcamp_id);
    end if;
  elsif cohort.cohort_join_mode = 'invite' then
    return jsonb_build_object('status', 'invite_only');
  elsif cohort.cohort_join_mode = 'approval' then
    if already.profile_id is null then
      insert into public.club_members (club_id, profile_id, role, status)
      values (p_cohort, caller, 'Member', 'pending');
    else
      update public.club_members set status = 'pending', joined_at = now()
      where club_id = p_cohort and profile_id = caller;
    end if;

    insert into public.notifications (profile_id, recipient_id, actor_id, type, entity_id, content, link)
    values (community.creator_id, community.creator_id, caller, 'system', p_cohort,
            coalesce((select coalesce(full_name, username) from public.profiles where id = caller), 'Someone')
              || ' asked to join ' || cohort.name,
            '/app/clubs/' || community.id);

    return jsonb_build_object('status', 'requested');
  end if;

  if already.profile_id is null then
    insert into public.club_members (club_id, profile_id, role, status)
    values (p_cohort, caller, 'Member', 'active');
  else
    update public.club_members set status = 'active', role = 'Member'
    where club_id = p_cohort and profile_id = caller;
  end if;

  return jsonb_build_object('status', 'joined', 'cohort_id', p_cohort);
end $$;

grant execute on function public.join_club_cohort(uuid) to authenticated;

-- ------------------------------------------------ add people, decide requests ---

create or replace function public.add_cohort_member(p_cohort uuid, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  cohort public.clubs;
  target uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into cohort from public.clubs where id = p_cohort;
  if cohort.id is null or cohort.parent_club_id is null then raise exception 'Cohort not found'; end if;
  if not public.is_club_admin(cohort.parent_club_id) then raise exception 'Only the club team can add people'; end if;

  select id into target from public.profiles where lower(username) = lower(ltrim(trim(p_username), '@'));
  if target is null then raise exception 'No member with that username'; end if;

  if exists (select 1 from public.club_members where club_id = p_cohort and profile_id = target and status = 'active') then
    return jsonb_build_object('added', false);
  end if;

  insert into public.club_members (club_id, profile_id, role, status)
  values (p_cohort, target, 'Member', 'active')
  on conflict (club_id, profile_id) do update set status = 'active';

  /* Being added to a class puts you in the community too, silently and free —
     the team has already said yes. An existing active row is left alone so a
     moderator or study rep does not lose their role. */
  if not exists (
    select 1 from public.club_members
    where club_id = cohort.parent_club_id and profile_id = target and status = 'active'
  ) then
    insert into public.club_members (club_id, profile_id, role, status)
    values (cohort.parent_club_id, target, 'Member', 'active')
    on conflict (club_id, profile_id) do update set status = 'active', role = 'Member';
  end if;

  insert into public.notifications (profile_id, recipient_id, actor_id, type, entity_id, content, link)
  values (target, target, caller, 'system', p_cohort,
          'You were added to ' || cohort.name,
          '/app/clubs/chat?clubId=' || p_cohort);

  return jsonb_build_object('added', true);
end $$;

grant execute on function public.add_cohort_member(uuid, text) to authenticated;

/* The hub sends "<cohort id>:<profile id>" as the request id, because a join
   request is just a pending membership row and has no id of its own. */
create or replace function public.decide_club_join_request(p_request text, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  parts text[] := string_to_array(coalesce(p_request, ''), ':');
  cohort public.clubs;
  target uuid;
  label text;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if array_length(parts, 1) <> 2 then raise exception 'Unknown request'; end if;

  select * into cohort from public.clubs where id = parts[1]::uuid;
  target := parts[2]::uuid;
  if cohort.id is null or cohort.parent_club_id is null then raise exception 'Cohort not found'; end if;
  if not public.is_club_admin(cohort.parent_club_id) then raise exception 'Only the club team can decide'; end if;

  if p_approve then
    update public.club_members set status = 'active'
    where club_id = cohort.id and profile_id = target and status = 'pending';
    if not found then raise exception 'That request was already handled'; end if;

    insert into public.club_members (club_id, profile_id, role, status)
    values (cohort.parent_club_id, target, 'Member', 'active')
    on conflict (club_id, profile_id) do nothing;

    label := 'You are in ' || cohort.name;
  else
    delete from public.club_members
    where club_id = cohort.id and profile_id = target and status = 'pending';
    label := 'Your request to join ' || cohort.name || ' was declined';
  end if;

  insert into public.notifications (profile_id, recipient_id, actor_id, type, entity_id, content, link)
  values (target, target, caller, 'system', cohort.id, label,
          case when p_approve then '/app/clubs/chat?clubId=' || cohort.id else '/app/clubs/' || cohort.parent_club_id end);

  return jsonb_build_object('approved', p_approve);
end $$;

grant execute on function public.decide_club_join_request(text, boolean) to authenticated;

-- ------------------------------------------------------------- teaching staff ---

create or replace function public.set_community_staff(p_club uuid, p_username text, p_staff boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  community public.clubs;
  target uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into community from public.clubs where id = p_club;
  if community.id is null or community.parent_club_id is not null then raise exception 'Club not found'; end if;
  if community.creator_id <> caller then raise exception 'Only the owner can change the staff'; end if;

  select id into target from public.profiles where lower(username) = lower(ltrim(trim(coalesce(p_username, '')), '@'));
  if target is null then raise exception 'No member with that username'; end if;
  if target = community.creator_id then raise exception 'The owner is always staff'; end if;

  if p_staff then
    insert into public.club_members (club_id, profile_id, role, status)
    values (community.id, target, 'Administrator', 'active')
    on conflict (club_id, profile_id) do update set role = 'Administrator', status = 'active';

    /* Staff run every cohort, so they are put in all of them — this is what
       lets them open a cohort's rooms without joining it by hand. */
    insert into public.club_members (club_id, profile_id, role, status)
    select c.id, target, 'Administrator', 'active'
    from public.clubs c where c.parent_club_id = community.id
    on conflict (club_id, profile_id) do update set role = 'Administrator', status = 'active';
  else
    update public.club_members set role = 'Member'
    where club_id = community.id and profile_id = target;
    update public.club_members set role = 'Member'
    where profile_id = target and club_id in (select id from public.clubs where parent_club_id = community.id);
  end if;

  insert into public.notifications (profile_id, recipient_id, actor_id, type, entity_id, content, link)
  values (target, target, caller, 'system', community.id,
          case when p_staff then 'You are now teaching staff in ' || community.name
               else 'You are no longer teaching staff in ' || community.name end,
          '/app/clubs/' || community.id);

  return jsonb_build_object('staff', p_staff);
end $$;

grant execute on function public.set_community_staff(uuid, text, boolean) to authenticated;

-- ------------------------------------------------------- remove hub items ---

create or replace function public.remove_club_hub_item(p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_club uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  if p_kind = 'announcement' then
    select club_id into owner_club from public.club_announcements where id = p_id;
    if owner_club is null then raise exception 'Announcement not found'; end if;
    if not public.is_club_admin(owner_club) then raise exception 'Only the club team can remove this'; end if;
    delete from public.club_announcements where id = p_id;
  elsif p_kind = 'meeting' then
    select club_id into owner_club from public.club_meetings where id = p_id;
    if owner_club is null then raise exception 'Meeting not found'; end if;
    if not public.is_club_admin(owner_club) then raise exception 'Only the club team can remove this'; end if;
    delete from public.club_meetings where id = p_id;
  else
    raise exception 'Unknown item';
  end if;

  return jsonb_build_object('removed', true);
end $$;

grant execute on function public.remove_club_hub_item(text, uuid) to authenticated;

-- --------------------------------------------------------- backfill cohorts ---

/* Bootcamp cohort clubs have existed for months with no community above them.
   Give each bootcamp one community per owner and hang its cohorts under it, so
   the new screen has something true to show on day one. Only cohorts whose
   owner already has a permanent club are adopted — we do not invent
   communities for people who never made one. */
do $$
declare
  b record;
  home uuid;
  cohort_count int;
begin
  for b in
    select distinct c.creator_id, c.bootcamp_id
    from public.clubs c
    where c.club_type = 'bootcamp_cohort' and c.parent_club_id is null and c.bootcamp_id is not null
  loop
    select id into home
    from public.clubs
    where creator_id = b.creator_id and club_type = 'permanent'
    order by created_at
    limit 1;

    if home is null then
      continue;
    end if;

    select count(*) into cohort_count from public.clubs where parent_club_id = home;
    if cohort_count >= 40 then
      continue;
    end if;

    update public.clubs
    set parent_club_id = home, club_type = 'cohort'
    where creator_id = b.creator_id
      and bootcamp_id = b.bootcamp_id
      and club_type = 'bootcamp_cohort'
      and parent_club_id is null;
  end loop;
end $$;

-- ---------------------------------------------------------------- grants ---

grant execute on function public.is_club_staff(uuid, uuid) to authenticated;
grant execute on function public.is_community_member(uuid, uuid) to authenticated;

-- ------------------------------------------------------- pending members ---

/* is_club_member() predates join requests: it returns true for any row in
   club_members, including a 'pending' one. That was harmless while a request
   lived in a DM, but a request is now a pending membership row, so a pending
   person would read the cohort's chat, assignments and quizzes. Close that:
   membership of a club now means an active row. */
create or replace function public.is_club_member(p_club_id uuid, p_profile_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.profile_id = coalesce(p_profile_id, auth.uid())
      and m.status = 'active'
  ) or public.is_club_admin(p_club_id, coalesce(p_profile_id, auth.uid()))
$$;

grant execute on function public.is_club_member(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
