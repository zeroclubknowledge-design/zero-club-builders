-- OPTIONAL: permanently remove Zero Words data from the database.
-- Paste into Supabase → SQL Editor → Run. This cannot be undone.
-- The app no longer uses any of this; old tournament history (zero_tournaments rows with game_type 'words') is kept.

begin;

drop function if exists public.set_tournament_word_pack(uuid, uuid);
drop function if exists public.zero_tournament_word_pack(uuid);
drop function if exists public.create_word_pack(text, text, text, jsonb, boolean);
drop function if exists public.get_word_pack(uuid);
drop function if exists public.list_word_packs(text, uuid);
drop function if exists public.share_word_pack(uuid, text, uuid);
drop function if exists public.record_word_results(uuid, jsonb);
drop function if exists public.word_bank_summary();
drop function if exists public.word_review_due(integer);
drop function if exists public.word_bank_list(integer);
drop function if exists public.claim_word_pack_quota();
drop function if exists public.release_word_pack_quota();
drop function if exists public.word_pack_quota_status();
drop function if exists public.word_pack_json(public.word_packs, uuid);
drop function if exists public.word_pack_visible(public.word_packs, uuid);
drop function if exists public.word_today();
drop function if exists public.word_box_interval(integer);

drop table if exists public.word_activity;
drop table if exists public.word_pack_quota;
drop table if exists public.word_bank;
drop table if exists public.word_packs;

alter table public.zero_tournaments drop column if exists word_pack_id;

commit;
