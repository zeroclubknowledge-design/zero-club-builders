-- ===========================================================================
-- Zero Club — run this in the Supabase SQL Editor.
--
-- Supabase → SQL Editor → New query → paste all of this → Run.
-- Safe to run more than once.
--
-- Includes the four migrations that were written earlier but never run (the
-- landing page's "0 Builders" comes from the last of them), plus the ZP
-- lockdown and the shipped-project review queue.
-- ===========================================================================


-- ===========================================================================
-- 20260819200000_public_post_reading.sql
-- ===========================================================================

-- ============================================================================
-- Reading a shared post or project without an account
--
-- A link posted to WhatsApp or X is opened overwhelmingly by people who are
-- not members. Until now those people got an empty page, because row-level
-- security hides posts from strangers — which is correct for the table and
-- exactly wrong for a link somebody deliberately shared in public.
--
-- The same shape as get_club_public: a narrow exception returning only what a
-- read-only page needs. No bookmarks, no who-liked-what, no author email, no
-- drafts.
--
-- A note on scope: posts in this schema are not club-scoped. Club conversation
-- lives in club_messages, which this function does not touch and which stays
-- private to members. So every row in `posts` is already something published to
-- the feed, and there is no club content to leak here.
--
-- Interacting still requires an account. This grants reading, not membership.
-- ============================================================================

create or replace function public.get_post_public(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  post public.posts;
  author public.profiles;
  likes_total bigint := 0;
  comments_total bigint := 0;
begin
  select * into post from public.posts where id = p_post_id;

  if post.id is null then
    return jsonb_build_object('found', false);
  end if;

  select * into author from public.profiles where id = post.author_id;

  begin
    select count(*) into likes_total from public.likes where post_id = post.id;
  exception when undefined_table or undefined_column then
    likes_total := 0;
  end;

  begin
    select count(*) into comments_total from public.comments where post_id = post.id;
  exception when undefined_table or undefined_column then
    comments_total := 0;
  end;

  return jsonb_build_object(
    'found', true,
    'post', jsonb_build_object(
      'id', post.id,
      'content', post.content,
      'media_urls', post.media_urls,
      'created_at', post.created_at,
      'is_build_post', coalesce(post.is_build_post, false),
      'author_id', post.author_id,
      'likes_count', likes_total,
      'comments_count', comments_total
    ),
    'author', case when author.id is null then null else jsonb_build_object(
      'id', author.id,
      'username', author.username,
      'full_name', author.full_name,
      'avatar_url', author.avatar_url,
      'account_type', author.account_type
    ) end
  );
end;
$$;

grant execute on function public.get_post_public(uuid) to anon, authenticated;

/*
 * The replies, for the same page.
 *
 * Capped, and ordered oldest first so the conversation reads in the order it
 * happened. A signed-out reader gets the discussion; joining it is what an
 * account is for.
 */
create or replace function public.get_post_comments_public(p_post_id uuid, p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  begin
    select coalesce(jsonb_agg(entry order by entry->>'created_at'), '[]'::jsonb)
    into result
    from (
      select jsonb_build_object(
        'id', c.id,
        'content', c.content,
        'created_at', c.created_at,
        'profiles', jsonb_build_object(
          'username', p.username,
          'full_name', p.full_name,
          'avatar_url', p.avatar_url
        )
      ) as entry
      from public.comments c
      left join public.profiles p on p.id = c.profile_id
      where c.post_id = p_post_id
      order by c.created_at
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) rows;
  exception when undefined_table or undefined_column then
    result := '[]'::jsonb;
  end;

  return coalesce(result, '[]'::jsonb);
end;
$$;

grant execute on function public.get_post_comments_public(uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ===========================================================================
-- 20260819210000_store_product_types.sql
-- ===========================================================================

-- A second, narrower word for what a listing actually is.
--
-- `category` held one of seven flat words, which could not tell a prompt pack
-- from a Figma file. Rather than overload that column, listings now carry the
-- broad group in `category` and the specific type beside it, so a card can say
-- "Prompt pack" while the browse row still says "Templates".
--
-- Nullable on purpose. Every listing published before today keeps working and
-- simply has no type yet; the app falls back to the group when the type is
-- missing rather than showing a gap.

alter table public.store_items
  add column if not exists product_type text;

-- Browsing is by group, and the storefront is sorted newest first.
create index if not exists store_items_category_created_idx
  on public.store_items (category, created_at desc);

create index if not exists store_items_seller_idx
  on public.store_items (seller_id, created_at desc);

analyze public.store_items;

notify pgrst, 'reload schema';

-- ===========================================================================
-- 20260819220000_close_zp_transfer.sql
-- ===========================================================================

-- ZP is earned two ways, so it should only be able to arrive two ways.
--
-- Minting is already correct: claim_referral_reward pays 200 to each side of a
-- referral, and claim_daily_xp_quest pays out a completed task. Nothing else in
-- the database creates ZP — giveaways and gift cards move wallet money, and a
-- Zero Store purchase moves ZP that already exists from buyer to seller.
--
-- transfer_zp is the exception, and it is a real one. It lets any signed-in
-- account move any amount of ZP to any other account, and it is granted to
-- `authenticated`. Nothing in the app has ever called it — it is reachable
-- only by someone talking to the API directly, which is precisely the person
-- you would not want holding it. Combined with referrals paying both sides, it
-- turns a handful of throwaway signups into a funnel: refer yourself, collect
-- 400 across two accounts, then sweep it into one.
--
-- So it goes. Dropping rather than revoking, because a revoked function is an
-- invitation to re-grant it without remembering why it was closed.

drop function if exists public.transfer_zp(uuid, integer);

notify pgrst, 'reload schema';

-- ===========================================================================
-- 20260819230000_public_landing_stats.sql
-- ===========================================================================

-- Numbers the front door can show, to people who have no account.
--
-- The landing page is read overwhelmingly by strangers, and row-level security
-- correctly hides the tables these counts come from. Counting on the client is
-- therefore impossible, and hardcoding is how a page ends up claiming "2000+
-- enterprises" that do not exist.
--
-- This returns totals and nothing else — no names, no rows, no way to page
-- through anybody. A count is not private; the people behind it are.

create or replace function public.get_landing_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  builders bigint := 0;
  clubs bigint := 0;
  bootcamps bigint := 0;
  projects bigint := 0;
begin
  -- Each count is guarded on its own. A table that does not exist in some
  -- environment should cost that one number, not the whole page.
  begin
    select count(*) into builders from public.profiles;
  exception when others then builders := 0;
  end;

  begin
    select count(*) into clubs from public.clubs where coalesce(is_private, false) = false;
  exception when others then clubs := 0;
  end;

  begin
    select count(*) into bootcamps from public.bootcamps;
  exception when others then bootcamps := 0;
  end;

  begin
    select count(*) into projects from public.posts where coalesce(is_build_post, false) = true;
  exception when others then projects := 0;
  end;

  return jsonb_build_object(
    'builders', builders,
    'clubs', clubs,
    'bootcamps', bootcamps,
    'projects', projects
  );
end;
$$;

grant execute on function public.get_landing_stats() to anon, authenticated;

notify pgrst, 'reload schema';

-- ===========================================================================
-- 20260903120000_zp_reward_lockdown.sql
-- ===========================================================================

-- ===========================================================================
-- Only two things mint ZP from here.
--
--   1. A referral, once, for both people (200 each).
--   2. A quest an admin created and a person completed.
--
-- Everything else stops. This is deliberately enforced in the database rather
-- than by removing buttons: a reward that can still be claimed by a crafted
-- request is a reward that is still switched on, however the app behaves.
--
-- Nothing already awarded is reversed. Taking ZP back off people because the
-- rules moved would be a worse outcome than the inconsistency.
-- ===========================================================================

-- ------------------------------------------------- shipping a project ------
/*
 * The 50 ZP for shipping stops being automatic.
 *
 * It was paid by a quest with criteria_type = 'ship', which only checks that a
 * build post exists. Nothing looks at whether anything was actually shipped,
 * so the reward is one post away for anyone who wants it. Until Zero AI can
 * judge that, a person decides — see zc_award_ship_reward below.
 *
 * Two layers again: the quest is deactivated so it leaves the task list, and
 * claim_daily_xp_quest refuses the criteria outright so re-activating the
 * quest by hand cannot quietly turn the automatic payout back on.
 */
update public.quests
set status = 'inactive'
where criteria_type = 'ship';

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

  -- Shipping is reviewed, not claimed. Refused here as well as by the quest
  -- being inactive, so the rule survives someone flipping that status back.
  if quest.criteria_type = 'ship' then
    raise exception 'Shipped projects are reviewed by the Zero Club team before the reward is released';
  end if;

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

-- ===========================================================================
-- 20260903121000_ship_reward_review.sql
-- ===========================================================================

-- ===========================================================================
-- Shipped projects are reviewed by a person, then rewarded.
--
-- This is the replacement for the automatic 50 ZP, and it is meant to be
-- temporary: when Zero AI can look at a build post and judge whether something
-- was genuinely shipped, this queue becomes its input rather than a human's.
-- Until then the decision has a name attached to it.
-- ===========================================================================

/*
 * One row per decision, approved or not.
 *
 * A rejected post has to be recorded rather than simply left unapproved, or it
 * comes back to the top of the queue forever and every reviewer re-reads it.
 */
create table if not exists public.ship_reward_reviews (
  post_id uuid primary key references public.posts(id) on delete cascade,
  reviewed_by uuid not null references public.profiles(id),
  approved boolean not null,
  note text,
  zp_awarded integer not null default 0,
  reviewed_at timestamptz not null default now()
);

alter table public.ship_reward_reviews enable row level security;

/* Authors can see the decision on their own post; admins see everything.
   Nobody writes to this table directly — the functions below do. */
drop policy if exists ship_reward_reviews_read on public.ship_reward_reviews;
create policy ship_reward_reviews_read on public.ship_reward_reviews for select to authenticated
  using (
    public.is_zero_club_admin()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

create index if not exists ship_reward_reviews_reviewed_idx
  on public.ship_reward_reviews (reviewed_at desc);

/*
 * The queue: build posts nobody has ruled on yet.
 *
 * A function rather than a view with a policy, because the posts themselves
 * are readable by everyone — it is the *review status* that is admin-only, and
 * that distinction is easier to keep right in one place than spread across
 * policies on two tables.
 */
create or replace function public.zc_pending_ship_rewards(p_limit integer default 50)
returns table (
  post_id uuid,
  author_id uuid,
  author_name text,
  author_username text,
  author_avatar text,
  content text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then
    return;
  end if;

  return query
    select p.id, p.author_id,
           coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'A builder'),
           pr.username, pr.avatar_url, p.content, p.created_at
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    where coalesce(p.is_build_post, false)
      and not exists (select 1 from public.ship_reward_reviews r where r.post_id = p.id)
    order by p.created_at asc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

grant execute on function public.zc_pending_ship_rewards(integer) to authenticated;

/*
 * The decision.
 *
 * Pays through award_profile_zp like everything else, keyed on the post id, so
 * a double click cannot pay twice even if the review row were somehow missing.
 * The reward amount is a parameter with a 50 default rather than a constant, so
 * changing what a ship is worth does not need a migration.
 */
create or replace function public.zc_review_ship_reward(
  p_post_id uuid,
  p_approve boolean,
  p_note text default null,
  p_amount integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewer uuid := auth.uid();
  post public.posts%rowtype;
  paid boolean := false;
  amount integer := greatest(0, least(coalesce(p_amount, 50), 100000));
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into post from public.posts where id = p_post_id for update;
  if post.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not coalesce(post.is_build_post, false) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_build_post');
  end if;

  -- Already ruled on. Report the decision rather than repeat it.
  if exists (select 1 from public.ship_reward_reviews where post_id = p_post_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  end if;

  if p_approve then
    paid := public.award_profile_zp(
      post.author_id, 'ship_reward', p_post_id::text, amount,
      jsonb_build_object('post_id', p_post_id, 'reviewed_by', reviewer)
    );
  end if;

  insert into public.ship_reward_reviews (post_id, reviewed_by, approved, note, zp_awarded)
  values (p_post_id, reviewer, p_approve, p_note, case when paid then amount else 0 end);

  return jsonb_build_object(
    'ok', true,
    'approved', p_approve,
    'zp_awarded', case when paid then amount else 0 end
  );
end;
$$;

grant execute on function public.zc_review_ship_reward(uuid, boolean, text, integer) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Check. The first should return four numbers; the second should list every
-- way ZP can still be created.
-- ---------------------------------------------------------------------------
select public.get_landing_stats();

select 'ship quests still active' as check, count(*) as should_be_zero
from public.quests where criteria_type = 'ship' and status = 'active';

notify pgrst, 'reload schema';
