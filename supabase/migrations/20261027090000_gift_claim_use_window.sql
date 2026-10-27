begin;
-- Campaign expiry remains the overall deadline. Claimed copies have their own,
-- immutable use window; existing balance/checkout queries already filter expires_at.
alter table public.gift_cards
  add column if not exists claim_deadline_at timestamptz,
  add column if not exists claim_released_at timestamptz;

-- Give existing expiring credit a rollout grace period rather than expiring it
-- retroactively. Rerunning this file must never extend an existing claim.
update public.gift_cards set
  claim_deadline_at=least(expires_at,now()+interval '6 hours'),
  expires_at=least(expires_at,now()+interval '6 hours')
where parent_gift_id is not null and status='claimed' and expires_at is not null
  and claim_deadline_at is null and remaining_amount>0;

create index if not exists gift_claim_due_idx on public.gift_cards(expires_at,parent_gift_id)
  where parent_gift_id is not null and claim_deadline_at is not null and claim_released_at is null and status='claimed';

create or replace function public.guard_gift_claim_window()
returns trigger language plpgsql security definer set search_path=public as $$
declare campaign_expiry timestamptz;
begin
 if new.parent_gift_id is null then return new; end if;
 select expires_at into campaign_expiry from gift_cards where id=new.parent_gift_id;
 if tg_op='UPDATE' and old.claim_deadline_at is not null then new.claim_deadline_at:=old.claim_deadline_at;
 elsif new.claim_deadline_at is null and campaign_expiry is not null then
   new.claim_deadline_at:=least(coalesce(new.claimed_at,now())+interval '6 hours',campaign_expiry);
 end if;
 if new.claim_deadline_at is not null then
   new.expires_at:=least(new.expires_at,new.claim_deadline_at,campaign_expiry);
 end if;
 if tg_op='UPDATE' and old.claim_released_at is not null then
   new.claim_released_at:=old.claim_released_at;
   new.status:='cancelled'; new.remaining_amount:=0;
 end if;
 return new;
end $$;
drop trigger if exists gift_claim_window_guard on public.gift_cards;
create trigger gift_claim_window_guard before insert or update on public.gift_cards
for each row execute function public.guard_gift_claim_window();

-- An organization shortening its campaign cannot leave longer-lived claim credit.
create or replace function public.cap_gift_claim_windows()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.parent_gift_id is null and new.expires_at is distinct from old.expires_at then
   update gift_cards set expires_at=least(claim_deadline_at,new.expires_at)
   where parent_gift_id=new.id and claim_deadline_at is not null and claim_released_at is null;
 end if;
 return new;
end $$;
drop trigger if exists gift_campaign_claim_window_cap on public.gift_cards;
create trigger gift_campaign_claim_window_cap after update of expires_at on public.gift_cards
for each row execute function public.cap_gift_claim_windows();

