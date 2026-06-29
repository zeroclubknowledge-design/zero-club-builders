-- Zero Club Database Schema
-- Run this in your Supabase SQL Editor

-- =========================================
-- TABLES
-- =========================================

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  tier TEXT DEFAULT 'basic' CHECK (tier IN ('basic', 'elite', 'grow')),
  xp INTEGER DEFAULT 0,
  referral_code TEXT UNIQUE,
  bio TEXT,
  location TEXT,
  referred_by UUID REFERENCES profiles(id),
  referral_reward_claimed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bootcamps table
CREATE TABLE IF NOT EXISTS bootcamps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  banner_url TEXT,
  video_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  visibility BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Modules table
CREATE TABLE IF NOT EXISTS modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bootcamp_id UUID REFERENCES bootcamps(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Lessons table
CREATE TABLE IF NOT EXISTS lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID REFERENCES modules(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'assignment', 'text')),
  content_url TEXT,
  duration TEXT,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enrollments table
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  bootcamp_id UUID REFERENCES bootcamps(id) ON DELETE CASCADE NOT NULL,
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(profile_id, bootcamp_id)
);

-- Posts table (Feed)
CREATE TABLE IF NOT EXISTS posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  reposts_count INTEGER DEFAULT 0,
  is_build_post BOOLEAN DEFAULT false,
  bootcamp_id UUID REFERENCES bootcamps(id) ON DELETE SET NULL,
  is_verified_build BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =========================================
-- ROW LEVEL SECURITY
-- =========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootcamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- =========================================
-- POLICIES: profiles
-- =========================================
CREATE POLICY "profiles_select_public"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- =========================================
-- POLICIES: bootcamps
-- =========================================
CREATE POLICY "bootcamps_select_public"
  ON bootcamps FOR SELECT USING (status = 'active' OR auth.uid() = creator_id);

CREATE POLICY "bootcamps_insert_tutor"
  ON bootcamps FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "bootcamps_update_tutor"
  ON bootcamps FOR UPDATE USING (auth.uid() = creator_id);

CREATE POLICY "bootcamps_delete_tutor"
  ON bootcamps FOR DELETE USING (auth.uid() = creator_id);

-- =========================================
-- POLICIES: modules
-- =========================================
CREATE POLICY "modules_select_public"
  ON modules FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bootcamps b
      WHERE b.id = modules.bootcamp_id
        AND (b.status = 'active' OR b.creator_id = auth.uid())
    )
  );

CREATE POLICY "modules_insert_tutor"
  ON modules FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM bootcamps b
      WHERE b.id = modules.bootcamp_id AND b.creator_id = auth.uid()
    )
  );

CREATE POLICY "modules_update_tutor"
  ON modules FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM bootcamps b
      WHERE b.id = modules.bootcamp_id AND b.creator_id = auth.uid()
    )
  );

-- =========================================
-- POLICIES: lessons
-- =========================================
CREATE POLICY "lessons_select_enrolled"
  ON lessons FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments e
      JOIN modules m ON m.bootcamp_id = e.bootcamp_id
      WHERE m.id = lessons.module_id AND e.profile_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM modules m
      JOIN bootcamps b ON b.id = m.bootcamp_id
      WHERE m.id = lessons.module_id AND b.creator_id = auth.uid()
    )
  );

CREATE POLICY "lessons_insert_tutor"
  ON lessons FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM modules m
      JOIN bootcamps b ON b.id = m.bootcamp_id
      WHERE m.id = lessons.module_id AND b.creator_id = auth.uid()
    )
  );

-- =========================================
-- POLICIES: enrollments
-- =========================================
CREATE POLICY "enrollments_select_own"
  ON enrollments FOR SELECT USING (auth.uid() = profile_id);

CREATE POLICY "enrollments_insert_own"
  ON enrollments FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- =========================================
-- POLICIES: posts
-- =========================================
CREATE POLICY "posts_select_public"
  ON posts FOR SELECT USING (true);

