-- Zero Gifts: a bootcamp gift can be limited to one or more clubs.
-- Credit then works on any bootcamp in those clubs — including bootcamps added later
-- (a club's bootcamps = the club's own bootcamp + the bootcamps of its cohorts).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='gift_cards' and column_name='club_ids') then
    alter table public.gift_cards add column club_ids uuid[] not null default '{}'::uuid[];
  end if;
end $$;

-- Is this bootcamp one the gift can pay for?
create or replace function public.gift_bootcamp_allowed(p_bootcamp_ids uuid[], p_club_ids uuid[], p_bootcamp text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (coalesce(cardinality(p_bootcamp_ids), 0) = 0 and coalesce(cardinality(p_club_ids), 0) = 0)
    or (p_bootcamp is not null and p_bootcamp = any(coalesce(p_bootcamp_ids, '{}')::text[]))
    or (p_bootcamp is not null and coalesce(cardinality(p_club_ids), 0) > 0 and exists (
          select 1 from public.clubs c
          where c.bootcamp_id::text = p_bootcamp
            and (c.id = any(p_club_ids) or c.parent_club_id = any(p_club_ids))))
$$;

create or replace function public.zero_gift_balance_for_context(p_profile_id uuid, p_service text, p_metadata jsonb DEFAULT '{}'::jsonb)
 returns numeric language sql stable security definer set search_path to 'public' as $function$
 select coalesce(sum(remaining_amount),0) from gift_cards where claimed_by=p_profile_id and status='claimed' and (service=lower(btrim(p_service)) or service='universal' or (service in ('support','custom') and expires_at is not null)) and remaining_amount>0
 and (expires_at is null or expires_at>now())
 and public.gift_bootcamp_allowed(bootcamp_ids, club_ids, p_metadata->>'bootcamp_id')
$function$;

create or replace function public.get_my_zero_gift_balance_v2(p_service text, p_bootcamp_id uuid DEFAULT NULL::uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare available numeric; n integer; expiry timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select coalesce(sum(remaining_amount),0),count(*),min(expires_at) into available,n,expiry from gift_cards where claimed_by=auth.uid() and status='claimed' and (service=lower(btrim(p_service)) or service='universal' or (service in ('support','custom') and expires_at is not null)) and remaining_amount>0
   and (expires_at is null or expires_at>now())
   and public.gift_bootcamp_allowed(bootcamp_ids, club_ids, p_bootcamp_id::text);
 return jsonb_build_object('available',available,'gift_count',n,'next_expiry',expiry);
end $function$;

create or replace function public.consume_zero_gift(p_profile_id uuid, p_service text, p_amount numeric, p_payment_reference text, p_metadata jsonb DEFAULT '{}'::jsonb)
 returns numeric language plpgsql security definer set search_path to 'public' as $function$
declare card record; target numeric:=greatest(0,coalesce(p_amount,0)); used numeric:=0; take numeric; previous numeric;
begin
 select coalesce(sum(amount),0) into previous from gift_redemptions where profile_id=p_profile_id and payment_reference=p_payment_reference;
 if previous>0 then
   if previous<>target then raise exception 'Payment reference already used'; end if;
   return previous;
 end if;
 for card in select id,remaining_amount from gift_cards where claimed_by=p_profile_id and status='claimed' and (service=lower(btrim(p_service)) or service='universal' or (service in ('support','custom') and expires_at is not null)) and remaining_amount>0
   and (expires_at is null or expires_at>now())
   and public.gift_bootcamp_allowed(bootcamp_ids, club_ids, p_metadata->>'bootcamp_id')
   order by expires_at nulls last,claimed_at nulls last,created_at,id for update loop
   exit when used>=target;
   take:=least(card.remaining_amount,target-used);
   update gift_cards set remaining_amount=remaining_amount-take,redeemed_at=case when remaining_amount=take then now() else redeemed_at end where id=card.id;
   insert into gift_redemptions(gift_card_id,profile_id,service,amount,payment_reference,metadata) values(card.id,p_profile_id,p_service,take,p_payment_reference,coalesce(p_metadata,'{}'));
   used:=used+take;
 end loop;
 return used;
end $function$;

-- Claims copy the club scope too.
create or replace function public.claim_gift_card(gift_code text)
 returns gift_cards language plpgsql security definer set search_path to 'public' as $function$
declare campaign public.gift_cards; receipt public.gift_cards;
begin
  if auth.uid() is null then raise exception 'Sign in to claim this gift'; end if;
  perform 1 from profiles where id=auth.uid() for no key update;
  select * into campaign from gift_cards where upper(code)=upper(btrim(gift_code)) and parent_gift_id is null for update;
  if campaign.id is null then raise exception 'Gift card not found'; end if;
  if campaign.expires_at<=now() then raise exception 'This gift has expired'; end if;
  select * into receipt from gift_cards where parent_gift_id=campaign.id and claimed_by=auth.uid();
  if receipt.id is not null then return receipt; end if;
  if campaign.claimed_by=auth.uid() then return campaign; end if;
  if campaign.creator_id=auth.uid() then raise exception 'You cannot claim your own gift'; end if;
  if campaign.status<>'active' or campaign.claimed_count>=campaign.quantity then raise exception 'All claims for this gift have been taken'; end if;
  insert into gift_cards(code,creator_id,amount,template_id,service,message,custom_purpose,status,claimed_by,claimed_at,remaining_amount,parent_gift_id,bootcamp_ids,club_ids,claimed_count,expires_at)
    values('GC-'||replace(gen_random_uuid()::text,'-',''),campaign.creator_id,campaign.amount,campaign.template_id,campaign.service,campaign.message,campaign.custom_purpose,'claimed',auth.uid(),now(),case when campaign.expires_at is not null or campaign.service=any(public.restricted_zero_gift_services()) then campaign.amount else 0 end,campaign.id,campaign.bootcamp_ids,coalesce(campaign.club_ids,'{}'),1,campaign.expires_at)
    returning * into receipt;
  update gift_cards set claimed_count=claimed_count+1,status=case when claimed_count+1>=quantity then 'claimed' else 'active' end where id=campaign.id;
  if campaign.expires_at is null and campaign.service=any(public.wallet_gift_services()) then
    perform public.wallet_apply(auth.uid(),'credit',campaign.amount,'gift','Claimed Zero Gift','gift_claim_'||receipt.id,jsonb_build_object('gift_code',campaign.code,'gift_id',campaign.id));
  end if;
  insert into notifications(profile_id,actor_id,type,content) values(campaign.creator_id,auth.uid(),'system',
    coalesce((select coalesce(nullif(btrim(full_name),''),username) from profiles where id=auth.uid()),'A member')||' claimed your Zero Gift ('||(campaign.claimed_count+1)||' of '||campaign.quantity||' claims).');
  return receipt;
end $function$;

-- Set (or clear) the clubs a bootcamp gift is limited to. Creator only; also updates claimed copies.
create or replace function public.set_gift_club_scope(p_gift uuid, p_club_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare card public.gift_cards; scope uuid[];
begin
  if auth.uid() is null then raise exception 'Sign in to edit this gift'; end if;
  select * into card from public.gift_cards where id = p_gift and creator_id = auth.uid() and parent_gift_id is null for update;
  if card.id is null then raise exception 'Gift not found'; end if;
  if card.status = 'cancelled' or card.refunded_at is not null then raise exception 'This gift has been closed'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into scope from unnest(coalesce(p_club_ids, '{}')) x;
  if cardinality(scope) > 20 then raise exception 'Choose up to 20 clubs'; end if;
  if cardinality(scope) > 0 and card.service <> 'bootcamps' then raise exception 'Club limits only apply to bootcamp gifts'; end if;
  if exists (select 1 from unnest(scope) x where not exists (select 1 from public.clubs c where c.id = x and c.parent_club_id is null)) then
    raise exception 'A selected club is unavailable';
  end if;
  update public.gift_cards set club_ids = scope where id = card.id or parent_gift_id = card.id;
  return jsonb_build_object('ok', true, 'club_ids', to_jsonb(scope));
end $$;
revoke all on function public.set_gift_club_scope(uuid, uuid[]) from public, anon;
grant execute on function public.set_gift_club_scope(uuid, uuid[]) to authenticated;
revoke all on function public.gift_bootcamp_allowed(uuid[], uuid[], text) from public, anon;
grant execute on function public.gift_bootcamp_allowed(uuid[], uuid[], text) to authenticated;

-- The gift page lists the clubs alongside the bootcamps.
create or replace function public.get_gift_card_v2(gift_code text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare card public.gift_cards; receipt uuid; credit numeric; names jsonb; club_names jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view this gift'; end if;
  select * into card from gift_cards where upper(code)=upper(btrim(gift_code)) and parent_gift_id is null;
  if card.id is null then raise exception 'Gift card not found'; end if;
  select id,remaining_amount into receipt,credit from gift_cards where parent_gift_id=card.id and claimed_by=auth.uid();
  if card.claimed_by=auth.uid() then receipt:=card.id; credit:=card.remaining_amount; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title)),'[]') into names from bootcamps where id=any(card.bootcamp_ids);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') into club_names from clubs where id=any(coalesce(card.club_ids,'{}'));
  return to_jsonb(card)||jsonb_build_object('my_claim_id',receipt,'my_claim_remaining',case when card.expires_at<=now() then 0 else credit end,'bootcamps',names,'clubs',club_names,'claims_remaining',greatest(0,card.quantity-card.claimed_count),'expired',coalesce(card.expires_at<=now(),false));
end $function$;

create or replace function public.get_gift_card_public(gift_code text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare card public.gift_cards;
begin
 select * into card from gift_cards where upper(code)=upper(btrim(gift_code)) and parent_gift_id is null;
 if card.id is null then return jsonb_build_object('found',false); end if;
 return jsonb_build_object('found',true,'code',card.code,'amount',card.amount,'service',card.service,'template_id',card.template_id,'message',card.message,'custom_purpose',card.custom_purpose,
   'status',case when card.expires_at<=now() then 'expired' else card.status end,'quantity',card.quantity,'claims_remaining',greatest(0,card.quantity-card.claimed_count),'expires_at',card.expires_at,
   'clubs',(select coalesce(jsonb_agg(c.name),'[]') from clubs c where c.id=any(coalesce(card.club_ids,'{}'))));
end $function$;

-- Applied as a second migration (zero_gifts_club_scope_wrappers):
-- create_club_gift_campaign(..., gift_club_ids) = create_gift_campaign + set_gift_club_scope in one transaction.
-- update_club_gift_campaign(..., p_club_ids)    = update_gift_campaign + set_gift_club_scope (cleared when not a bootcamp gift).
-- Trigger gift_cards_club_scope_guard clears club_ids on any gift whose service isn't 'bootcamps'.
-- See the Supabase migration history for the exact bodies.
