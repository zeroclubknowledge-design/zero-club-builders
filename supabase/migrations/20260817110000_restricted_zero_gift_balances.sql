-- Purpose-bound Zero Gifts.
--
-- Support and Custom gifts still become ordinary wallet money when claimed.
-- Bootcamps, Membership, Zero AI, Tutor Session and Zero Store instead keep a
-- restricted balance that can only be consumed by a matching payment flow.

alter table public.gift_cards
  add column if not exists remaining_amount numeric not null default 0,
  add column if not exists redeemed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gift_cards_remaining_amount_range'
  ) then
    alter table public.gift_cards
      add constraint gift_cards_remaining_amount_range
      check (remaining_amount >= 0 and remaining_amount <= amount);
  end if;
end $$;

create or replace function public.restricted_zero_gift_services()
returns text[]
language sql
immutable
as $$
  select array[
    'bootcamps',
    'membership',
    'zero-ai',
    'tutor-session',
    'zero-store'
  ]::text[]
$$;

-- Previously claimed service gifts were never credited or redeemed. Restore
-- their full face value so the recipient does not lose an existing gift.
update public.gift_cards
set remaining_amount = amount,
    redeemed_at = null
where status = 'claimed'
  and service = any(public.restricted_zero_gift_services())
  and remaining_amount = 0;

create table if not exists public.gift_redemptions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  service text not null,
  amount numeric not null check (amount > 0),
  payment_reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (gift_card_id, payment_reference)
);

create index if not exists gift_redemptions_profile_idx
  on public.gift_redemptions(profile_id, created_at desc);

alter table public.gift_redemptions enable row level security;

drop policy if exists gift_redemptions_select_own on public.gift_redemptions;
create policy gift_redemptions_select_own
  on public.gift_redemptions for select to authenticated
  using (profile_id = auth.uid());

-- Internal balance lookup used by checkout functions.
create or replace function public.zero_gift_balance_for(
  p_profile_id uuid,
  p_service text
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(remaining_amount), 0)
  from public.gift_cards
  where claimed_by = p_profile_id
    and status = 'claimed'
    and service = lower(trim(p_service))
    and remaining_amount > 0
$$;

revoke all on function public.zero_gift_balance_for(uuid, text)
from public, anon, authenticated;

-- Safe client-facing summary. It exposes only the caller's own balance.
create or replace function public.get_my_zero_gift_balance(p_service text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  clean_service text := lower(trim(coalesce(p_service, '')));
  available numeric;
  gift_count integer;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if clean_service <> all(public.restricted_zero_gift_services()) then
    raise exception 'Unsupported Zero Gift service';
  end if;

  select coalesce(sum(remaining_amount), 0), count(*)::integer
  into available, gift_count
  from public.gift_cards
  where claimed_by = caller
    and status = 'claimed'
    and service = clean_service
    and remaining_amount > 0;

  return jsonb_build_object(
    'service', clean_service,
    'available', available,
    'gift_count', gift_count
  );
end;
$$;

revoke all on function public.get_my_zero_gift_balance(text) from public, anon;
grant execute on function public.get_my_zero_gift_balance(text) to authenticated;

-- Internal FIFO redemption. A payment may use several smaller gifts, and a
-- larger gift keeps its unused remainder for the next matching purchase.
create or replace function public.consume_zero_gift(
  p_profile_id uuid,
  p_service text,
  p_amount numeric,
  p_payment_reference text,
  p_metadata jsonb default '{}'::jsonb
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_service text := lower(trim(coalesce(p_service, '')));
  target numeric := greatest(0, coalesce(p_amount, 0));
  consumed numeric := 0;
  take_amount numeric;
  card record;
begin
  if target = 0 then return 0; end if;
  if clean_service <> all(public.restricted_zero_gift_services()) then
    raise exception 'Unsupported Zero Gift service';
  end if;

  for card in
    select id, remaining_amount
    from public.gift_cards
    where claimed_by = p_profile_id
      and status = 'claimed'
      and service = clean_service
      and remaining_amount > 0
    order by claimed_at nulls last, created_at, id
    for update
  loop
    exit when consumed >= target;
    take_amount := least(card.remaining_amount, target - consumed);

    update public.gift_cards
    set remaining_amount = remaining_amount - take_amount,
        redeemed_at = case
          when remaining_amount - take_amount = 0 then now()
          else redeemed_at
        end
    where id = card.id;

    insert into public.gift_redemptions (
      gift_card_id, profile_id, service, amount, payment_reference, metadata
    ) values (
      card.id,
      p_profile_id,
      clean_service,
      take_amount,
      p_payment_reference,
      coalesce(p_metadata, '{}'::jsonb)
    );

    consumed := consumed + take_amount;
  end loop;

  return consumed;
end;
$$;

revoke all on function public.consume_zero_gift(uuid, text, numeric, text, jsonb)
from public, anon, authenticated;

-- Claiming now either credits the normal wallet (Support/Custom) or activates
-- the restricted balance (the five service-specific gifts).
create or replace function public.claim_gift_card(gift_code text)
returns public.gift_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_card public.gift_cards;
  sender_name text;
  recipient_name text;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;

  select * into claimed_card
  from public.gift_cards
  where upper(code) = upper(trim(gift_code))
  for update;

  if claimed_card.id is null then raise exception 'Gift card not found'; end if;
  if claimed_card.status <> 'active' then raise exception 'This gift card has already been claimed'; end if;
  if claimed_card.creator_id = auth.uid() then raise exception 'You cannot claim a gift card you created'; end if;

  update public.gift_cards
  set status = 'claimed',
      claimed_by = auth.uid(),
      claimed_at = now(),
      remaining_amount = case
        when service = any(public.restricted_zero_gift_services()) then amount
        else 0
      end,
      redeemed_at = null
  where id = claimed_card.id
  returning * into claimed_card;

  select coalesce(full_name, username) into sender_name
  from public.profiles where id = claimed_card.creator_id;

  select coalesce(full_name, username) into recipient_name
  from public.profiles where id = auth.uid();

  if claimed_card.service = any(public.wallet_gift_services()) then
    perform public.wallet_apply(
      auth.uid(),
      'credit',
      claimed_card.amount,
      'gift',
      'Gift from ' || coalesce(sender_name, 'a member'),
      'gift_in_' || claimed_card.code,
      jsonb_build_object(
        'gift_code', claimed_card.code,
        'from', claimed_card.creator_id,
        'purpose', claimed_card.custom_purpose
      )
    );
  end if;

  insert into public.notifications (profile_id, actor_id, type, content)
  values (
    claimed_card.creator_id,
    auth.uid(),
    'system',
    coalesce(recipient_name, 'Someone') || ' claimed your Zero Gift of ' || claimed_card.amount
  );

  return claimed_card;
end;
$$;

revoke all on function public.claim_gift_card(text) from public, anon;
grant execute on function public.claim_gift_card(text) to authenticated;

notify pgrst, 'reload schema';
