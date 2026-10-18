begin;
-- Funding origin is fixed at creation, so later role changes cannot turn a
-- platform-sponsored gift into a personal wallet refund.
alter table public.gift_cards add column if not exists funding_source text
  not null default 'wallet' check(funding_source in ('wallet','platform'));

create or replace function public.create_gift_campaign(
  gift_amount numeric,gift_template text,gift_service text,gift_quantity integer,gift_expires_at timestamptz,
  gift_bootcamp_ids uuid[] default '{}',gift_message text default null,gift_custom_purpose text default null,p_request_id uuid default gen_random_uuid()
) returns public.gift_cards language plpgsql security definer set search_path=public as $$
declare card public.gift_cards; cost numeric; scope uuid[]; clean_service text:=lower(btrim(gift_service)); sponsored boolean;
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
  sponsored:=coalesce(public.is_zero_club_admin(),false);
  cost:=gift_amount*gift_quantity;
  if not sponsored then
    perform public.wallet_apply(auth.uid(),'debit',cost,'gift','Zero Gift · '||gift_quantity||' claims','gift_campaign_'||p_request_id,jsonb_build_object('quantity',gift_quantity,'amount_per_person',gift_amount));
  end if;
  insert into gift_cards(id,code,creator_id,amount,template_id,service,message,custom_purpose,quantity,expires_at,bootcamp_ids,funding_source)
    values(p_request_id,'ZC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),auth.uid(),gift_amount,coalesce(nullif(gift_template,''),'signature'),clean_service,nullif(btrim(gift_message),''),nullif(btrim(gift_custom_purpose),''),gift_quantity,gift_expires_at,scope,case when sponsored then 'platform' else 'wallet' end)
    returning * into card;
  return card;
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
  -- Platform-funded gifts never create a personal wallet refund.
  refund:=case when card.funding_source='wallet' then card.amount*greatest(0,card.quantity-card.claimed_count) else 0 end;
  if refund>0 then perform wallet_apply(auth.uid(),'credit',refund,'gift','Unclaimed gift value returned','gift_refund_'||card.id,'{}'); end if;
  update gift_cards set status='cancelled',refunded_at=now() where id=card.id;
  return refund;
end $$;

notify pgrst,'reload schema';
commit;
