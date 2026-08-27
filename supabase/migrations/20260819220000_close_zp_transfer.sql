-- ZP is earned two ways, so it should only be able to arrive two ways.
--
-- Minting is already correct: claim_referral_reward pays 200 to each side of a
-- referral, and claim_daily_xp_quest pays out a completed task. Nothing else in
-- the database creates ZP — giveaways and gift cards move wallet money, and a
-- Zero Store purchase moves ZP that already exists from buyer to seller.
--
-- transfer_zp is the exception, and it is a real one. It lets any signed-in
-- account move any amount of ZP to any other account, and it is granted to
-- `authenticated`. Nothing in the app has ever called it — it is reachable
-- only by someone talking to the API directly, which is precisely the person
-- you would not want holding it. Combined with referrals paying both sides, it
-- turns a handful of throwaway signups into a funnel: refer yourself, collect
-- 400 across two accounts, then sweep it into one.
--
-- So it goes. Dropping rather than revoking, because a revoked function is an
-- invitation to re-grant it without remembering why it was closed.

drop function if exists public.transfer_zp(uuid, integer);

notify pgrst, 'reload schema';