create or replace function public.refresh_zero_gift_claims(p_gift uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare campaign record; receipt record; released integer; total integer:=0;
begin
 -- Parent-before-child locking matches claim allocation. SKIP LOCKED keeps
 -- public browsing from waiting on another person's payment/claim transaction.
 for campaign in select c.id from gift_cards c
   where c.parent_gift_id is null and (p_gift is null or c.id=p_gift)
     and exists(select 1 from gift_cards r where r.parent_gift_id=c.id
       and r.claim_deadline_at is not null and r.claim_released_at is null
       and r.status='claimed' and r.expires_at<=now() and r.remaining_amount=r.amount
       and not exists(select 1 from gift_redemptions d where d.gift_card_id=r.id))
   order by c.id limit 200 for update of c skip locked
 loop
   released:=0;
   for receipt in update gift_cards r set remaining_amount=0,status='cancelled',claim_released_at=now()
     where r.parent_gift_id=campaign.id and r.claim_deadline_at is not null
       and r.claim_released_at is null and r.status='claimed' and r.expires_at<=now()
       and r.remaining_amount=r.amount
       and not exists(select 1 from gift_redemptions d where d.gift_card_id=r.id)
     returning r.id,r.claimed_by,r.creator_id
   loop
     released:=released+1;
     insert into notifications(profile_id,actor_id,type,content) values(receipt.claimed_by,receipt.creator_id,'system',
       'Your unused Zero Gift claim expired. Its place is available for another member. Each account can claim this gift only once.');
   end loop;
   if released>0 then
     update gift_cards set claimed_count=greatest(0,claimed_count-released),
       status=case when status='claimed' and refunded_at is null then 'active' else status end
       where id=campaign.id;
     total:=total+released;
   end if;
 end loop;
 return total;
end $$;
revoke all on function public.refresh_zero_gift_claims(uuid) from public;
grant execute on function public.refresh_zero_gift_claims(uuid) to anon,authenticated,service_role;

create or replace function public.claim_gift_card(gift_code text)
returns public.gift_cards language plpgsql security definer set search_path=public as $$
declare campaign public.gift_cards; receipt public.gift_cards; use_minutes integer;
begin
 if auth.uid() is null then raise exception 'Sign in to claim this gift'; end if;
 perform 1 from profiles where id=auth.uid() for no key update;
 select * into campaign from gift_cards where upper(code)=upper(btrim(gift_code)) and parent_gift_id is null for update;
 if campaign.id is null then raise exception 'Gift card not found'; end if;
 perform public.refresh_zero_gift_claims(campaign.id);
 select * into campaign from gift_cards where id=campaign.id;
 -- Keep a receipt even after expiry: one account never takes another place.
 select * into receipt from gift_cards where parent_gift_id=campaign.id and claimed_by=auth.uid();
 if receipt.id is not null then return receipt; end if;
 if campaign.claimed_by=auth.uid() then return campaign; end if;
 if campaign.expires_at<=now() then raise exception 'This gift has expired'; end if;
 if campaign.creator_id=auth.uid() then raise exception 'You cannot claim your own gift'; end if;
 if campaign.status<>'active' or campaign.claimed_count>=campaign.quantity then raise exception 'All claims for this gift have been taken'; end if;
 insert into gift_cards(code,creator_id,amount,template_id,service,message,custom_purpose,status,claimed_by,claimed_at,remaining_amount,parent_gift_id,bootcamp_ids,club_ids,claimed_count,expires_at)
 values('GC-'||replace(gen_random_uuid()::text,'-',''),campaign.creator_id,campaign.amount,campaign.template_id,campaign.service,campaign.message,campaign.custom_purpose,'claimed',auth.uid(),now(),
   case when campaign.expires_at is not null or campaign.service=any(public.restricted_zero_gift_services()) then campaign.amount else 0 end,
   campaign.id,campaign.bootcamp_ids,coalesce(campaign.club_ids,'{}'),1,campaign.expires_at) returning * into receipt;
 update gift_cards set claimed_count=claimed_count+1,status=case when claimed_count+1>=quantity then 'claimed' else 'active' end where id=campaign.id;
 if campaign.expires_at is null and campaign.service=any(public.wallet_gift_services()) then
   perform public.wallet_apply(auth.uid(),'credit',campaign.amount,'gift','Claimed Zero Gift','gift_claim_'||receipt.id,jsonb_build_object('gift_code',campaign.code,'gift_id',campaign.id));
 end if;
 insert into notifications(profile_id,actor_id,type,content) values(campaign.creator_id,auth.uid(),'system',
   coalesce((select coalesce(nullif(btrim(full_name),''),username) from profiles where id=auth.uid()),'A member')||' claimed your Zero Gift ('||(campaign.claimed_count+1)||' of '||campaign.quantity||' places in use).');
 if receipt.claim_deadline_at is not null then
   use_minutes:=greatest(1,ceil(extract(epoch from (receipt.expires_at-now()))/60))::int;
   insert into notifications(profile_id,actor_id,type,content) values(auth.uid(),campaign.creator_id,'system',
     'Zero Gift claimed. Use it within '||case when use_minutes%60=0 then (use_minutes/60)||case when use_minutes=60 then ' hour' else ' hours' end else use_minutes||' minutes' end||', before '||
     to_char(receipt.expires_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC, at eligible '||case when campaign.service='bootcamps' then 'bootcamp ' else '' end||
     'checkouts. A completely unused claim expires and returns to the available places.');
 end if;
 return receipt;
end $$;

create or replace function public.get_gift_card_v2(gift_code text)
returns jsonb language plpgsql volatile security definer set search_path=public as $$
declare card public.gift_cards; receipt public.gift_cards; names jsonb; club_names jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to view this gift'; end if;
 select * into card from gift_cards where upper(code)=upper(btrim(gift_code)) and parent_gift_id is null;
 if card.id is null then raise exception 'Gift card not found'; end if;
 perform public.refresh_zero_gift_claims(card.id);
 select * into card from gift_cards where id=card.id;
 select * into receipt from gift_cards where parent_gift_id=card.id and claimed_by=auth.uid();
 if card.claimed_by=auth.uid() then receipt:=card; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title)),'[]') into names from bootcamps where id=any(card.bootcamp_ids);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') into club_names from clubs where id=any(coalesce(card.club_ids,'{}'));
 return to_jsonb(card)||jsonb_build_object('my_claim_id',receipt.id,
   'my_claim_expires_at',receipt.expires_at,'my_claim_released',receipt.claim_released_at is not null,
   'my_claim_expired',coalesce(receipt.expires_at<=now(),false) or receipt.claim_released_at is not null,
   'my_claim_remaining',case when receipt.expires_at<=now() or receipt.claim_released_at is not null then 0 else receipt.remaining_amount end,
   'bootcamps',names,'clubs',club_names,'claims_remaining',greatest(0,card.quantity-card.claimed_count),
   'expired',coalesce(card.expires_at<=now(),false));
