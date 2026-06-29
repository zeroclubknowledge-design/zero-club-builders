-- =========================================
-- STORAGE BUCKET POLICIES
-- Run this AFTER creating the buckets in Supabase Dashboard
-- Buckets required: avatars, bootcamp-banners, post-media
-- =========================================

-- avatars: public read, authenticated write own folder
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- bootcamp-banners: public read, authenticated tutor write
CREATE POLICY "Bootcamp banners are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bootcamp-banners');

CREATE POLICY "Tutors can upload bootcamp banners"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bootcamp-banners' AND auth.role() = 'authenticated');

CREATE POLICY "Tutors can update bootcamp banners"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'bootcamp-banners' AND auth.role() = 'authenticated');

-- post-media: public read, authenticated write own folder
CREATE POLICY "Post media is publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

CREATE POLICY "Users can upload their own post media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);
