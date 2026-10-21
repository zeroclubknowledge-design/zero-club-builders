-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp via Supabase MCP (migration "edit_gift_campaign").
-- Kept here as a record; do not re-run. Tested in a rolled-back transaction: lowering the
-- amount or claims is refused; raising 1,000->1,500 with 2 places waiting plus 2 new places
-- charged exactly 4,000; editing only details charged nothing.

-- Edit a Zero Card gift after sending it.
--
-- Everything about the card can change except going down in value:
--   * amount per person and number of claims: increase only;
--   * design, message, purpose (and bootcamp scope), claim-by date: editable.
-- People who already claimed keep exactly what they claimed (their own copy
-- holds its amount, purpose and expiry). Only unclaimed places change.
--
-- Cost of an edit (wallet-funded cards; sponsored cards are free):
--   (new amount - old amount) × places still unclaimed   -- top up waiting places
-- + new amount × added places                            -- fund new places
-- Charged once per request id, so a retried save never charges twice.
-- An expired card that was never closed can be given a new date, which
-- reopens it; a closed (refunded) card cannot be edited.
create or replace function public.update_gift_campaign(
  p_gift uuid,
  p_amount numeric,
  p_quantity integer,
  p_expires_at timestamptz,
  p_template text,
  p_service text,
  p_message text default null,
  p_custom_purpose text default null,
  p_bootcamp_ids uuid[] default '{}'::uuid[],
  p_request_id uuid default gen_random_uuid()
)
returns public.gift_cards
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  card public.gift_cards;
  clean_service text := lower(btrim(coalesce(p_service, '')));
  scope uuid[];
  waiting integer;
  added integer;
  cost numeric;
  balance numeric;
begin
  if auth.uid() is null then raise exception 'Sign in to edit this gift'; end if;
  if p_request_id is null then raise exception 'Missing gift request identifier'; end if;

  select * into card from public.gift_cards
  where id = p_gift and creator_id = auth.uid() and parent_gift_id is null
  for update;
  if card.id is null then raise exception 'Gift not found'; end if;
  if card.refunded_at is not null or card.status = 'cancelled' then
    raise exception 'This gift has been closed and can no longer be edited';
  end if;

  -- A retried save returns the card as saved, without charging again.
  if exists (select 1 from public.wallet_transactions
             where reference = 'gift_edit_' || p_request_id and profile_id = auth.uid()) then
    return card;
  end if;

  -- Value can only go up.
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount > 5000000 then
    raise exception 'Enter a valid whole-wallet-unit amount per person';
  end if;
  if p_amount < card.amount then
    raise exception 'The amount per person can only be increased';
  end if;
  if p_quantity is null or p_quantity > 10000 then raise exception 'Quantity must be between 1 and 10,000'; end if;
  if p_quantity < card.quantity then
    raise exception 'Claims can only be increased. Close the gift to recover unclaimed value';
  end if;

  -- The details, validated exactly as on creation.
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '366 days' then
    raise exception 'Choose a future claim-by date within one year';
  end if;
  if clean_service = 'support' then clean_service := 'universal'; end if;
  if clean_service = '' or clean_service <> all(public.wallet_gift_services() || public.restricted_zero_gift_services()) then
    raise exception 'Choose a valid gift purpose';
  end if;
  if clean_service = 'custom' and nullif(btrim(p_custom_purpose), '') is null then
    raise exception 'Describe your custom gift';
  end if;
  select coalesce(array_agg(distinct id order by id), '{}') into scope from unnest(coalesce(p_bootcamp_ids, '{}')) id;
  if cardinality(scope) > 100 or (cardinality(scope) > 0 and clean_service <> 'bootcamps') then
    raise exception 'Bootcamp restrictions only apply to bootcamp gifts';
  end if;
  if exists (select 1 from unnest(scope) id where not exists (select 1 from bootcamps b where b.id = id)) then
    raise exception 'A selected bootcamp is unavailable';
  end if;
  if length(coalesce(p_message, '')) > 280 then raise exception 'Keep the message under 280 characters'; end if;
  if length(coalesce(p_custom_purpose, '')) > 120 then raise exception 'Keep the custom purpose under 120 characters'; end if;

  waiting := greatest(0, card.quantity - card.claimed_count);
  added := p_quantity - card.quantity;
  cost := (p_amount - card.amount) * waiting + p_amount * added;

  if cost > 0 and card.funding_source = 'wallet' then
    perform 1 from public.profiles where id = auth.uid() for no key update;
    select coalesce(coins, 0) into balance from public.profiles where id = auth.uid();
    if balance < cost then
      raise exception 'Add % to your wallet to save these changes', cost - balance;
    end if;
    perform public.wallet_apply(
      auth.uid(), 'debit', cost, 'gift',
      'Zero Gift · edited',
      'gift_edit_' || p_request_id,
      jsonb_build_object('gift_id', card.id,
        'amount_per_person', p_amount, 'previous_amount', card.amount,
        'quantity', p_quantity, 'previous_quantity', card.quantity,
        'topped_up_places', case when p_amount > card.amount then waiting else 0 end,
        'added_places', added)
    );
  end if;

  update public.gift_cards
  set amount = p_amount,
      quantity = p_quantity,
      expires_at = p_expires_at,
      template_id = coalesce(nullif(btrim(p_template), ''), card.template_id),
      service = clean_service,
      message = nullif(btrim(coalesce(p_message, '')), ''),
      custom_purpose = case when clean_service = 'custom' then nullif(btrim(coalesce(p_custom_purpose, '')), '') else null end,
      bootcamp_ids = scope,
      -- Open while any place is unclaimed; a sold-out card reopens when places are added.
      status = case when p_quantity > claimed_count then 'active' else 'claimed' end
  where id = card.id
  returning * into card;

  return card;
end $function$;

grant execute on function public.update_gift_campaign(uuid, numeric, integer, timestamptz, text, text, text, text, uuid[], uuid) to authenticated;
revoke execute on function public.update_gift_campaign(uuid, numeric, integer, timestamptz, text, text, text, text, uuid[], uuid) from anon, public;