end $$;

create or replace function public.get_gift_card_public(gift_code text)
returns jsonb language plpgsql volatile security definer set search_path=public as $$
declare card public.gift_cards;
begin
 select * into card from gift_cards where upper(code)=upper(btrim(gift_code)) and parent_gift_id is null;
 if card.id is null then return jsonb_build_object('found',false); end if;
 perform public.refresh_zero_gift_claims(card.id);
 select * into card from gift_cards where id=card.id;
 return jsonb_build_object('found',true,'code',card.code,'amount',card.amount,'service',card.service,'template_id',card.template_id,'message',card.message,'custom_purpose',card.custom_purpose,
   'status',case when card.expires_at<=now() then 'expired' else card.status end,'quantity',card.quantity,'claims_remaining',greatest(0,card.quantity-card.claimed_count),'expires_at',card.expires_at,
   'claim_window_hours',6,'clubs',(select coalesce(jsonb_agg(c.name),'[]') from clubs c where c.id=any(coalesce(card.club_ids,'{}'))));
end $$;

-- Recycled places must also be included when a creator tops up the gift value.
create or replace function public.update_gift_campaign(
 p_gift uuid,p_amount numeric,p_quantity integer,p_expires_at timestamptz,p_template text,p_service text,
 p_message text default null,p_custom_purpose text default null,p_bootcamp_ids uuid[] default '{}',p_request_id uuid default gen_random_uuid()
) returns public.gift_cards language plpgsql security definer set search_path=public as $$
declare card public.gift_cards; clean_service text:=lower(btrim(coalesce(p_service,''))); scope uuid[]; waiting integer; added integer; cost numeric; balance numeric;
begin
 if auth.uid() is null then raise exception 'Sign in to edit this gift'; end if;
 if p_request_id is null then raise exception 'Missing gift request identifier'; end if;
 perform 1 from profiles where id=auth.uid() for no key update;
 select * into card from gift_cards where id=p_gift and creator_id=auth.uid() and parent_gift_id is null for update;
 if card.id is null then raise exception 'Gift not found'; end if;
 if card.refunded_at is not null or card.status='cancelled' then raise exception 'This gift has been closed and can no longer be edited'; end if;
 perform public.refresh_zero_gift_claims(card.id);
 select * into card from gift_cards where id=p_gift;
 if exists(select 1 from wallet_transactions where reference='gift_edit_'||p_request_id and profile_id=auth.uid()) then return card; end if;
 if p_amount is null or p_amount<>trunc(p_amount) or p_amount>5000000 then raise exception 'Enter a valid whole-wallet-unit amount per person'; end if;
 if p_amount<card.amount then raise exception 'The amount per person can only be increased'; end if;
 if p_quantity is null or p_quantity>10000 then raise exception 'Quantity must be between 1 and 10,000'; end if;
 if p_quantity<card.quantity then raise exception 'Claims can only be increased. Close the gift to recover unclaimed value'; end if;
 if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '366 days' then raise exception 'Choose a future claim-by date within one year'; end if;
 if clean_service='support' then clean_service:='universal'; end if;
 if clean_service='' or clean_service<>all(public.wallet_gift_services()||public.restricted_zero_gift_services()) then raise exception 'Choose a valid gift purpose'; end if;
 if clean_service='custom' and nullif(btrim(p_custom_purpose),'') is null then raise exception 'Describe your custom gift'; end if;
 select coalesce(array_agg(distinct x order by x),'{}') into scope from unnest(coalesce(p_bootcamp_ids,'{}')) x;
 if cardinality(scope)>100 or (cardinality(scope)>0 and clean_service<>'bootcamps') then raise exception 'Bootcamp restrictions only apply to bootcamp gifts'; end if;
 if exists(select 1 from unnest(scope) x where not exists(select 1 from bootcamps b where b.id=x)) then raise exception 'A selected bootcamp is unavailable'; end if;
 if length(coalesce(p_message,''))>280 then raise exception 'Keep the message under 280 characters'; end if;
 if length(coalesce(p_custom_purpose,''))>120 then raise exception 'Keep the custom purpose under 120 characters'; end if;
 waiting:=greatest(0,card.quantity-card.claimed_count); added:=p_quantity-card.quantity;
 cost:=(p_amount-card.amount)*waiting+p_amount*added;
 if cost>0 and card.funding_source='wallet' then
   select coalesce(coins,0) into balance from profiles where id=auth.uid();
   if balance<cost then raise exception 'Add % to your wallet to save these changes',cost-balance; end if;
   perform public.wallet_apply(auth.uid(),'debit',cost,'gift','Zero Gift · edited','gift_edit_'||p_request_id,
     jsonb_build_object('gift_id',card.id,'amount_per_person',p_amount,'previous_amount',card.amount,'quantity',p_quantity,'previous_quantity',card.quantity,
       'topped_up_places',case when p_amount>card.amount then waiting else 0 end,'added_places',added));
 end if;
 update gift_cards set amount=p_amount,quantity=p_quantity,expires_at=p_expires_at,
   template_id=coalesce(nullif(btrim(p_template),''),card.template_id),service=clean_service,
   message=nullif(btrim(coalesce(p_message,'')),''),custom_purpose=case when clean_service='custom' then nullif(btrim(coalesce(p_custom_purpose,'')),'') else null end,
   bootcamp_ids=scope,status=case when p_quantity>claimed_count then 'active' else 'claimed' end
 where id=card.id returning * into card;
 return card;
