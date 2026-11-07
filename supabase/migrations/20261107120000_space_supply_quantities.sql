begin;
alter table public.zero_space_supply_events add column if not exists quantity integer not null default 1 check (quantity between 1 and 999);
create or replace function public.zero_space_supply(p_item text, p_action text, p_request uuid, p_quantity integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  member public.profiles%rowtype;
  previous public.zero_space_supply_events%rowtype;
  price integer;
  stock integer;
begin
  if caller is null then raise exception 'Sign in to use supplies'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 or (p_action = 'use' and p_quantity <> 1) then raise exception 'Choose a quantity between 1 and 999; activate one supply at a time'; end if;
  if p_request is null or p_item is null or p_item not in ('shield','focus','magnet','fuel','enhancer2','enhancer3','enhancer5')
    or p_action is null or p_action not in ('buy','use') then raise exception 'Choose a valid supply action'; end if;
  -- Serializes concurrent purchases/uses, and protects retries after a lost response.
  select * into member from public.profiles where id = caller for update;
  if not found then raise exception 'Account not found'; end if;
  if coalesce(member.account_status, 'active') = 'suspended' then raise exception 'This account cannot use the marketplace'; end if;
  select * into previous from public.zero_space_supply_events where profile_id = caller and request_id = p_request;
  if found then
    if previous.item <> p_item or previous.action <> p_action or previous.quantity <> p_quantity then raise exception 'This request was already used for another action'; end if;
    return public.zero_space_market();
  end if;
  price := case p_item when 'shield' then 30 when 'fuel' then 20 when 'enhancer2' then 40 when 'enhancer3' then 65 when 'enhancer5' then 100 else 25 end;
  if coalesce(member.is_admin, false) then price := 0; end if;
  price := price * p_quantity;
  if p_action = 'buy' then
    if coalesce(member.zp,0) < price then raise exception 'Not enough Zero Points for this supply'; end if;
    select quantity into stock from public.zero_space_inventory where profile_id = caller and item = p_item;
    if coalesce(stock,0) + p_quantity > 999 then raise exception 'You already have the maximum of this supply'; end if;
    update public.profiles set zp = coalesce(zp,0) - price where id = caller;
    insert into public.zero_space_inventory(profile_id,item,quantity) values(caller,p_item,p_quantity)
      on conflict(profile_id,item) do update set quantity = zero_space_inventory.quantity + p_quantity;
  else
    price := 0;
    update public.zero_space_inventory set quantity = quantity - 1
      where profile_id = caller and item = p_item and quantity > 0;
    if not found then raise exception 'No supplies left. Visit the marketplace before your next run'; end if;
  end if;
  insert into public.zero_space_supply_events(profile_id,request_id,item,action,spent_zp,quantity)
    values(caller,p_request,p_item,p_action,price,p_quantity);
  return public.zero_space_market();
end;
$$;

-- Older clients still buy/use one item through the existing signature.
create or replace function public.zero_space_supply(p_item text,p_action text,p_request uuid)
returns jsonb language sql security definer set search_path=public as $$
  select public.zero_space_supply(p_item,p_action,p_request,1);
$$;
revoke all on function public.zero_space_supply(text,text,uuid,integer) from public,anon;
grant execute on function public.zero_space_supply(text,text,uuid,integer) to authenticated;
revoke all on function public.zero_space_supply(text,text,uuid) from public,anon;
grant execute on function public.zero_space_supply(text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
