begin;
-- Some deployed databases have the original gift schema but not the later
-- restricted-balance migration. Install its storage before defining queries.
-- Backfill only when adding the balance column: reruns must never refill gifts.
do $$
declare needs_balance boolean;
begin
  select not exists (
    select 1 from pg_attribute
    where attrelid='public.gift_cards'::regclass
      and attname='remaining_amount' and not attisdropped
  ) into needs_balance;
  alter table public.gift_cards
    add column if not exists remaining_amount numeric not null default 0,
    add column if not exists redeemed_at timestamptz,
    add column if not exists custom_purpose text;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.gift_cards'::regclass
      and conname='gift_cards_remaining_amount_range'
  ) then
    alter table public.gift_cards add constraint gift_cards_remaining_amount_range
      check (remaining_amount>=0 and remaining_amount<=amount);
  end if;
  if needs_balance then
    update public.gift_cards set remaining_amount=amount
    where status='claimed' and service in ('bootcamps','membership','zero-ai','tutor-session','zero-store');
  end if;
end $$;
create or replace function public.wallet_gift_services() returns text[]
language sql immutable as $$select array['support','custom']::text[]$$;
create table if not exists public.gift_redemptions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  service text not null,
  amount numeric not null check(amount>0),
  payment_reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(gift_card_id,payment_reference)
);
create index if not exists gift_redemptions_profile_idx
  on public.gift_redemptions(profile_id,created_at desc);
alter table public.gift_redemptions enable row level security;
drop policy if exists gift_redemptions_select_own on public.gift_redemptions;
create policy gift_redemptions_select_own on public.gift_redemptions
  for select to authenticated using(profile_id=auth.uid());
alter table public.gift_cards
  add column if not exists quantity integer not null default 1 check(quantity between 1 and 10000),
  add column if not exists claimed_count integer not null default 0 check(claimed_count>=0),
  add column if not exists expires_at timestamptz,
  add column if not exists bootcamp_ids uuid[] not null default '{}',
  add column if not exists parent_gift_id uuid references public.gift_cards(id),
  add column if not exists refunded_at timestamptz;
create unique index if not exists gift_card_claim_once_idx on public.gift_cards(parent_gift_id,claimed_by) where parent_gift_id is not null;
create or replace function public.restricted_zero_gift_services() returns text[] language sql immutable as $$select array['bootcamps','membership','zero-ai','tutor-session','zero-store','universal']::text[]$$;
update public.gift_cards set claimed_count=1 where status='claimed' and claimed_by is not null and parent_gift_id is null;