end $$;
revoke all on function public.update_gift_campaign(uuid,numeric,integer,timestamptz,text,text,text,text,uuid[],uuid) from public,anon;
grant execute on function public.update_gift_campaign(uuid,numeric,integer,timestamptz,text,text,text,text,uuid[],uuid) to authenticated;

create or replace function public.close_gift_campaign(p_gift uuid)
returns numeric language plpgsql security definer set search_path=public as $$
declare card public.gift_cards; refund numeric;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 perform 1 from profiles where id=auth.uid() for no key update;
 select * into card from gift_cards where id=p_gift and creator_id=auth.uid() and parent_gift_id is null for update;
 if card.id is null then raise exception 'Gift not found'; end if;
 perform public.refresh_zero_gift_claims(card.id);
 select * into card from gift_cards where id=p_gift;
 if card.refunded_at is not null or card.status='cancelled' then return 0; end if;
 refund:=case when card.funding_source='wallet' then card.amount*greatest(0,card.quantity-card.claimed_count) else 0 end;
 if refund>0 then perform public.wallet_apply(auth.uid(),'credit',refund,'gift','Unclaimed gift value returned','gift_refund_'||card.id,'{}'); end if;
 update gift_cards set status='cancelled',refunded_at=now() where id=card.id;
 return refund;
end $$;

-- Minute sweep, plus on-demand refresh on reads and claims.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
   execute 'create extension if not exists pg_cron with schema pg_catalog';
 end if;
 if to_regprocedure('cron.schedule(text,text,text)') is not null then
   perform cron.schedule('zero-gift-claim-expiry','* * * * *','select public.refresh_zero_gift_claims();');
 else
   raise notice 'pg_cron unavailable: gift claims expire on reads/claims. Schedule refresh_zero_gift_claims() every minute for background recycling.';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