CREATE POLICY "posts_insert_own"
  ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "posts_update_own"
  ON posts FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "posts_delete_own"
  ON posts FOR DELETE USING (auth.uid() = author_id);

-- =========================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  referrer_id UUID;
BEGIN
  -- Find referrer if code was used
  IF NEW.raw_user_meta_data->>'referral_code_used' IS NOT NULL THEN
    SELECT id INTO referrer_id FROM public.profiles 
    WHERE referral_code = NEW.raw_user_meta_data->>'referral_code_used';
  END IF;

  INSERT INTO public.profiles (id, username, full_name, avatar_url, banner_url, website, referral_code, referred_by, xp, referral_reward_claimed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    '',
    '',
    UPPER(SUBSTRING(MD5(NEW.id::TEXT), 1, 8)),
    referrer_id,
    CASE WHEN referrer_id IS NOT NULL THEN 200 ELSE 0 END,
    CASE WHEN referrer_id IS NOT NULL THEN true ELSE false END
  );

  -- Award 200XP to the referrer and create system transaction notifications for both
  IF referrer_id IS NOT NULL THEN
    BEGIN
      UPDATE public.profiles SET xp = COALESCE(xp, 0) + 200 WHERE id = referrer_id;
      
      -- Using 'mention' temporarily in case 'system' is not in the older database check constraint
      INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id, content)
      VALUES (NEW.id, referrer_id, 'mention', NEW.id, 'Claimed 200 XP for joining via referral code!');
      
      INSERT INTO public.notifications (recipient_id, actor_id, type, entity_id, content)
      VALUES (referrer_id, NEW.id, 'mention', referrer_id, 'Earned 200 XP for inviting a new builder!');
    EXCEPTION WHEN OTHERS THEN
      -- Catch any errors here (like constraint violations) so they don't break the whole signup
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fire after new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =========================================
-- POLICIES: follows
-- =========================================
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY " follows_select_public\ ON follows FOR SELECT USING (true);
CREATE POLICY \follows_insert_own\ ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY \follows_delete_own\ ON follows FOR DELETE USING (auth.uid() = follower_id);


-- =========================================
-- NEW TABLES: Social & Engagement
-- =========================================

-- Likes table
CREATE TABLE IF NOT EXISTS likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(profile_id, post_id)
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);

-- Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(profile_id, post_id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'repost', 'mention', 'system', 'build_tagged')),
  entity_id UUID NOT NULL,
  content TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Clubs table
CREATE TABLE IF NOT EXISTS clubs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  banner_url TEXT,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  is_private BOOLEAN DEFAULT false,
  price NUMERIC DEFAULT 0,
  rules TEXT DEFAULT 'Be respectful, help others, and share your work!',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Club Memberships
CREATE TABLE IF NOT EXISTS club_members (
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'Member' CHECK (role IN ('Member', 'Administrator', 'Investor', 'Business Developer', 'Product Lead', 'Design Lead', 'Tech Lead', 'Growth Hacker')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (club_id, profile_id)
);

-- Reposts Table
CREATE TABLE IF NOT EXISTS reposts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, post_id)
);

ALTER TABLE reposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reposts are viewable by everyone" ON reposts
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can repost" ON reposts
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can remove their own reposts" ON reposts
  FOR DELETE USING (auth.uid() = profile_id);

-- =========================================
-- POLICIES
-- =========================================

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- Likes Policies
CREATE POLICY " likes_select_public\ ON likes FOR SELECT USING (true);
CREATE POLICY \likes_insert_own\ ON likes FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY \likes_delete_own\ ON likes FOR DELETE USING (auth.uid() = profile_id);

