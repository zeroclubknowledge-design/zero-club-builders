-- Comments on feed posts are public conversation data. Keep writes restricted
-- to the authenticated author while allowing every signed-in or signed-out
-- reader to see the complete thread.
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  existing_policy RECORD;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comments'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.comments',
      existing_policy.policyname
    );
  END LOOP;
END;
$$;

CREATE POLICY comments_select_public
  ON public.comments
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Reassert the author-only write rules without disturbing any other policies.
DROP POLICY IF EXISTS comments_insert_own ON public.comments;
CREATE POLICY comments_insert_own
  ON public.comments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS comments_update_own ON public.comments;
CREATE POLICY comments_update_own
  ON public.comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS comments_delete_own ON public.comments;
CREATE POLICY comments_delete_own
  ON public.comments
  FOR DELETE
  TO authenticated
  USING (auth.uid() = profile_id);

-- Ensure comment inserts/updates/deletes can reach open drawers in real time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
  END IF;
END;
$$;
