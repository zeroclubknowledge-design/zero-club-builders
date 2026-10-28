-- Ambassador commission is a share of Zero Club's platform fee, not the sale.
-- Default example: 10,000 payment -> 1,000 platform fee -> 200 ambassador.
begin;

-- Serialize pending-earnings corrections against payout readers/writers.
lock table public.zs_commissions in access exclusive mode;
alter table public.zs_commissions
  add column if not exists commission_basis text not null default 'legacy_gross',
  add column if not exists platform_fee_percent numeric,
  add column if not exists platform_fee numeric;

create or replace function public.zs_commission_platform_fee(p_gross numeric)
returns numeric language sql stable set search_path=public as $$
  select round(greatest(coalesce(p_gross,0),0)*public.zero_club_platform_fee_percent()/100.0,2);
$$;

-- Enforce the same calculation on the ledger itself, including inserts from
-- older in-flight payment functions. Re-running cannot multiply an amount twice.
create or replace function public.zs_guard_commission_basis()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and old.payout_id is not null then
    if (new.gross,new.rate,new.amount,new.commission_basis,new.platform_fee_percent,new.platform_fee)
      is distinct from (old.gross,old.rate,old.amount,old.commission_basis,old.platform_fee_percent,old.platform_fee) then
      raise exception 'Paid ambassador commissions are immutable; use a separate reviewed adjustment';
    end if;
    return new;
  end if;
  if new.gross is null or new.gross<0 or new.rate is null or new.rate<0 or new.rate>100 then
    raise exception 'Invalid ambassador commission base or rate';
  end if;
  new.platform_fee_percent:=public.zero_club_platform_fee_percent();
  if new.platform_fee_percent<0 or new.platform_fee_percent>100 then raise exception 'Invalid Zero Club platform fee'; end if;
  new.platform_fee:=public.zs_commission_platform_fee(new.gross);
  new.commission_basis:='platform_fee';
  new.amount:=round(new.platform_fee*new.rate/100.0,2);
  return new;
end $$;
drop trigger if exists zs_commission_basis_guard on public.zs_commissions;
create trigger zs_commission_basis_guard
before insert or update of gross,rate,amount,commission_basis,platform_fee_percent,platform_fee on public.zs_commissions
for each row execute function public.zs_guard_commission_basis();

create or replace function public.zs_record_commission()
returns trigger language plpgsql security definer set search_path=public as $$
declare attribution record; rate numeric; sources jsonb; fee numeric;
begin
  if new.direction<>'debit' or coalesce(new.amount,0)<=0 then return new; end if;
  begin
    select value into sources from public.zs_settings where key='commission_sources';
    if sources is null or not(sources ? new.source) then return new; end if;
    select r.ambassador_id,r.campaign_id into attribution
    from public.zs_campaign_results r
    where r.kind='signup' and r.status='verified' and r.referred_profile_id=new.profile_id limit 1;
    if attribution.ambassador_id is null or attribution.ambassador_id=new.profile_id then return new; end if;
    select a.commission_rate into rate from public.zs_ambassadors a
    where a.profile_id=attribution.ambassador_id and a.status='active';
    if rate is null or rate<=0 then return new; end if;
    fee:=public.zs_commission_platform_fee(new.amount);
    if fee<=0 then return new; end if;
    insert into public.zs_commissions
      (ambassador_id,campaign_id,buyer_id,wallet_transaction_id,source,description,gross,rate,amount,commission_basis,platform_fee_percent,platform_fee)
    values(attribution.ambassador_id,attribution.campaign_id,new.profile_id,new.id,new.source,new.description,
      new.amount,rate,round(fee*rate/100.0,2),'platform_fee',public.zero_club_platform_fee_percent(),fee)
    on conflict(wallet_transaction_id) do nothing;
  exception when others then
    -- Commission failures must not interrupt a successfully funded purchase.
    raise warning 'Ambassador commission failed for transaction % (SQLSTATE %)',new.id,sqlstate;
  end;
  return new;
end $$;
-- Updating the function updates the existing trigger in place. Avoid taking a
-- wallet-table DDL lock while holding the commission lock: in-flight purchases
-- may already hold wallet locks while waiting to insert their commission.
do $$ begin
  if not exists(select 1 from pg_trigger where tgrelid='public.wallet_transactions'::regclass and tgname='zs_record_commission') then
    create trigger zs_record_commission after insert on public.wallet_transactions
    for each row execute function public.zs_record_commission();
  elsif exists(select 1 from pg_trigger where tgrelid='public.wallet_transactions'::regclass and tgname='zs_record_commission' and tgenabled='D') then
    alter table public.wallet_transactions enable trigger zs_record_commission;
  end if;
end $$;

-- Correct amounts still awaiting payout. Preserve gross sales, locked-in rates,
-- paid commissions, completed payouts and member wallet balances.
update public.zs_commissions set commission_basis='platform_fee'
where payout_id is null and commission_basis='legacy_gross';

comment on column public.zs_commissions.rate is 'Ambassador percentage of Zero Club platform_fee, not gross payment; historical paid legacy_gross rows retain their original basis.';
comment on column public.zs_commissions.platform_fee is 'Commission base: Zero Club fee calculated on the eligible payment, using the shared platform-fee policy.';
notify pgrst,'reload schema';
commit;
