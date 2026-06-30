CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $body
DECLARE
  referrer_id UUID;
BEGIN
  -- Find referrer if code was used
  IF NEW.raw_user_meta_data->>'referral_code_used' IS NOT NULL THEN
    SELECT id INTO referrer_id FROM public.profiles 
    WHERE referral_code = NEW.raw_user_meta_data->>'referral_code_used';
  END IF;

  INSERT INTO public.profiles (
    id, username, full_name, avatar_url, banner_url, website, 
    referral_code, referred_by, xp, referral_reward_claimed, account_type
  )
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
    CASE WHEN referrer_id IS NOT NULL THEN true ELSE false END,
    COALESCE(NEW.raw_user_meta_data->>'account_type', 'Learner')
  );

  -- Award 200XP to the referrer and create system transaction notifications for both
  IF referrer_id IS NOT NULL THEN
    BEGIN
      UPDATE public.profiles SET xp = COALESCE(xp, 0) + 200 WHERE id = referrer_id;
      
      INSERT INTO public.notifications (profile_id, actor_id, type, target_id, message)
      VALUES (referrer_id, NEW.id, 'mention', NEW.id, 'You earned 200 XP from a referral signup!'),
             (NEW.id, referrer_id, 'mention', referrer_id, 'You earned 200 XP for using a referral code!');
    EXCEPTION WHEN OTHERS THEN
      -- Ignore notification errors to ensure signup succeeds
    END;
  END IF;

  RETURN NEW;
END;
$body LANGUAGE plpgsql SECURITY DEFINER;
