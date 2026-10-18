-- Preserve the current Zero Form pricing, capacity, guest and enrolment logic.
-- Gift funding is an atomic bridge into that existing wallet checkout.
begin;
create or replace function public.submit_zero_form_with_gift(form_slug text,answers jsonb,intent text default 'pay',guest jsonb default null,p_apply_gift boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare form public.zero_forms; existing public.zero_form_registrations; result jsonb;
  balance numeric; after_balance numeric; reserve numeric; used numeric; paid numeric;
  reference text:='zf_gift_'||gen_random_uuid(); context jsonb;
begin
 if auth.uid() is null or not p_apply_gift or intent<>'pay' then return submit_zero_form_v2(form_slug,answers,intent,guest); end if;
 select coalesce(coins,0) into balance from profiles where id=auth.uid() for no key update;
 select * into form from zero_forms where slug=form_slug;
 if form.id is null or form.bootcamp_id is null or not coalesce(form.pricing_enabled,true) then return submit_zero_form_v2(form_slug,answers,intent,guest); end if;
 select * into existing from zero_form_registrations where zero_form_id=form.id and user_id=auth.uid();
 if existing.payment_status='paid' or existing.registration_status in ('confirmed','enrolled') then return submit_zero_form_v2(form_slug,answers,intent,guest); end if;
 context:=jsonb_build_object('bootcamp_id',form.bootcamp_id,'zero_form_id',form.id);
 reserve:=least(zero_gift_balance_for_context(auth.uid(),'bootcamps',context),greatest(coalesce(form.early_bird_price,0),coalesce(existing.amount,0)));
 if reserve<=0 then return submit_zero_form_v2(form_slug,answers,intent,guest); end if;
 begin
   perform wallet_apply(auth.uid(),'credit',reserve,'gift','Zero Gift applied to Zero Form',reference||':credit',context);
   result:=submit_zero_form_v2(form_slug,answers,intent,guest);
   -- A rejection or unfinished payment must leave both balances unchanged.
   if result->>'status' not in ('confirmed','enrolled') or result->>'status' is null then raise exception using errcode='ZC001',message='Registration not paid'; end if;
   select coins into after_balance from profiles where id=auth.uid();
   paid:=greatest(0,balance+reserve-after_balance); used:=least(reserve,paid);
   if used>0 and consume_zero_gift(auth.uid(),'bootcamps',used,reference,context)<>used then raise exception 'Gift balance changed. Please retry'; end if;
   if reserve>used then perform wallet_apply(auth.uid(),'debit',reserve-used,'gift','Unused gift credit returned to card',reference||':return',context); end if;
   result:=result||jsonb_build_object('gift_applied',used,'wallet_charged',greatest(0,paid-used));
 exception when sqlstate 'ZC001' then
   -- Roll back provisional funding, then let the native flow persist pending
   -- answers and its locked price, without exposing temporary wallet credit.
   result:=submit_zero_form_v2(form_slug,answers,intent,guest);
   if result->>'status'='insufficient_funds' then result:=result||jsonb_build_object('shortfall',greatest(0,coalesce((result->>'shortfall')::numeric,0)-reserve),'gift_available',reserve,'balance',balance); end if;
   return result;
 end;
 return result;
end $$;
revoke all on function public.submit_zero_form_with_gift(text,jsonb,text,jsonb,boolean) from public;
grant execute on function public.submit_zero_form_with_gift(text,jsonb,text,jsonb,boolean) to authenticated,anon;
notify pgrst,'reload schema';
commit;
