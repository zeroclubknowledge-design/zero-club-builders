-- Enough of a gift card to draw a link preview, readable without signing in.
--
-- gift_cards is restricted to the creator and the claimer, which is right —
-- but it means the crawler that builds a WhatsApp preview sees nothing, so a
-- shared gift previewed as the generic "Zero Club" card with the site logo.
--
-- This returns only what a preview needs: the amount, what it is for, the
-- template to draw it in, and whether it is still available. No creator, no
-- claimer, no history. Anyone holding the code can already open the card, so
-- this exposes nothing they could not already see.

create or replace function public.get_gift_card_public(gift_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.gift_cards;
begin
  select * into card
  from public.gift_cards
  where upper(code) = upper(btrim(gift_code));

  if card.id is null then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'code', card.code,
    'amount', card.amount,
    'service', card.service,
    'template_id', card.template_id,
    'message', card.message,
    'custom_purpose', card.custom_purpose,
    'status', card.status
  );
end;
$$;

grant execute on function public.get_gift_card_public(text) to anon, authenticated;

notify pgrst, 'reload schema';
