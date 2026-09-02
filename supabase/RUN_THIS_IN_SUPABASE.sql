-- ===========================================================================
-- Zero Club — the four migrations that were written but never run.
--
-- Supabase → SQL Editor → New query → paste all of this → Run.
--
-- The landing page showing "0 Builders · 0 Clubs · 0 Bootcamps · 0 Projects"
-- is the visible symptom of the last one: get_landing_stats does not exist in
-- the database, so the page had nothing to show.
--
-- Safe to run more than once. Every function is "create or replace", every
-- policy is dropped before it is created, every index is "if not exists".
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

-- ---------------------------------------------------------------------------
-- Check it worked. This should return four numbers, not an error.
-- ---------------------------------------------------------------------------
select public.get_landing_stats();

notify pgrst, 'reload schema';