-- Comments Policies
CREATE POLICY \comments_select_public\ ON comments FOR SELECT USING (true);
CREATE POLICY \comments_insert_own\ ON comments FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- Bookmarks Policies
CREATE POLICY \bookmarks_select_own\ ON bookmarks FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY \bookmarks_insert_own\ ON bookmarks FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY \bookmarks_delete_own\ ON bookmarks FOR DELETE USING (auth.uid() = profile_id);

-- Notifications Policies
CREATE POLICY \notifications_select_own\ ON notifications FOR SELECT USING (auth.uid() = recipient_id);
CREATE POLICY \notifications_update_own\ ON notifications FOR UPDATE USING (auth.uid() = recipient_id);

-- Clubs Policies
CREATE POLICY "clubs_select_public" ON clubs FOR SELECT USING (true);
CREATE POLICY "clubs_insert_auth" ON clubs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "clubs_update_owner" ON clubs FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "clubs_delete_owner" ON clubs FOR DELETE USING (auth.uid() = creator_id);


-- Club Members Policies
CREATE POLICY \club_members_select_public\ ON club_members FOR SELECT USING (true);
CREATE POLICY \club_members_insert_own\ ON club_members FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY \club_members_insert_creator\ ON club_members FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM clubs
    WHERE clubs.id = club_members.club_id AND clubs.creator_id = auth.uid()
  )
);


-- =========================================
-- TRIGGERS: Automatic Counts
-- =========================================

-- Function to update likes count
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS 
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
 LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for likes
CREATE TRIGGER on_like_change
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE PROCEDURE update_post_likes_count();

-- Function to update comments count
CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER AS 
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
 LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for comments
CREATE TRIGGER on_comment_change
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE PROCEDURE update_post_comments_count();

-- Function to update reposts count
CREATE OR REPLACE FUNCTION update_post_reposts_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET reposts_count = reposts_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for reposts
CREATE TRIGGER on_repost_change
  AFTER INSERT OR DELETE ON reposts
  FOR EACH ROW EXECUTE PROCEDURE update_post_reposts_count();

-- =========================================
-- XP REWARD SYSTEM
-- =========================================

-- Function: Reward XP for Posts with Daily Limits
CREATE OR REPLACE FUNCTION reward_post_xp()
RETURNS TRIGGER AS $$
DECLARE
  author_tier TEXT;
  xp_earned_today INTEGER;
  daily_limit INTEGER;
BEGIN
  -- Get user tier
  SELECT tier INTO author_tier FROM profiles WHERE id = NEW.author_id;
  
  -- Set daily limit based on tier
  CASE author_tier
    WHEN 'elite' THEN daily_limit := 200; -- Premium
    WHEN 'grow' THEN daily_limit := 500;  -- Premium+
    ELSE daily_limit := 100;            -- Basic
  END CASE;

  -- Count XP earned from posts today (5 XP per post)
  -- We count all posts today except the current one
  SELECT (COUNT(*) * 5) INTO xp_earned_today 
  FROM posts 
  WHERE author_id = NEW.author_id 
    AND created_at >= CURRENT_DATE
    AND id != NEW.id;

  -- Award 5 XP if under limit
  IF xp_earned_today < daily_limit THEN
    UPDATE profiles SET xp = xp + 5 WHERE id = NEW.author_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_reward_xp ON posts;
CREATE TRIGGER on_post_reward_xp
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE PROCEDURE reward_post_xp();

-- Function: Reward Owner 1 XP for Comments from others
CREATE OR REPLACE FUNCTION reward_comment_xp()
RETURNS TRIGGER AS $$
DECLARE
  post_owner_id UUID;
BEGIN
  SELECT author_id INTO post_owner_id FROM posts WHERE id = NEW.post_id;
  
  -- Award 1 XP to post owner if someone else comments
  IF post_owner_id != NEW.profile_id THEN
    UPDATE profiles SET xp = xp + 1 WHERE id = post_owner_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_reward_xp ON comments;
CREATE TRIGGER on_comment_reward_xp
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE PROCEDURE reward_comment_xp();


