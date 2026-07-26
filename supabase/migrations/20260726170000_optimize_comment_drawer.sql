-- Keep comment drawers fast as posts and discussions grow.
CREATE INDEX IF NOT EXISTS idx_comments_post_created_at
  ON public.comments (post_id, created_at);

CREATE INDEX IF NOT EXISTS idx_comments_parent_id
  ON public.comments (parent_id);

DO $$
BEGIN
  IF to_regclass('public.comment_reactions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON public.comment_reactions (comment_id)';
  END IF;

  IF to_regclass('public.comment_likes') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_comment_likes_profile_comment ON public.comment_likes (profile_id, comment_id)';
  END IF;

  IF to_regclass('public.note_comments') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_note_comments_note_created_at ON public.note_comments (note_id, created_at)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_note_comments_parent_id ON public.note_comments (parent_id)';
  END IF;

  IF to_regclass('public.note_comment_reactions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_note_comment_reactions_comment_id ON public.note_comment_reactions (comment_id)';
  END IF;

  IF to_regclass('public.note_comment_likes') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_note_comment_likes_profile_comment ON public.note_comment_likes (profile_id, comment_id)';
  END IF;
END
$$;
