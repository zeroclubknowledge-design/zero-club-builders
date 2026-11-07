begin;
-- Extend the installed earning sources instead of dropping categories added elsewhere.
do $$ declare sources text[]; begin
 select array_agg(distinct source order by source) into sources from unnest(public.earning_wallet_sources()||array['game_prize','game_host'])source;
 execute format('create or replace function public.earning_wallet_sources() returns text[] language sql immutable as %L','select '||quote_literal(sources::text)||'::text[]');
end $$;

-- Classify cash tournament awards, not escrow refunds or ZP conversions.
create or replace function public.classify_cash_game_prize() returns trigger language plpgsql set search_path=public as $$
begin
 if new.direction='credit' and new.source='game' and new.reference ~ '^zt_prize_[0-9a-f-]{36}_[1-3]$' then new.source:='game_prize';end if;
 return new;
end $$;
drop trigger if exists classify_cash_game_prize on public.wallet_transactions;
create trigger classify_cash_game_prize before insert or update of source,direction,reference on public.wallet_transactions for each row execute function public.classify_cash_game_prize();
update public.wallet_transactions set source='game_prize' where direction='credit' and source='game' and reference ~ '^zt_prize_[0-9a-f-]{36}_[1-3]$';

-- Legacy games already credited profiles.coins. Add earning provenance only:
-- never credit those balances again, and never classify their refund records.
create or replace function public.record_legacy_game_earning() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.direction='credit' and new.kind='payout' then
  insert into wallet_transactions(profile_id,direction,amount,source,description,reference,metadata,created_at)
  values(new.profile_id,'credit',new.amount,'game_prize','Zero Games cash prize','legacy_game_prize_'||new.id,jsonb_build_object('competition_id',new.competition_id),new.created_at) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.record_legacy_game_earning() from public,anon,authenticated;
do $$ begin
 if to_regclass('public.zero_game_wallet_transactions') is not null then
  execute $sql$insert into wallet_transactions(profile_id,direction,amount,source,description,reference,metadata,created_at)
   select profile_id,'credit',amount,'game_prize','Zero Games cash prize','legacy_game_prize_'||id,jsonb_build_object('competition_id',competition_id),created_at
   from zero_game_wallet_transactions where direction='credit' and kind='payout' on conflict do nothing$sql$;
  execute 'drop trigger if exists record_legacy_game_earning on public.zero_game_wallet_transactions';
  execute 'create trigger record_legacy_game_earning after insert on public.zero_game_wallet_transactions for each row execute function public.record_legacy_game_earning()';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
