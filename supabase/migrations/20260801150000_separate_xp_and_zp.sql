-- Separate spendable Zero Points (ZP) from non-transferable experience (XP).
-- Existing XP balances were used as currency, so preserve them by renaming the
-- column to ZP and create a fresh XP balance for reputation and levels.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'xp'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'zp'
  ) then
    alter table public.profiles rename column xp to zp;
  end if;
end $$;

alter table public.profiles add column if not exists zp integer not null default 0;
alter table public.profiles add column if not exists xp integer not null default 0;

alter table public.profiles drop constraint if exists profiles_zp_non_negative;
alter table public.profiles add constraint profiles_zp_non_negative check (zp >= 0);
alter table public.profiles drop constraint if exists profiles_xp_non_negative;
alter table public.profiles add constraint profiles_xp_non_negative check (xp >= 0);

-- Existing point-priced Store listings now use ZP.
alter table public.store_items drop constraint if exists store_items_price_type_check;
update public.store_items set price_type = 'ZP' where price_type = 'XP';
alter table public.store_items add constraint store_items_price_type_check
  check (price_type in ('ZP', 'Coins'));

create or replace function public.transfer_zp(recipient uuid, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sender uuid := auth.uid();
begin
  if sender is null then raise exception 'Not authenticated'; end if;
  if amount is null or amount <= 0 then raise exception 'Enter a valid ZP amount'; end if;
  if recipient = sender then raise exception 'You cannot send ZP to yourself'; end if;

  update public.profiles
  set zp = zp - amount
  where id = sender and zp >= amount;
  if not found then raise exception 'Insufficient ZP balance'; end if;

  update public.profiles
  set zp = zp + amount
  where id = recipient;
  if not found then raise exception 'Recipient not found'; end if;
end;
$$;

revoke all on function public.transfer_zp(uuid, integer) from public;
grant execute on function public.transfer_zp(uuid, integer) to authenticated;

-- Keep old clients from transferring the new reputation-only XP balance.
create or replace function public.transfer_xp(recipient uuid, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'XP represents experience and cannot be transferred. Send ZP instead.';
end;
$$;

revoke all on function public.transfer_xp(uuid, integer) from public;
grant execute on function public.transfer_xp(uuid, integer) to authenticated;

-- Referral incentives are spendable points, not experience.
create or replace function public.claim_referral_reward(referrer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if referrer = caller then raise exception 'Invalid referrer'; end if;

  update public.profiles
  set zp = zp + 200, referral_code_used = null
  where id = caller
    and referral_code_used is not null
    and referral_code_used = (
      select referral_code from public.profiles where id = referrer
    );
  if not found then raise exception 'No referral reward to claim'; end if;

  update public.profiles set zp = zp + 200 where id = referrer;
end;
$$;

create or replace function public.purchase_store_item(item_id uuid, coupon text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.store_items%rowtype;
  buyer public.profiles%rowtype;
  effective_price numeric;
  coupon_applied boolean := false;
begin
  select * into item from public.store_items where id = item_id;
  if not found then raise exception 'Item not found'; end if;

  select * into buyer from public.profiles where id = auth.uid();
  if not found then raise exception 'Not authenticated'; end if;
  if buyer.id = item.seller_id then raise exception 'You cannot buy your own product'; end if;

  effective_price := item.price;
  if coalesce(item.discount_percent, 0) > 0 then
    effective_price := round(effective_price * (100 - item.discount_percent) / 100);
  end if;
  if coupon is not null
    and item.coupon_code is not null
    and upper(trim(coupon)) = upper(item.coupon_code)
    and coalesce(item.coupon_discount_percent, 0) > 0
  then
    effective_price := round(effective_price * (100 - item.coupon_discount_percent) / 100);
    coupon_applied := true;
  end if;

  if item.price_type = 'ZP' then
    if coalesce(buyer.zp, 0) < effective_price then raise exception 'Not enough ZP'; end if;
    update public.profiles set zp = zp - effective_price where id = buyer.id;
    update public.profiles set zp = coalesce(zp, 0) + effective_price where id = item.seller_id;
  elsif item.price_type = 'Coins' then
    if coalesce(buyer.coins, 0) < effective_price then raise exception 'Wallet balance is too low'; end if;
    update public.profiles set coins = coins - effective_price where id = buyer.id;
    update public.profiles set coins = coalesce(coins, 0) + effective_price where id = item.seller_id;
  else
    raise exception 'Unsupported payment type';
  end if;

  return json_build_object(
    'success', true,
    'file_url', item.file_url,
    'paid', effective_price,
    'coupon_applied', coupon_applied
  );
end;
$$;

grant execute on function public.purchase_store_item(uuid, text) to authenticated;

