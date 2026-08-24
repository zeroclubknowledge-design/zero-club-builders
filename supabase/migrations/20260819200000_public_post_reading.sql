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
