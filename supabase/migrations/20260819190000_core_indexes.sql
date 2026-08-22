-- The indexes the oldest tables never got.
--
-- Zero Club's first tables — posts, likes, bookmarks, reposts, follows,
-- club_members, notifications — were created in the dashboard, and Postgres
-- does not index a foreign key just because you declared one. Every "has this
-- person liked this post", every follower count, every club member list was
-- reading the whole table and throwing almost all of it away.
--
-- That cost is invisible while a table is small, which is why it survives
-- launch and then arrives all at once: the app does not get slow on a
-- particular day, it gets slow at a particular row count. Opening the feed
-- fires half a dozen of these at once, so the delay is multiplied by exactly
-- the queries a person waits on before they can see anything.
--
-- Nothing here changes behaviour. It only stops the database doing work it
-- never needed to do.

do $$
declare
  stmt text;
  statements text[] := array[
    -- ── Feed ──────────────────────────────────────────────────────────────
    'create index if not exists posts_created_at_idx on public.posts (created_at desc)',
    'create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc)',
    'create index if not exists posts_quoted_post_idx on public.posts (quoted_post_id) where quoted_post_id is not null',

    -- The "did I like this?" lookups. Leading with profile_id matters: the
    -- query always knows who is asking and asks about many posts at once.
    'create index if not exists likes_profile_post_idx on public.likes (profile_id, post_id)',
    'create index if not exists likes_post_idx on public.likes (post_id)',
    'create index if not exists bookmarks_profile_post_idx on public.bookmarks (profile_id, post_id)',
    'create index if not exists reposts_profile_post_idx on public.reposts (profile_id, post_id)',
    'create index if not exists reposts_post_idx on public.reposts (post_id)',
    'create index if not exists reposts_created_at_idx on public.reposts (created_at desc)',

    -- ── Social graph ──────────────────────────────────────────────────────
    -- Both directions again: followers and following are different questions.
    'create index if not exists follows_follower_idx on public.follows (follower_id)',
    'create index if not exists follows_following_idx on public.follows (following_id)',

    -- ── Clubs ─────────────────────────────────────────────────────────────
    'create index if not exists club_members_club_idx on public.club_members (club_id)',
    'create index if not exists club_members_profile_idx on public.club_members (profile_id)',
    'create index if not exists club_messages_club_created_idx on public.club_messages (club_id, created_at desc)',

    -- ── Notifications ─────────────────────────────────────────────────────
    -- Partial, because the only urgent question is "anything unread?" and the
    -- answer is a small slice of a table that grows without limit.
    'create index if not exists notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc)',
    'create index if not exists notifications_unread_idx on public.notifications (recipient_id) where is_read = false',

    -- ── Profiles ──────────────────────────────────────────────────────────
    -- Case-insensitive, because every username lookup in the app uses ilike
    -- and a plain index cannot answer that.
    'create index if not exists profiles_username_lower_idx on public.profiles (lower(username))',
    'create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc)'
  ];
begin
  foreach stmt in array statements loop
    begin
      execute stmt;
    exception
      when undefined_table or undefined_column then
        -- This database does not have that table or column. Skipping is
        -- correct: the migration should describe what to index, not require
        -- that every environment has every feature.
        raise notice 'Skipped (missing table or column): %', stmt;
      when others then
        raise notice 'Skipped (%): %', sqlerrm, stmt;
    end;
  end loop;
end $$;

-- Fresh statistics, so the planner actually uses what was just built rather
-- than continuing with its stale estimate of a tiny table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'posts', 'likes', 'bookmarks', 'reposts', 'follows',
    'club_members', 'club_messages', 'notifications', 'profiles', 'messages'
  ] loop
    begin
      execute format('analyze public.%I', t);
    exception when others then
      raise notice 'Could not analyze %: %', t, sqlerrm;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
