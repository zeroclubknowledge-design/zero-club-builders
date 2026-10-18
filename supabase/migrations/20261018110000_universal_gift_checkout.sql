begin;
-- Create the private receipt storage before using its composite row type.
-- Also supports databases where an earlier manual migration was incomplete.
create table if not exists public.zero_gift_payment_receipts(
 profile_id uuid not null references public.profiles(id),reference text not null,
 service text not null,total numeric not null,metadata jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(profile_id,reference)
);
alter table public.zero_gift_payment_receipts enable row level security;
revoke all on public.zero_gift_payment_receipts from public,anon,authenticated;
-- Only actual payments are whitelisted. Never withdrawals, wallet transfers,
-- buying another gift, or refundable prize/budget funding.
create or replace function public.pay_with_gift_credit(p_action text,p_args jsonb,p_apply_gift boolean default true,p_request_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer set search_path=public as $$
declare balance numeric; after_balance numeric; reserve numeric:=0; spent numeric; used numeric; result jsonb;
 receipt public.zero_gift_payment_receipts; context jsonb:=jsonb_build_object('action',p_action,'args',p_args);
 checkout_ref text:='gift_checkout_'||p_request_id;
begin
 if auth.uid() is null then raise exception 'Sign in to pay'; end if;
 if p_action not in ('join_club','pay_fund_link_from_wallet') or p_action is null then raise exception 'Unsupported gift payment'; end if;
 if p_request_id is null then raise exception 'Missing payment identifier'; end if;
 select coalesce(coins,0) into balance from profiles where id=auth.uid() for no key update;
 select * into receipt from zero_gift_payment_receipts where profile_id=auth.uid() and reference=checkout_ref;
 if found then
   if receipt.metadata<>context then raise exception 'Payment identifier already used'; end if;
   return receipt.result;
 end if;
 if p_apply_gift then reserve:=zero_gift_balance_for_context(auth.uid(),'universal','{}'); end if;
 begin
   if reserve>0 then perform wallet_apply(auth.uid(),'credit',reserve,'gift','Gift credit reserved for payment',checkout_ref||':credit',context); end if;
   case p_action
    when 'join_club' then result:=to_jsonb(public.join_club((p_args->>'p_club_id')::uuid));
    when 'pay_fund_link_from_wallet' then result:=to_jsonb(public.pay_fund_link_from_wallet(p_args->>'p_slug',(p_args->>'p_amount')::numeric));
   end case;
   if result->>'ok'='false' or result->>'status' in ('insufficient_funds','error','failed') then raise exception using errcode='ZG001',message='Payment not completed'; end if;
   select coins into after_balance from profiles where id=auth.uid();
   spent:=greatest(0,balance+reserve-after_balance); used:=least(reserve,spent);
   if used>0 and consume_zero_gift(auth.uid(),'universal',used,checkout_ref,context)<>used then raise exception 'Gift balance changed. Please retry'; end if;
   if reserve>used then perform wallet_apply(auth.uid(),'debit',reserve-used,'gift','Unused gift credit returned',checkout_ref||':return',context); end if;
   result:=coalesce(result,'{}')||jsonb_build_object('gift_applied',used,'wallet_charged',greatest(0,spent-used));
   insert into zero_gift_payment_receipts(profile_id,reference,service,total,metadata,result) values(auth.uid(),checkout_ref,'universal',spent,context,result);
 exception when sqlstate 'ZG001' then return result;
 end;
 return result;
end $$;
revoke all on function public.pay_with_gift_credit(text,jsonb,boolean,uuid) from public,anon;
grant execute on function public.pay_with_gift_credit(text,jsonb,boolean,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