-- Add missing columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_reward_claimed BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS availability_days TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS availability_start TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS availability_end TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS availability_duration TEXT;



-- =========================================
-- STORAGE POLICIES
-- =========================================

-- Create buckets if they don't exist
-- Note: This might require manual creation in the dashboard if SQL doesn't support it on your version,
-- but these policies assume they exist.

-- =========================================
-- NOTIFICATION AUTOMATION
-- =========================================

-- Update Notifications type check
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('like', 'comment', 'follow', 'repost', 'mention', 'system'));

-- Function: Create Like Notification
CREATE OR REPLACE FUNCTION handle_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
BEGIN
  SELECT author_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  
  -- Don't notify if liking own post
  IF post_author_id != NEW.profile_id THEN
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id)
    VALUES (post_author_id, NEW.profile_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_like_notification
  AFTER INSERT ON likes
  FOR EACH ROW EXECUTE PROCEDURE handle_like_notification();

-- Function: Create Comment Notification
CREATE OR REPLACE FUNCTION handle_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
BEGIN
  SELECT author_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  
  IF post_author_id != NEW.profile_id THEN
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id)
    VALUES (post_author_id, NEW.profile_id, 'comment', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_notification
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE PROCEDURE handle_comment_notification();

CREATE OR REPLACE FUNCTION handle_follow_notification()
RETURNS TRIGGER AS $$
DECLARE
  referrer_id UUID;
BEGIN
  -- Basic follow notification
  INSERT INTO notifications (recipient_id, actor_id, type, entity_id)
  VALUES (NEW.following_id, NEW.follower_id, 'follow', NEW.follower_id);

  -- Referral reward logic: If follower was referred by the person they just followed
  SELECT referred_by INTO referrer_id FROM profiles WHERE id = NEW.follower_id;

  IF referrer_id = NEW.following_id THEN
    -- Check if reward already claimed
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.follower_id AND referral_reward_claimed = true) THEN
      -- Award 200XP to both
      UPDATE profiles SET xp = xp + 200, referral_reward_claimed = true WHERE id = NEW.follower_id;
      UPDATE profiles SET xp = xp + 200 WHERE id = NEW.following_id;
      
      -- Notification to the follower (referee)
      INSERT INTO notifications (recipient_id, actor_id, type, entity_id)
      VALUES (NEW.follower_id, NEW.following_id, 'system', NEW.follower_id);
      
      -- Notification to the followed (inviter)
      INSERT INTO notifications (recipient_id, actor_id, type, entity_id)
      VALUES (NEW.following_id, NEW.follower_id, 'system', NEW.following_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_follow_notification
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE PROCEDURE handle_follow_notification();

-- Function: Create Repost Notification
CREATE OR REPLACE FUNCTION handle_repost_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
BEGIN
  SELECT author_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  
  IF post_author_id != NEW.profile_id THEN
    INSERT INTO notifications (recipient_id, actor_id, type, entity_id)
    VALUES (post_author_id, NEW.profile_id, 'repost', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_repost_notification
  AFTER INSERT ON reposts
  FOR EACH ROW EXECUTE PROCEDURE handle_repost_notification();

-- Profiles bucket policies
CREATE POLICY " Public Access\ ON storage.objects FOR SELECT USING (bucket_id = 'profiles');
CREATE POLICY \Authenticated Upload\ ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profiles' AND auth.role() = 'authenticated');
CREATE POLICY \Owner Update\ ON storage.objects FOR UPDATE USING (bucket_id = 'profiles' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Post Media bucket policies
CREATE POLICY \Public Post Media Access\ ON storage.objects FOR SELECT USING (bucket_id = 'post-media');
CREATE POLICY \Authenticated Post Media Upload\ ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'post-media' AND auth.role() = 'authenticated');


-- Bootcamp Banners bucket policies
CREATE POLICY " Public Bootcamp Banner Access\ ON storage.objects FOR SELECT USING (bucket_id = 'bootcamp-banners');
CREATE POLICY \Authenticated Bootcamp Banner Upload\ ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bootcamp-banners' AND auth.role() = 'authenticated');

-- Club Images bucket policies
CREATE POLICY \Public Club Image Access\ ON storage.objects FOR SELECT USING (bucket_id = 'club-images');
CREATE POLICY \Authenticated Club Image Upload\ ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'club-images' AND auth.role() = 'authenticated');

-- =========================================
-- PERFORMANCE INDEXING
-- =========================================

-- Profiles: username is already indexed (UNIQUE), id is indexed (PRIMARY KEY)
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Posts: Index author_id for fast feed/profile loading
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);

