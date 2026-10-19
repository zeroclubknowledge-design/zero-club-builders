-- Account-owned, consumable practice supplies. Prices and spending stay on the server.
begin;

create table if not exists public.zero_space_inventory (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item text not null check (item in ('shield', 'focus', 'magnet', 'fuel')),
  quantity integer not null default 0 check (quantity between 0 and 999),
  primary key (profile_id, item)
);
create table if not exists public.zero_space_supply_events (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  item text not null check (item in ('shield', 'focus', 'magnet', 'fuel')),
  action text not null check (action in ('buy', 'use')),
  spent_zp integer not null check (spent_zp >= 0),
  created_at timestamptz not null default now(),
  primary key (profile_id, request_id)
);
alter table public.zero_space_inventory enable row level security;
alter table public.zero_space_supply_events enable row level security;
revoke all on public.zero_space_inventory, public.zero_space_supply_events from anon, authenticated;
grant select on public.zero_space_inventory, public.zero_space_supply_events to authenticated;
drop policy if exists own_space_inventory on public.zero_space_inventory;
create policy own_space_inventory on public.zero_space_inventory for select to authenticated using (profile_id = auth.uid());
drop policy if exists own_space_supply_events on public.zero_space_supply_events;
create policy own_space_supply_events on public.zero_space_supply_events for select to authenticated using (profile_id = auth.uid());

create or replace function public.zero_space_market()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  member public.profiles%rowtype;
  stock jsonb;
begin
  if caller is null then raise exception 'Sign in to open the marketplace'; end if;
  select * into member from public.profiles where id = caller;
  if not found then raise exception 'Account not found'; end if;
  select coalesce(jsonb_object_agg(item, quantity), '{}'::jsonb) into stock
    from public.zero_space_inventory where profile_id = caller;
  return jsonb_build_object('balance', coalesce(member.zp, 0), 'administrator', coalesce(member.is_admin, false),
    'inventory', jsonb_build_object('shield',0,'focus',0,'magnet',0,'fuel',0) || stock);
end;
$$;

create or replace function public.zero_space_supply(p_item text, p_action text, p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  member public.profiles%rowtype;
  previous public.zero_space_supply_events%rowtype;
  price integer;
  stock integer;
begin
  if caller is null then raise exception 'Sign in to use supplies'; end if;
  if p_request is null or p_item is null or p_item not in ('shield','focus','magnet','fuel')
    or p_action is null or p_action not in ('buy','use') then raise exception 'Choose a valid supply action'; end if;
  -- Serializes concurrent purchases/uses, and protects retries after a lost response.
  select * into member from public.profiles where id = caller for update;
  if not found then raise exception 'Account not found'; end if;
  if coalesce(member.account_status, 'active') = 'suspended' then raise exception 'This account cannot use the marketplace'; end if;
  select * into previous from public.zero_space_supply_events where profile_id = caller and request_id = p_request;
  if found then
    if previous.item <> p_item or previous.action <> p_action then raise exception 'This request was already used for another action'; end if;
    return public.zero_space_market();
  end if;
  price := case p_item when 'shield' then 30 when 'fuel' then 20 else 25 end;
  if coalesce(member.is_admin, false) then price := 0; end if;
  if p_action = 'buy' then
    if coalesce(member.zp,0) < price then raise exception 'Not enough Zero Points for this supply'; end if;
    select quantity into stock from public.zero_space_inventory where profile_id = caller and item = p_item;
    if coalesce(stock,0) >= 999 then raise exception 'You already have the maximum of this supply'; end if;
    update public.profiles set zp = coalesce(zp,0) - price where id = caller;
    insert into public.zero_space_inventory(profile_id,item,quantity) values(caller,p_item,1)
      on conflict(profile_id,item) do update set quantity = zero_space_inventory.quantity + 1;
  else
    price := 0;
    update public.zero_space_inventory set quantity = quantity - 1
      where profile_id = caller and item = p_item and quantity > 0;
    if not found then raise exception 'No supplies left. Visit the marketplace before your next run'; end if;
  end if;
  insert into public.zero_space_supply_events(profile_id,request_id,item,action,spent_zp)
    values(caller,p_request,p_item,p_action,price);
  return public.zero_space_market();
end;
$$;

revoke all on function public.zero_space_market() from public, anon;
revoke all on function public.zero_space_supply(text,text,uuid) from public, anon;
grant execute on function public.zero_space_market() to authenticated;
grant execute on function public.zero_space_supply(text,text,uuid) to authenticated;
commit;
