create table if not exists public.store_items (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    seller_id uuid references public.profiles(id) on delete cascade not null,
    name text not null,
    description text not null,
    price numeric not null default 0,
    price_type text not null check (price_type in ('XP', 'Coins')),
    category text,
    cover_url text,
    file_url text,
    badge text
);

-- Turn on RLS
alter table public.store_items enable row level security;

-- Policies
create policy "Anyone can view store items." on public.store_items
    for select using (true);

create policy "Users can insert their own store items." on public.store_items
    for insert with check (auth.uid() = seller_id);

create policy "Users can update their own store items." on public.store_items
    for update using (auth.uid() = seller_id);

create policy "Users can delete their own store items." on public.store_items
    for delete using (auth.uid() = seller_id);

-- Storage bucket for store products (if not exists)
insert into storage.buckets (id, name, public) 
values ('store_products', 'store_products', true)
on conflict (id) do nothing;

create policy "Anyone can read store products"
    on storage.objects for select
    using ( bucket_id = 'store_products' );

create policy "Authenticated users can upload store products"
    on storage.objects for insert
    with check ( bucket_id = 'store_products' and auth.role() = 'authenticated' );

-- RPC for purchasing a store item
create or replace function public.purchase_store_item(item_id uuid)
returns json
language plpgsql
security definer
as $$
declare
    v_item store_items%rowtype;
    v_buyer profiles%rowtype;
    v_seller profiles%rowtype;
begin
    -- Get the item
    select * into v_item from store_items where id = item_id;
    if not found then
        raise exception 'Item not found';
    end if;

    -- Get the buyer
    select * into v_buyer from profiles where id = auth.uid();
    if not found then
        raise exception 'Not authenticated';
    end if;

    -- Check if buyer has enough funds
    if v_item.price_type = 'XP' then
        if coalesce(v_buyer.xp, 0) < v_item.price then
            raise exception 'Not enough XP';
        end if;
        
        -- Deduct from buyer
        update profiles set xp = xp - v_item.price where id = v_buyer.id;
        
        -- Add to seller
        update profiles set xp = coalesce(xp, 0) + v_item.price where id = v_item.seller_id;
        
    elsif v_item.price_type = 'Coins' then
        if coalesce(v_buyer.coins, 0) < v_item.price then
            raise exception 'Not enough Coins';
        end if;
        
        -- Deduct from buyer
        update profiles set coins = coins - v_item.price where id = v_buyer.id;
        
        -- Add to seller
        update profiles set coins = coalesce(coins, 0) + v_item.price where id = v_item.seller_id;
    end if;

    return json_build_object('success', true, 'file_url', v_item.file_url);
end;
$$;
