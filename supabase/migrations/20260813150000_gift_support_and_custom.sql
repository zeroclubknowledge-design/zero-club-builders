-- Gifts that put money in the recipient's wallet.
--
-- Two new kinds:
--
--   support  cash, no strings. The amount lands in the recipient's wallet.
--   custom   the same, except the sender names what it is for. The purpose is
--            a note that travels with the gift; it does not restrict spending.
--
-- ---------------------------------------------------------------------------
-- While adding these, a live bug came to light and is fixed here too.
--
-- create_gift_card debits the sender, but claim_gift_card only ever marked the
-- card 'claimed'. It never credited anybody. Every gift sent so far took money
-- from the sender and gave the recipient nothing — the balance simply left the
-- system. claim_gift_card now credits the recipient for the wallet-backed
-- kinds, and the sender's debit is written to the ledger so gifts appear in
-- wallet history like every other movement.
--
-- The older service types (bootcamps, membership, zero-ai, tutor-session,
-- zero-store) are vouchers for things that cannot yet be redeemed in-app, so
-- they still credit nothing. That is a decision to make, not a bug to hide:
-- see the comment on claim_gift_card.
-- ---------------------------------------------------------------------------

alter table public.gift_cards
  add column if not exists custom_purpose text;

comment on column public.gift_cards.custom_purpose is
  'What the sender said the gift is for. Set only for service = custom. A '
  'note, not a restriction — the money reaches the wallet either way.';

-- Which gift kinds pay straight into the wallet.
create or replace function public.wallet_gift_services()
returns text[]
language sql
immutable
as $$ select array['support', 'custom']::text[] $$;

-- ------------------------------------------------------------------ create ---

create or replace function public.create_gift_card(
  gift_amount numeric,
  gift_template text,
  gift_service text,
  gift_message text default null,
  gift_custom_purpose text default null
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
  clean_service text := lower(coalesce(trim(gift_service), ''));
  clean_purpose text := nullif(trim(coalesce(gift_custom_purpose, '')), '');
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if gift_amount is null or gift_amount <= 0 then raise exception 'Enter a valid gift amount'; end if;
  if clean_service = '' then raise exception 'Choose what this gift is for'; end if;

  -- A custom gift without a purpose is just a support gift wearing a label.
  if clean_service = 'custom' and clean_purpose is null then
    raise exception 'Say what this custom gift is for';
  end if;
  if clean_service <> 'custom' then
    clean_purpose := null;
  end if;

  select coalesce(coins, 0) into current_balance
  from public.profiles where id = auth.uid() for update;
  if current_balance < gift_amount then raise exception 'Your wallet balance is too low'; end if;

  generated_code := 'ZC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.gift_cards(code, creator_id, amount, template_id, service, message, custom_purpose)
  values (
    generated_code, auth.uid(), gift_amount,
    coalesce(nullif(gift_template, ''), 'signature'),
    clean_service,
    nullif(trim(gift_message), ''),
    clean_purpose
  )
  returning * into created_card;

  -- Through the ledger rather than a bare coins update, so the money leaving
  -- shows up in wallet history and cannot be spent twice on a retry.
  perform public.wallet_apply(
    auth.uid(), 'debit', gift_amount, 'gift',
    'Gift sent · ' || generated_code,
    'gift_out_' || generated_code,
    jsonb_build_object('gift_code', generated_code, 'service', clean_service)
  );

  return created_card;
end;
$$;

grant execute on function public.create_gift_card(numeric, text, text, text, text) to authenticated;
-- The four-argument version stays callable so an older client keeps working.
grant execute on function public.create_gift_card(numeric, text, text, text) to authenticated;

-- ------------------------------------------------------------------- claim ---

create or replace function public.claim_gift_card(gift_code text)
returns public.gift_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_card public.gift_cards;
  sender_name text;
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

  select coalesce(full_name, username) into sender_name
  from public.profiles where id = claimed_card.creator_id;

  -- Support and custom gifts are cash: the amount becomes spendable balance.
  --
  -- The other services are vouchers for things with no redemption flow yet, so
  -- they deliberately credit nothing. Anyone sending one is currently out of
  -- pocket with the recipient receiving no balance, which is worth resolving —
  -- either build the redemption, or make every gift wallet-backed.
  if claimed_card.service = any(public.wallet_gift_services()) then
    perform public.wallet_apply(
      auth.uid(), 'credit', claimed_card.amount, 'gift',
      'Gift from ' || coalesce(sender_name, 'a member'),
      'gift_in_' || claimed_card.code,
      jsonb_build_object(
        'gift_code', claimed_card.code,
        'from', claimed_card.creator_id,
        'purpose', claimed_card.custom_purpose
      )
    );

    insert into public.notifications (profile_id, actor_id, type, content)
    values (
      claimed_card.creator_id, auth.uid(), 'system',
      coalesce((select coalesce(full_name, username) from public.profiles where id = auth.uid()), 'Someone')
      || ' claimed your gift of ' || claimed_card.amount
    );
  end if;

  return claimed_card;
end;
$$;

grant execute on function public.claim_gift_card(text) to authenticated;

notify pgrst, 'reload schema';
