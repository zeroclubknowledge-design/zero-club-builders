-- Tie comment notifications to the exact comment so deleted comments cannot
-- leave behind notifications that open an empty conversation.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS comment_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_comment_id_fkey'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_comment_id_fkey
      FOREIGN KEY (comment_id)
      REFERENCES public.comments(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_notifications_comment_id
  ON public.notifications(comment_id)
  WHERE comment_id IS NOT NULL;

-- Match older notifications to the closest comment from the same actor/post.
UPDATE public.notifications AS notification
SET comment_id = (
  SELECT comment.id
  FROM public.comments AS comment
  WHERE comment.post_id = notification.entity_id
    AND comment.profile_id = notification.actor_id
    AND ABS(EXTRACT(EPOCH FROM (comment.created_at - notification.created_at))) <= 60
  ORDER BY ABS(EXTRACT(EPOCH FROM (comment.created_at - notification.created_at)))
  LIMIT 1
)
WHERE notification.type = 'comment'
  AND notification.comment_id IS NULL;

-- Remove old comment alerts whose source comment no longer exists.
DELETE FROM public.notifications
WHERE type = 'comment'
  AND comment_id IS NULL;

CREATE OR REPLACE FUNCTION public.handle_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
BEGIN
  SELECT author_id INTO post_author_id
  FROM public.posts
  WHERE id = NEW.post_id;

  IF post_author_id IS NOT NULL AND post_author_id != NEW.profile_id THEN
    INSERT INTO public.notifications (
      recipient_id,
      actor_id,
      type,
      entity_id,
      comment_id,
      content
    )
    VALUES (
      post_author_id,
      NEW.profile_id,
      'comment',
      NEW.post_id,
      NEW.id,
      NEW.content
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_comment_notification ON public.comments;
CREATE TRIGGER on_comment_notification
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_notification();