-- Comments: Index post_id for fast comment loading
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_profile_id ON public.comments(profile_id);

-- Likes: Index post_id and profile_id
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_profile_id ON public.likes(profile_id);

-- Follows: Index follower and following IDs
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);

-- Notifications: Index recipient_id for fast alerts
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- Reposts: Index post_id and profile_id
CREATE INDEX IF NOT EXISTS idx_reposts_post_id ON public.reposts(post_id);
CREATE INDEX IF NOT EXISTS idx_reposts_profile_id ON public.reposts(profile_id);

-- Bootcamps: Index creator_id and status
CREATE INDEX IF NOT EXISTS idx_bootcamps_creator_id ON public.bootcamps(creator_id);
CREATE INDEX IF NOT EXISTS idx_bootcamps_status ON public.bootcamps(status);
-- Quests Table
CREATE TABLE IF NOT EXISTS quests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('daily', 'one-time', 'milestone')),
  reward_xp INTEGER DEFAULT 0,
  criteria_type TEXT NOT NULL, -- 'post', 'follow', 'profile', 'enrollment'
  criteria_count INTEGER DEFAULT 1,
  icon_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Quest Completions
CREATE TABLE IF NOT EXISTS quest_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  quest_id UUID REFERENCES quests(id) ON DELETE CASCADE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  claimed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(profile_id, quest_id)
);

-- Enable RLS
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quests_select_public" ON quests FOR SELECT USING (true);
CREATE POLICY "quest_completions_select_own" ON quest_completions FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "quest_completions_insert_own" ON quest_completions FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- Function to claim quest reward
CREATE OR REPLACE FUNCTION claim_quest_reward(target_quest_id UUID)
RETURNS JSONB AS $$
DECLARE
  quest_reward INTEGER;
  user_id UUID;
  already_claimed BOOLEAN;
BEGIN
  user_id := auth.uid();
  IF user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  -- Get reward amount
  SELECT reward_xp INTO quest_reward FROM quests WHERE id = target_quest_id;
  
  -- Check if already claimed
  SELECT EXISTS (
    SELECT 1 FROM quest_completions 
    WHERE profile_id = user_id AND quest_id = target_quest_id AND claimed_at IS NOT NULL
  ) INTO already_claimed;

  IF already_claimed THEN
    RETURN jsonb_build_object('success', false, 'message', 'Reward already claimed');
  END IF;

  -- Record completion/claim
  INSERT INTO quest_completions (profile_id, quest_id, claimed_at)
  VALUES (user_id, target_quest_id, NOW())
  ON CONFLICT (profile_id, quest_id) 
  DO UPDATE SET claimed_at = NOW();

  -- Award XP
  UPDATE profiles SET xp = xp + quest_reward WHERE id = user_id;

  -- Notification
  INSERT INTO notifications (recipient_id, actor_id, type, entity_id)
  VALUES (user_id, user_id, 'system', target_quest_id);

  RETURN jsonb_build_object('success', true, 'reward', quest_reward);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed initial quests