create or replace function public.create_gift_campaign(
  gift_amount numeric,gift_template text,gift_service text,gift_quantity integer,gift_expires_at timestamptz,
  gift_bootcamp_ids uuid[] default '{}',gift_message text default null,gift_custom_purpose text default null,p_request_id uuid default gen_random_uuid()
) returns public.gift_cards language plpgsql security definer set search_path=public as $$
declare card public.gift_cards; cost numeric; scope uuid[]; clean_service text:=lower(btrim(gift_service));
begin
  if auth.uid() is null then raise exception 'Sign in to create a gift'; end if;
  if clean_service='support' then clean_service:='universal'; end if;
  if gift_amount is null or gift_amount<=0 or gift_amount<>trunc(gift_amount) or gift_amount>5000000 then raise exception 'Enter a valid whole-wallet-unit amount per person'; end if;
  if gift_quantity is null or gift_quantity<1 or gift_quantity>10000 then raise exception 'Quantity must be between 1 and 10,000'; end if;
  if gift_expires_at is null or gift_expires_at<=now() or gift_expires_at>now()+interval '366 days' then raise exception 'Choose a future expiry within one year'; end if;
  if clean_service is null or clean_service<>all(public.wallet_gift_services()||public.restricted_zero_gift_services()) then raise exception 'Choose a valid gift purpose'; end if;
  if clean_service='custom' and nullif(btrim(gift_custom_purpose),'') is null then raise exception 'Describe your custom gift'; end if;
  select coalesce(array_agg(distinct id order by id),'{}') into scope from unnest(coalesce(gift_bootcamp_ids,'{}')) id;
  if cardinality(scope)>100 or (cardinality(scope)>0 and clean_service<>'bootcamps') then raise exception 'Bootcamp restrictions only apply to bootcamp gifts'; end if;
  if exists(select 1 from unnest(scope) id where not exists(select 1 from bootcamps b where b.id=id)) then raise exception 'A selected bootcamp is unavailable'; end if;
  perform 1 from profiles where id=auth.uid() for no key update;
  -- Request-derived IDs make a retried creation return the original funded card.
  if p_request_id is null then raise exception 'Missing gift request identifier'; end if;
  select * into card from gift_cards where id=p_request_id;
  if card.id is not null then
    if card.creator_id<>auth.uid() or card.parent_gift_id is not null or card.amount<>gift_amount or card.quantity<>gift_quantity or card.service<>clean_service or card.expires_at<>gift_expires_at or card.bootcamp_ids<>scope then raise exception 'This gift request has already been used'; end if;
    return card;
  end if;
  cost:=gift_amount*gift_quantity;
  perform public.wallet_apply(auth.uid(),'debit',cost,'gift','Zero Gift · '||gift_quantity||' claims','gift_campaign_'||p_request_id,jsonb_build_object('quantity',gift_quantity,'amount_per_person',gift_amount));
  insert into gift_cards(id,code,creator_id,amount,template_id,service,message,custom_purpose,quantity,expires_at,bootcamp_ids)
    values(p_request_id,'ZC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),auth.uid(),gift_amount,coalesce(nullif(gift_template,''),'signature'),clean_service,nullif(btrim(gift_message),''),nullif(btrim(gift_custom_purpose),''),gift_quantity,gift_expires_at,scope)
    returning * into card;
  return card;
end $$;

create or replace function public.claim_gift_card(gift_code text)
returns public.gift_cards language plpgsql security definer set search_path=public as $$
declare campaign public.gift_cards; receipt public.gift_cards;
begin
  if auth.uid() is null then raise exception 'Sign in to claim this gift'; end if;
  perform 1 from profiles where id=auth.uid() for no key update;
  select * into campaign from gift_cards where upper(code)=upper(btrim(gift_code)) and parent_gift_id is null for update;
  if campaign.id is null then raise exception 'Gift card not found'; end if;
  if campaign.expires_at<=now() then raise exception 'This gift has expired'; end if;
  -- Returning the receipt is safe on retries and never grants a second claim.
  select * into receipt from gift_cards where parent_gift_id=campaign.id and claimed_by=auth.uid();
  if receipt.id is not null then return receipt; end if;
  if campaign.claimed_by=auth.uid() then return campaign; end if;
  if campaign.creator_id=auth.uid() then raise exception 'You cannot claim your own gift'; end if;
  if campaign.status<>'active' or campaign.claimed_count>=campaign.quantity then raise exception 'All claims for this gift have been taken'; end if;
  insert into gift_cards(code,creator_id,amount,template_id,service,message,custom_purpose,status,claimed_by,claimed_at,remaining_amount,parent_gift_id,bootcamp_ids,claimed_count,expires_at)
    values('GC-'||replace(gen_random_uuid()::text,'-',''),campaign.creator_id,campaign.amount,campaign.template_id,campaign.service,campaign.message,campaign.custom_purpose,'claimed',auth.uid(),now(),case when campaign.expires_at is not null or campaign.service=any(public.restricted_zero_gift_services()) then campaign.amount else 0 end,campaign.id,campaign.bootcamp_ids,1,campaign.expires_at)
    returning * into receipt;
  update gift_cards set claimed_count=claimed_count+1,status=case when claimed_count+1>=quantity then 'claimed' else 'active' end where id=campaign.id;
  if campaign.expires_at is null and campaign.service=any(public.wallet_gift_services()) then
    perform public.wallet_apply(auth.uid(),'credit',campaign.amount,'gift','Claimed Zero Gift','gift_claim_'||receipt.id,jsonb_build_object('gift_code',campaign.code,'gift_id',campaign.id));
  end if;
  insert into notifications(profile_id,actor_id,type,content) values(campaign.creator_id,auth.uid(),'system',
    coalesce((select coalesce(nullif(btrim(full_name),''),username) from profiles where id=auth.uid()),'A member')||' claimed your Zero Gift ('||(campaign.claimed_count+1)||' of '||campaign.quantity||' claims).');
  return receipt;
end $$;

create or replace function public.get_gift_card_v2(gift_code text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare card public.gift_cards; receipt uuid; credit numeric; names jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view this gift'; end if;
  select * into card from gift_cards where upper(code)=upper(btrim(gift_code)) and parent_gift_id is null;
  if card.id is null then raise exception 'Gift card not found'; end if;
  select id,remaining_amount into receipt,credit from gift_cards where parent_gift_id=card.id and claimed_by=auth.uid();
  if card.claimed_by=auth.uid() then receipt:=card.id; credit:=card.remaining_amount; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title)),'[]') into names from bootcamps where id=any(card.bootcamp_ids);
  return to_jsonb(card)||jsonb_build_object('my_claim_id',receipt,'my_claim_remaining',case when card.expires_at<=now() then 0 else credit end,'bootcamps',names,'claims_remaining',greatest(0,card.quantity-card.claimed_count),'expired',coalesce(card.expires_at<=now(),false));
