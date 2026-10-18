begin;
-- Creators can raise the number of claims on a gift they still have running.
--
-- The extra claims cost the same per person as the original card and are
-- charged in the same transaction that stores the new quantity, so a gift can
-- never exist with more claims than were paid for. Platform-sponsored cards
-- add claims without charging anyone, matching how they were created.
--
-- Lowering the quantity stays with close_gift_campaign: removing claims should
-- return real money to the wallet, and silently shrinking a shared card would
-- leave people holding a link to fewer places than they were told about.

create or replace function public.update_gift_campaign_quantity(
  p_gift uuid,
  p_quantity integer,
  p_request_id uuid default gen_random_uuid()
)
returns public.gift_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.gift_cards;
  extra integer;
  cost numeric;
  balance numeric;
begin
  if auth.uid() is null then raise exception 'Sign in to edit this gift'; end if;
  if p_request_id is null then raise exception 'Missing gift request identifier'; end if;

  -- Serialise concurrent edits on this card and on the creator's wallet.
  select * into card from public.gift_cards
  where id = p_gift and creator_id = auth.uid() and parent_gift_id is null
  for update;

  if card.id is null then raise exception 'Gift not found'; end if;
  if card.status <> 'active' then
    raise exception 'Only gifts that are still collecting claims can be changed';
  end if;
  if card.refunded_at is not null then raise exception 'This gift has been closed'; end if;
  if card.expires_at is not null and card.expires_at <= now() then
    raise exception 'This gift has expired';
  end if;

  if p_quantity is null or p_quantity < card.quantity then
    raise exception 'Claims can only be increased. Close the gift to recover unclaimed value';
  end if;
  if p_quantity > 10000 then raise exception 'Quantity must be between 1 and 10,000'; end if;
  if p_quantity = card.quantity then return card; end if;

  -- A retried request must not charge twice. The reference is derived from the
  -- card, the target quantity and the request id, so replaying the exact same
  -- edit is a no-op while a genuinely new increase still charges.
  if exists (
    select 1 from public.wallet_transactions
    where reference = 'gift_edit_' || p_request_id
      and profile_id = auth.uid()
  ) then
    select * into card from public.gift_cards where id = p_gift;
    return card;
  end if;

  extra := p_quantity - card.quantity;
  cost := card.amount * extra;

  if card.funding_source = 'wallet' then
    perform 1 from public.profiles where id = auth.uid() for no key update;
    select coalesce(coins, 0) into balance from public.profiles where id = auth.uid();
    if balance < cost then
      raise exception 'Add % to your wallet to fund % more claim%', cost, extra, case when extra = 1 then '' else 's' end;
    end if;
    perform public.wallet_apply(
      auth.uid(), 'debit', cost, 'gift',
      'Zero Gift · ' || extra || ' more claim' || case when extra = 1 then '' else 's' end,
      'gift_edit_' || p_request_id,
      jsonb_build_object('gift_id', card.id, 'added_quantity', extra, 'amount_per_person', card.amount, 'quantity', p_quantity)
    );
  end if;

  update public.gift_cards
  set quantity = p_quantity
  where id = card.id
  returning * into card;

  return card;
end $$;

revoke all on function public.update_gift_campaign_quantity(uuid, integer, uuid) from public, anon;
grant execute on function public.update_gift_campaign_quantity(uuid, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
