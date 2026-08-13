-- Unconfirmed payments stay claimable for a week, not two hours.
--
-- get_my_wallet_history only reported pending top-ups from the last 2 hours.
-- That fits a card payment, which either succeeds or fails within seconds.
--
-- It does not fit a bank transfer. Paying by transfer means leaving Zero Club
-- for a banking app, and the money can land well after the checkout page has
-- gone. If the webhook is misconfigured or was briefly down, the payment is
-- real but uncredited, and after two hours it vanished from the app entirely —
-- so the person had no way to point at it and say "this one, please check".
--
-- Seven days gives a stuck payment a chance to be recovered. Nothing here
-- credits anything: these rows are only a list of references to re-verify,
-- and verification still goes to Paystack.

create or replace function public.get_my_wallet_history(limit_count integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  return jsonb_build_object(
    'balance', (select coalesce(coins, 0) from public.profiles where id = caller),
    'pending_topups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', reference,
        'amount', amount,
        'created_at', created_at
      ) order by created_at desc)
      from public.wallet_topups
      where profile_id = caller
        and status = 'pending'
        and created_at > now() - interval '7 days'
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(row) order by row.created_at desc) from (
        select id, direction, amount, balance_after, source, description, reference, created_at
        from public.wallet_transactions
        where profile_id = caller
        order by created_at desc
        limit greatest(1, least(coalesce(limit_count, 50), 200))
      ) as row
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_my_wallet_history(integer) to authenticated;

notify pgrst, 'reload schema';