end $$;

create or replace function public.close_gift_campaign(p_gift uuid)
returns numeric language plpgsql security definer set search_path=public as $$
declare card public.gift_cards; refund numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform 1 from profiles where id=auth.uid() for no key update;
  select * into card from gift_cards where id=p_gift and creator_id=auth.uid() and parent_gift_id is null for update;
  if card.id is null then raise exception 'Gift not found'; end if;
  if card.refunded_at is not null or card.status in ('cancelled','claimed') then return 0; end if;
  refund:=card.amount*greatest(0,card.quantity-card.claimed_count);
  if refund>0 then perform wallet_apply(auth.uid(),'credit',refund,'gift','Unclaimed gift value returned','gift_refund_'||card.id,'{}'); end if;
  update gift_cards set status='cancelled',refunded_at=now() where id=card.id;
  return refund;
end $$;

create or replace function public.zero_gift_balance_for_context(p_profile_id uuid,p_service text,p_metadata jsonb default '{}')
returns numeric language sql stable security definer set search_path=public as $$
 select coalesce(sum(remaining_amount),0) from gift_cards where claimed_by=p_profile_id and status='claimed' and (service=lower(btrim(p_service)) or service='universal' or (service in ('support','custom') and expires_at is not null)) and remaining_amount>0
 and (expires_at is null or expires_at>now())
 and (cardinality(bootcamp_ids)=0 or (p_metadata->>'bootcamp_id')=any(bootcamp_ids::text[]))
$$;
create or replace function public.zero_gift_balance_for(p_profile_id uuid,p_service text)
returns numeric language sql stable security definer set search_path=public as $$
 select public.zero_gift_balance_for_context(p_profile_id,p_service,'{}')
