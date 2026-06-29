ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hide_clubs_unless_following BOOLEAN DEFAULT false;
