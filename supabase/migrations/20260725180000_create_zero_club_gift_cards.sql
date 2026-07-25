create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null check (amount > 0),
  template_id text not null default 'signature',
  service text not null,
  message text,
  status text not null default 'active' check (status in ('active', 'claimed', 'cancelled')),
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gift_cards_creator_id_idx on public.gift_cards(creator_id);
create index if not exists gift_cards_claimed_by_idx on public.gift_cards(claimed_by);
create index if not exists gift_cards_code_idx on public.gift_cards(code);

alter table public.gift_cards enable row level security;

drop policy if exists "Gift cards are visible to authenticated claimants" on public.gift_cards;
create policy "Gift cards are visible to authenticated claimants"
  on public.gift_cards for select to authenticated
  using (creator_id = auth.uid() or claimed_by = auth.uid());

create or replace function public.get_gift_card(gift_code text)
returns public.gift_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  found_card public.gift_cards;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;

  select * into found_card
  from public.gift_cards
  where upper(code) = upper(trim(gift_code));

  if found_card.id is null then raise exception 'Gift card not found'; end if;
  if found_card.status <> 'active'
    and found_card.creator_id <> auth.uid()
    and found_card.claimed_by <> auth.uid()
  then
    raise exception 'Gift card not found';
  end if;

  return found_card;
end;
$$;

create or replace function public.create_gift_card(
  gift_amount numeric,
  gift_template text,
  gift_service text,
  gift_message text default null
)
returns public.gift_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance numeric;
  generated_code text;
  created_card public.gift_cards;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if gift_amount is null or gift_amount <= 0 then raise exception 'Enter a valid gift amount'; end if;
  if coalesce(trim(gift_service), '') = '' then raise exception 'Choose a service'; end if;

  select coalesce(coins, 0) into current_balance from public.profiles where id = auth.uid() for update;
  if current_balance < gift_amount then raise exception 'Your wallet balance is too low'; end if;

  generated_code := 'ZC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  update public.profiles set coins = coalesce(coins, 0) - gift_amount where id = auth.uid();

  insert into public.gift_cards(code, creator_id, amount, template_id, service, message)
  values (generated_code, auth.uid(), gift_amount, coalesce(nullif(gift_template, ''), 'signature'), gift_service, nullif(trim(gift_message), ''))
  returning * into created_card;

  return created_card;
end;
$$;

create or replace function public.claim_gift_card(gift_code text)
returns public.gift_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_card public.gift_cards;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;

  select * into claimed_card from public.gift_cards
  where upper(code) = upper(trim(gift_code)) for update;

  if claimed_card.id is null then raise exception 'Gift card not found'; end if;
  if claimed_card.status <> 'active' then raise exception 'This gift card has already been claimed'; end if;
  if claimed_card.creator_id = auth.uid() then raise exception 'You cannot claim a gift card you created'; end if;

  update public.gift_cards
  set status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
  where id = claimed_card.id
  returning * into claimed_card;

  return claimed_card;
end;
$$;

grant execute on function public.create_gift_card(numeric, text, text, text) to authenticated;
grant execute on function public.get_gift_card(text) to authenticated;
grant execute on function public.claim_gift_card(text) to authenticated;
