-- Discounts and coupon codes for store items
alter table public.store_items add column if not exists discount_percent numeric not null default 0;
alter table public.store_items add column if not exists coupon_code text;
alter table public.store_items add column if not exists coupon_discount_percent numeric not null default 0;

alter table public.store_items drop constraint if exists store_items_discount_percent_check;
alter table public.store_items add constraint store_items_discount_percent_check
    check (discount_percent >= 0 and discount_percent <= 90);

alter table public.store_items drop constraint if exists store_items_coupon_discount_percent_check;
alter table public.store_items add constraint store_items_coupon_discount_percent_check
    check (coupon_discount_percent >= 0 and coupon_discount_percent <= 90);

-- Purchase now honours the sale discount automatically and an optional coupon code.
-- Effective price = price × (1 - discount%) × (1 - coupon% when the code matches).
create or replace function public.purchase_store_item(item_id uuid, coupon text default null)
returns json
language plpgsql
security definer
as $$
declare
    v_item store_items%rowtype;
    v_buyer profiles%rowtype;
    v_price numeric;
    v_coupon_applied boolean := false;
begin
    select * into v_item from store_items where id = item_id;
    if not found then
        raise exception 'Item not found';
    end if;

    select * into v_buyer from profiles where id = auth.uid();
    if not found then
        raise exception 'Not authenticated';
    end if;

    if v_buyer.id = v_item.seller_id then
        raise exception 'You cannot buy your own product';
    end if;

    v_price := v_item.price;
    if coalesce(v_item.discount_percent, 0) > 0 then
        v_price := round(v_price * (100 - v_item.discount_percent) / 100);
    end if;
    if coupon is not null
       and v_item.coupon_code is not null
       and upper(trim(coupon)) = upper(v_item.coupon_code)
       and coalesce(v_item.coupon_discount_percent, 0) > 0 then
        v_price := round(v_price * (100 - v_item.coupon_discount_percent) / 100);
        v_coupon_applied := true;
    end if;

    if v_item.price_type = 'XP' then
        if coalesce(v_buyer.xp, 0) < v_price then
            raise exception 'Not enough XP';
        end if;
        update profiles set xp = xp - v_price where id = v_buyer.id;
        update profiles set xp = coalesce(xp, 0) + v_price where id = v_item.seller_id;
    elsif v_item.price_type = 'Coins' then
        if coalesce(v_buyer.coins, 0) < v_price then
            raise exception 'Not enough Coins';
        end if;
        update profiles set coins = coins - v_price where id = v_buyer.id;
        update profiles set coins = coalesce(coins, 0) + v_price where id = v_item.seller_id;
    end if;

    return json_build_object(
        'success', true,
        'file_url', v_item.file_url,
        'paid', v_price,
        'coupon_applied', v_coupon_applied
    );
end;
$$;
