import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261028150000_ambassador_platform_fee_commission.sql');
const ambassador='10000000-0000-0000-0000-000000000001',buyer='20000000-0000-0000-0000-000000000002',seller='30000000-0000-0000-0000-000000000003',camp='40000000-0000-0000-0000-000000000004',campaign='50000000-0000-0000-0000-000000000005';
test('ambassador earns a share of the platform fee across eligible payment types',async t=>{
 const db=new PGlite();try{
  await db.exec(`create role authenticated;create table profiles(id uuid primary key,coins numeric default 0,full_name text,username text);
   create table wallet_transactions(id uuid primary key default gen_random_uuid(),profile_id uuid,direction text,amount numeric,balance_after numeric,source text,description text,reference text unique,metadata jsonb default '{}',created_at timestamptz default now());
   create table zs_settings(key text primary key,value jsonb);
   create table zs_ambassadors(profile_id uuid primary key,status text,commission_rate numeric);
   create table zs_campaign_results(ambassador_id uuid,campaign_id uuid,referred_profile_id uuid,kind text,status text);
   create table zs_commissions(id uuid primary key default gen_random_uuid(),ambassador_id uuid,campaign_id uuid,buyer_id uuid,wallet_transaction_id uuid unique,source text,description text,gross numeric,rate numeric,amount numeric,payout_id uuid,created_at timestamptz default now());
   create table zs_payouts(id uuid primary key,total numeric);
   create table bootcamps(id uuid primary key,referral_percent numeric default 0);
   create table platform_revenue(source text,bootcamp_id uuid,buyer_id uuid,gross_amount numeric,fee_amount numeric,payment_reference text unique);
   insert into profiles(id,coins,username) values('${ambassador}',0,'ambassador'),('${buyer}',1000000,'buyer'),('${seller}',0,'seller');
   insert into zs_ambassadors values('${ambassador}','active',20);
   insert into zs_campaign_results values('${ambassador}','${campaign}','${buyer}','signup','verified');
   insert into zs_settings values('commission_sources','["bootcamp","membership","store","club"]');
   insert into bootcamps(id) values('${camp}');
   create function zero_club_platform_fee_percent() returns numeric language sql immutable as $$select 10::numeric$$;`);
  const wallet=read('supabase/migrations/20260806120000_wallet_reliability.sql'),walletStart=wallet.indexOf('create or replace function public.wallet_apply(');
  await db.exec(wallet.slice(walletStart,wallet.indexOf('$$;',walletStart)+3));
  const old=read('ZeroStart/supabase/migrations/20260928120000_ambassador_applications_commission.sql'),start=old.indexOf('create or replace function public.zs_record_commission()');
  await db.exec(old.slice(start,old.indexOf('$$;',start)+3));
  await db.exec('create trigger zs_record_commission after insert on wallet_transactions for each row execute function zs_record_commission()');
  await db.exec(read('supabase/migrations/20260813180000_no_referral_on_coupon.sql'));
  const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const pay=async(source,amount=10000,reference=crypto.randomUUID(),person=buyer)=>{
   await db.query("select wallet_apply($1,'debit',$2,$3,'Purchase',$4,'{}')",[person,amount,source,reference]);
   return value('select to_jsonb(c) as value from zs_commissions c join wallet_transactions w on w.id=c.wallet_transaction_id where w.reference=$1',[reference]);
  };
  const pending=await pay('bootcamp');const paid=await pay('store');const payout=crypto.randomUUID();
  await db.query('insert into zs_payouts values($1,2000)',[payout]);await db.query('update zs_commissions set payout_id=$1 where id=$2',[payout,paid.id]);
  await db.query("select wallet_apply($1,'credit',2000,'zerostart_payout','Previous payout','legacy-payout','{}')",[ambassador]);
  const balancesBefore=await value('select jsonb_object_agg(id,coins) as value from profiles');
  await db.exec(migration);
  await t.test('corrects pending gross-based earnings and leaves completed payouts and wallets intact',async()=>{
   const corrected=await value('select to_jsonb(c) as value from zs_commissions c where id=$1',[pending.id]);
   assert.equal(Number(corrected.gross),10000);assert.equal(Number(corrected.rate),20);assert.equal(Number(corrected.platform_fee),1000);assert.equal(Number(corrected.amount),200);assert.equal(corrected.commission_basis,'platform_fee');
   const previous=await value('select to_jsonb(c) as value from zs_commissions c where id=$1',[paid.id]);
   assert.equal(Number(previous.amount),2000);assert.equal(previous.commission_basis,'legacy_gross');assert.equal(Number(await value('select total as value from zs_payouts where id=$1',[payout])),2000);
   assert.deepEqual(await value('select jsonb_object_agg(id,coins) as value from profiles'),balancesBefore);
  });
  await t.test('bootcamps, subscriptions, products and club purchases all use 20% of the 10% fee',async()=>{
   for(const source of ['bootcamp','membership','store','club']){
    const row=await pay(source);assert.ok(row,source);assert.equal(Number(row.gross),10000);assert.equal(Number(row.platform_fee_percent),10);assert.equal(Number(row.platform_fee),1000);assert.equal(Number(row.amount),200);
   }
  });
  await t.test('actual bootcamp settlement keeps the seller share intact and records the platform fee separately',async()=>{
   const reference='settlement-'+crypto.randomUUID();const sellerBefore=Number(await value('select coins as value from profiles where id=$1',[seller]));
   const row=await pay('bootcamp',10000,reference);
   const split=await value('select settle_bootcamp_payment($1,$2,$3,10000,$4,false) as value',[camp,buyer,seller,reference]);
   assert.equal(Number(split.platform),1000);assert.equal(Number(split.tutor),9000);assert.equal(Number(row.amount),200);
   assert.equal(Number(await value('select coins as value from profiles where id=$1',[seller]))-sellerBefore,9000);
   assert.equal(Number(split.platform)-Number(row.amount),800);
  });
  await t.test('wallet retries and migration reruns never duplicate or repeatedly scale commissions',async()=>{
   const reference=crypto.randomUUID();const first=await pay('membership',10000,reference);const second=await pay('membership',10000,reference);
   assert.equal(first.id,second.id);assert.equal(Number(second.amount),200);
   await db.exec(migration);assert.equal(Number(await value('select amount as value from zs_commissions where id=$1',[first.id])),200);
  });
  await t.test('ledger enforcement corrects old writers and paid financial records cannot be rewritten',async()=>{
   await db.query('update zs_commissions set amount=2000,platform_fee=10000 where id=$1',[pending.id]);
   assert.equal(Number(await value('select amount as value from zs_commissions where id=$1',[pending.id])),200);
   await assert.rejects(db.query('update zs_commissions set amount=200 where id=$1',[paid.id]),/Paid ambassador commissions are immutable/);
  });
  await t.test('credits, transfers, gifts and withdrawals do not produce commission',async()=>{
   for(const source of ['transfer','gift','withdrawal','paystack','refund'])assert.equal(await pay(source,100),undefined);
   const count=await value('select count(*)::int as value from zs_commissions');
   await db.query("select wallet_apply($1,'credit',10000,'bootcamp','Seller receipt','seller-receipt','{}')",[buyer]);
   assert.equal(await value('select count(*)::int as value from zs_commissions'),count);
  });
  await t.test('referrals must be verified and active, and self-referrals do not earn',async()=>{
   await db.exec("update zs_ambassadors set status='paused'");assert.equal(await pay('bootcamp'),undefined);
   await db.exec("update zs_ambassadors set status='active';update zs_campaign_results set status='pending'");assert.equal(await pay('membership'),undefined);
   await db.exec("update zs_campaign_results set status='verified'");
   await db.query("insert into zs_campaign_results values($1,$2,$1,'signup','verified')",[ambassador,campaign]);
   assert.equal(await pay('store',100,crypto.randomUUID(),ambassador),undefined);
  });
  await t.test('custom ambassador rates also apply to the fee, with monetary rounding',async()=>{
   await db.exec('update zs_ambassadors set commission_rate=15');assert.equal(Number((await pay('membership')).amount),150);
   await db.exec('update zs_ambassadors set commission_rate=20');const small=await pay('store',10.03);assert.equal(Number(small.platform_fee),1);assert.equal(Number(small.amount),.2);
   assert.equal(await pay('store',.01),undefined);
  });
  await t.test('deployment restores a missing or disabled wallet commission trigger',async()=>{
   await db.exec('alter table wallet_transactions disable trigger zs_record_commission');
   await db.exec(migration);assert.equal(Number((await pay('bootcamp')).amount),200);
   await db.exec('drop trigger zs_record_commission on wallet_transactions');
   await db.exec(migration);assert.equal(Number((await pay('store')).amount),200);
  });
 }finally{await db.close();}
});