INSERT INTO quests (title, description, type, reward_xp, criteria_type, criteria_count, icon_name)
VALUES 
  ('The Daily Builder', 'Post a build update today.', 'daily', 50, 'post', 1, 'Rocket'),
  ('Networking Pro', 'Follow 5 builders in the community.', 'one-time', 200, 'follow', 5, 'Users'),
  ('Knowledge Seeker', 'Enroll in your first bootcamp.', 'one-time', 150, 'enrollment', 1, 'GraduationCap'),
  ('Complete Identity', 'Complete your profile bio.', 'one-time', 100, 'profile', 1, 'Star')
ON CONFLICT DO NOTHING;

-- Function: Handle @mentions in posts and comments
CREATE OR REPLACE FUNCTION handle_mentions()
RETURNS TRIGGER AS $$
DECLARE
  mention_match TEXT;
  mentioned_user_id UUID;
BEGIN
  -- Scan for @username pattern
  FOR mention_match IN 
    SELECT matches[1] 
    FROM regexp_matches(NEW.content, '@(\w+)', 'g') AS matches
  LOOP
    -- Find the user ID for this username
    SELECT id INTO mentioned_user_id FROM profiles WHERE username = mention_match;
    
    -- If user exists and is not the author, create notification
    IF mentioned_user_id IS NOT NULL AND mentioned_user_id != (CASE TG_TABLE_NAME WHEN 'posts' THEN NEW.author_id ELSE NEW.profile_id END) THEN
      INSERT INTO notifications (recipient_id, actor_id, type, entity_id)
      VALUES (
        mentioned_user_id, 
        (CASE TG_TABLE_NAME WHEN 'posts' THEN NEW.author_id ELSE NEW.profile_id END), 
        'mention', 
        (CASE TG_TABLE_NAME WHEN 'posts' THEN NEW.id ELSE NEW.post_id END)
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for posts
DROP TRIGGER IF EXISTS on_post_mention ON posts;
CREATE TRIGGER on_post_mention
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE PROCEDURE handle_mentions();

-- Trigger for comments
DROP TRIGGER IF EXISTS on_comment_mention ON comments;
CREATE TRIGGER on_comment_mention
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE PROCEDURE handle_mentions();

-- =========================================
-- MESSAGES TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  reply_to_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_own" ON messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "messages_insert_own" ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "messages_update_own" ON messages FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- =========================================
-- CLUB MESSAGES
-- =========================================
CREATE TABLE IF NOT EXISTS club_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  room_id TEXT DEFAULT 'general',
  reply_to_id UUID REFERENCES club_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE club_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_messages_select_members" ON club_messages 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_members 
      WHERE club_id = club_messages.club_id AND profile_id = auth.uid()
    )
  );

CREATE POLICY "club_messages_insert_members" ON club_messages 
  FOR INSERT WITH CHECK (
    auth.uid() = profile_id AND
    EXISTS (
      SELECT 1 FROM club_members 
      WHERE club_id = club_messages.club_id AND profile_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_club_messages_club_id ON public.club_messages(club_id);
CREATE INDEX IF NOT EXISTS idx_club_messages_created_at ON public.club_messages(created_at DESC);

-- =========================================
-- CLUB MESSAGE REACTIONS
-- =========================================
CREATE TABLE IF NOT EXISTS club_message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES club_messages(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(message_id, profile_id, emoji)
);

ALTER TABLE club_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_message_reactions_select_public" ON club_message_reactions FOR SELECT USING (true);
CREATE POLICY "club_message_reactions_insert_auth" ON club_message_reactions FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "club_message_reactions_delete_auth" ON club_message_reactions FOR DELETE USING (auth.uid() = profile_id);

-- =========================================
-- COMMENT REACTIONS
-- =========================================
CREATE TABLE IF NOT EXISTS comment_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(comment_id, profile_id, emoji)
);

ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_reactions_select_public" ON comment_reactions FOR SELECT USING (true);
CREATE POLICY "comment_reactions_insert_auth" ON comment_reactions FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "comment_reactions_delete_auth" ON comment_reactions FOR DELETE USING (auth.uid() = profile_id);

