-- 1. Allow the 'Study Rep' role on club members
ALTER TABLE club_members DROP CONSTRAINT IF EXISTS club_members_role_check;
ALTER TABLE club_members ADD CONSTRAINT club_members_role_check
  CHECK (role IN ('Member', 'Administrator', 'Study Rep', 'Investor', 'Business Developer', 'Product Lead', 'Design Lead', 'Tech Lead', 'Growth Hacker'));

-- 2. Let club creators and administrators update member roles
DROP POLICY IF EXISTS "club_members_update_creator_or_admin" ON club_members;
CREATE POLICY "club_members_update_creator_or_admin" ON club_members FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clubs
    WHERE clubs.id = club_members.club_id AND clubs.creator_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.club_id = club_members.club_id
      AND cm.profile_id = auth.uid()
      AND cm.role = 'Administrator'
  )
);