$$;
create or replace function public.get_my_zero_gift_balance_v2(p_service text,p_bootcamp_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare available numeric; n integer; expiry timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select coalesce(sum(remaining_amount),0),count(*),min(expires_at) into available,n,expiry from gift_cards where claimed_by=auth.uid() and status='claimed' and (service=lower(btrim(p_service)) or service='universal' or (service in ('support','custom') and expires_at is not null)) and remaining_amount>0
   and (expires_at is null or expires_at>now())
   and (cardinality(bootcamp_ids)=0 or p_bootcamp_id=any(bootcamp_ids));
 return jsonb_build_object('available',available,'gift_count',n,'next_expiry',expiry);
end $$;
create or replace function public.get_my_zero_gift_balance(p_service text)
returns jsonb language sql stable security definer set search_path=public as $$
 select public.get_my_zero_gift_balance_v2(p_service,null)
$$;
create or replace function public.consume_zero_gift(p_profile_id uuid,p_service text,p_amount numeric,p_payment_reference text,p_metadata jsonb default '{}')
returns numeric language plpgsql security definer set search_path=public as $$
declare card record; target numeric:=greatest(0,coalesce(p_amount,0)); used numeric:=0; take numeric; previous numeric;
begin
 select coalesce(sum(amount),0) into previous from gift_redemptions where profile_id=p_profile_id and payment_reference=p_payment_reference;
 if previous>0 then
   if previous<>target then raise exception 'Payment reference already used'; end if;
   return previous;
 end if;
 for card in select id,remaining_amount from gift_cards where claimed_by=p_profile_id and status='claimed' and (service=lower(btrim(p_service)) or service='universal' or (service in ('support','custom') and expires_at is not null)) and remaining_amount>0
   and (expires_at is null or expires_at>now())
   and (cardinality(bootcamp_ids)=0 or (p_metadata->>'bootcamp_id')=any(bootcamp_ids::text[]))
   order by expires_at nulls last,claimed_at nulls last,created_at,id for update loop
   exit when used>=target;
   take:=least(card.remaining_amount,target-used);
   update gift_cards set remaining_amount=remaining_amount-take,redeemed_at=case when remaining_amount=take then now() else redeemed_at end where id=card.id;
   insert into gift_redemptions(gift_card_id,profile_id,service,amount,payment_reference,metadata) values(card.id,p_profile_id,p_service,take,p_payment_reference,coalesce(p_metadata,'{}'));
   used:=used+take;
 end loop;
 return used;
end $$;
-- Every existing integrated checkout passes metadata through this primitive.
-- Scope the balance lookup as well as consumption; never quote unusable credit.
create table if not exists public.zero_gift_payment_receipts(
 profile_id uuid not null references public.profiles(id),reference text not null,
 service text not null,total numeric not null,metadata jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(profile_id,reference)
);
alter table public.zero_gift_payment_receipts enable row level security;
revoke all on public.zero_gift_payment_receipts from public,anon,authenticated;
create or replace function public.fund_zero_service_payment(p_profile_id uuid,p_service text,p_total numeric,p_apply_gift boolean,p_source text,p_description text,p_reference text,p_metadata jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare total numeric:=greatest(0,coalesce(p_total,0)); balance numeric; available numeric:=0; used numeric:=0; due numeric; receipt public.zero_gift_payment_receipts; result jsonb;
begin
 select coalesce(coins,0) into balance from profiles where id=p_profile_id for no key update;
 if not found then raise exception 'Profile not found'; end if;
 if nullif(p_reference,'') is null then raise exception 'Missing payment reference'; end if;
 select * into receipt from zero_gift_payment_receipts where profile_id=p_profile_id and reference=p_reference;
 if found then
   if receipt.service<>p_service or receipt.total<>total or receipt.metadata<>coalesce(p_metadata,'{}') then raise exception 'Payment reference already used'; end if;
   return receipt.result;
 end if;
 if p_apply_gift then available:=zero_gift_balance_for_context(p_profile_id,p_service,p_metadata); end if;
 used:=least(total,available); due:=total-used;
 if balance<due then return jsonb_build_object('status','insufficient_funds','amount',total,'gift_available',available,'gift_applied',used,'wallet_due',due,'balance',balance,'shortfall',due-balance); end if;
 if used>0 and consume_zero_gift(p_profile_id,p_service,used,p_reference,p_metadata)<>used then raise exception 'Gift balance changed. Please retry'; end if;
 if due>0 then balance:=wallet_apply(p_profile_id,'debit',due,p_source,p_description,p_reference||':wallet',coalesce(p_metadata,'{}')||jsonb_build_object('zero_gift_applied',used,'total_price',total)); end if;
 result:=jsonb_build_object('status','paid','amount',total,'gift_applied',used,'wallet_charged',due,'balance',balance);
 insert into zero_gift_payment_receipts(profile_id,reference,service,total,metadata,result) values(p_profile_id,p_reference,p_service,total,coalesce(p_metadata,'{}'),result);
 return result;
end $$;

create or replace function public.get_gift_card_public(gift_code text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare card public.gift_cards;
begin
 select * into card from gift_cards where upper(code)=upper(btrim(gift_code)) and parent_gift_id is null;
 if card.id is null then return jsonb_build_object('found',false); end if;
 return jsonb_build_object('found',true,'code',card.code,'amount',card.amount,'service',card.service,'template_id',card.template_id,'message',card.message,'custom_purpose',card.custom_purpose,
   'status',case when card.expires_at<=now() then 'expired' else card.status end,'quantity',card.quantity,'claims_remaining',greatest(0,card.quantity-card.claimed_count),'expires_at',card.expires_at);
end $$;
revoke all on function public.zero_gift_balance_for_context(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.zero_gift_balance_for(uuid,text),public.consume_zero_gift(uuid,text,numeric,text,jsonb),public.fund_zero_service_payment(uuid,text,numeric,boolean,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.create_gift_campaign(numeric,text,text,integer,timestamptz,uuid[],text,text,uuid),public.get_gift_card_v2(text),public.close_gift_campaign(uuid),public.get_my_zero_gift_balance_v2(text,uuid) from public,anon;
grant execute on function public.create_gift_campaign(numeric,text,text,integer,timestamptz,uuid[],text,text,uuid),public.get_gift_card_v2(text),public.close_gift_campaign(uuid),public.get_my_zero_gift_balance_v2(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
