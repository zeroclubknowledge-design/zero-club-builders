import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const maker='10000000-0000-0000-0000-000000000001',alice='20000000-0000-0000-0000-000000000002',bob='30000000-0000-0000-0000-000000000003',extra='40000000-0000-0000-0000-000000000004',camp='50000000-0000-0000-0000-000000000005',other='60000000-0000-0000-0000-000000000006';
for (const hasRestrictedBalances of [false,true]) test(`gift accounting with ${hasRestrictedBalances ? 'existing' : 'missing'} legacy balance schema`,async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table profiles(id uuid primary key,coins integer default 0,full_name text,username text,is_admin boolean not null default false);
   create table bootcamps(id uuid primary key,title text);
   create table wallet_transactions(id uuid default gen_random_uuid(),profile_id uuid,direction text,amount numeric,balance_after numeric,source text,description text,reference text unique,metadata jsonb);
   create table notifications(profile_id uuid,actor_id uuid,type text,content text);
   insert into profiles(id,coins) values('${maker}',100000),('${alice}',500),('${bob}',500),('${extra}',500);
   insert into bootcamps values('${camp}','Design'),('${other}','Engineering');
   create table zero_forms(id uuid primary key,slug text unique,bootcamp_id uuid,owner_id uuid,pricing_enabled boolean,early_bird_price numeric,valid boolean default true);
   create table zero_form_registrations(id uuid primary key default gen_random_uuid(),zero_form_id uuid,user_id uuid,amount numeric,payment_status text,registration_status text,unique(zero_form_id,user_id));
   insert into zero_forms values(gen_random_uuid(),'design','${camp}','${maker}',true,1200,true),(gen_random_uuid(),'other','${other}','${maker}',true,1200,true);`);
  const wallet=read('supabase/migrations/20260806120000_wallet_reliability.sql');const start=wallet.indexOf('create or replace function public.wallet_apply(');await db.exec(wallet.slice(start,wallet.indexOf('$$;',start)+3));
  const admin=read('supabase/migrations/20260729160000_create_zero_club_admin_control_center.sql');const adminStart=admin.indexOf('create or replace function public.is_zero_club_admin()');await db.exec(admin.slice(adminStart,admin.indexOf('$$;',adminStart)+3));
  await db.exec(read('supabase/migrations/20260725180000_create_zero_club_gift_cards.sql'));
  await db.exec(read('supabase/migrations/20260813150000_gift_support_and_custom.sql'));
  if (hasRestrictedBalances) await db.exec(read('supabase/migrations/20260817110000_restricted_zero_gift_balances.sql'));
  await t.test('universal checkout installs missing private receipt storage and preserves it on rerun',async()=>{
   assert.equal((await db.query("select to_regclass('public.zero_gift_payment_receipts') as value")).rows[0].value,null);
   await db.exec(read('supabase/migrations/20261018110000_universal_gift_checkout.sql'));
   await db.exec(`insert into zero_gift_payment_receipts(profile_id,reference,service,total,metadata,result)
    values('${maker}','migration-test','universal',0,'{}','{"status":"paid"}');`);
   await db.exec(read('supabase/migrations/20261018110000_universal_gift_checkout.sql'));
   assert.equal((await db.query("select count(*)::int as value from zero_gift_payment_receipts where reference='migration-test'")).rows[0].value,1);
   assert.equal((await db.query("select relrowsecurity as value from pg_class where oid='public.zero_gift_payment_receipts'::regclass")).rows[0].value,true);
   await db.exec('set role authenticated');
   await assert.rejects(db.query('select * from zero_gift_payment_receipts'),/permission denied/);
   await db.exec("reset role;delete from zero_gift_payment_receipts where reference='migration-test'");
  });
  await db.exec(`insert into gift_cards(code,creator_id,amount,service,status,claimed_by) values
   ('LEGACY-SERVICE','${bob}',500,'bootcamps','claimed','${maker}'),
   ('LEGACY-CASH','${bob}',500,'support','claimed','${maker}');`);
  if (hasRestrictedBalances) await db.exec("update gift_cards set remaining_amount=125 where code='LEGACY-SERVICE'");
  await db.exec(read('supabase/migrations/20261018090000_multi_claim_gift_cards.sql'));
  await t.test('migration repairs older storage, preserves cash gifts and never refills spent credit on rerun',async()=>{
   const remaining=async code=>Number((await db.query('select remaining_amount from gift_cards where code=$1',[code])).rows[0].remaining_amount);
   assert.equal(await remaining('LEGACY-SERVICE'),hasRestrictedBalances ? 125 : 500);
   assert.equal(await remaining('LEGACY-CASH'),0);
   await db.exec("update gift_cards set remaining_amount=0 where code='LEGACY-SERVICE'");
   await db.exec(read('supabase/migrations/20261018090000_multi_claim_gift_cards.sql'));
   assert.equal(await remaining('LEGACY-SERVICE'),0);
   assert.equal(await remaining('LEGACY-CASH'),0);
   await db.exec("delete from gift_cards where code in ('LEGACY-SERVICE','LEGACY-CASH')");
  });
  // The existing registration function is intentionally a separate dependency:
  // the new wrapper must preserve its authoritative pricing and enrolment result.
  await db.exec(`create function submit_zero_form_v2(form_slug text,answers jsonb,intent text default 'pay',guest jsonb default null) returns jsonb language plpgsql security definer as $$
   declare f zero_forms;r zero_form_registrations;b numeric;
   begin
    if auth.uid() is null then return jsonb_build_object('status','sign_in_required');end if;
    select * into f from zero_forms where slug=form_slug;
    if intent='interest' or not f.pricing_enabled then return jsonb_build_object('status','interested');end if;
    if not f.valid then return jsonb_build_object('status','closed');end if;
    select * into r from zero_form_registrations where zero_form_id=f.id and user_id=auth.uid();
    if r.payment_status='paid' then return jsonb_build_object('status','already_enrolled');end if;
    select coins into b from profiles where id=auth.uid();
    if b<f.early_bird_price then return jsonb_build_object('status','insufficient_funds','shortfall',f.early_bird_price-b);end if;
    perform wallet_apply(auth.uid(),'debit',f.early_bird_price,'bootcamp','Registration','form_'||auth.uid()||f.id,'{}');
    perform wallet_apply(f.owner_id,'credit',f.early_bird_price,'bootcamp','Registration income','form_income_'||auth.uid()||f.id,'{}');
    insert into zero_form_registrations(zero_form_id,user_id,amount,payment_status,registration_status) values(f.id,auth.uid(),f.early_bird_price,'paid','enrolled') returning * into r;
    return jsonb_build_object('status','confirmed','registration',to_jsonb(r));
   end$$;`);
  await db.exec(read('supabase/migrations/20261018100000_zero_form_gift_payment.sql'));
  await db.exec(`create function public.join_club(p_club_id uuid) returns jsonb language plpgsql security definer as $$
   declare b numeric;begin select coins into b from profiles where id=auth.uid();if b<1000 then return jsonb_build_object('status','insufficient_funds');end if;
   perform wallet_apply(auth.uid(),'debit',1000,'club','Club membership','club_'||auth.uid()||p_club_id,'{}');return jsonb_build_object('status','joined');end$$;
   create function public.pay_fund_link_from_wallet(p_slug text,p_amount numeric) returns jsonb language plpgsql security definer as $$begin
   perform wallet_apply(auth.uid(),'debit',p_amount,'fund_link','Payment','link_'||p_slug||auth.uid(),'{}');return jsonb_build_object('status','paid');end$$;`);
  await db.exec(read('supabase/migrations/20261018110000_universal_gift_checkout.sql'));
  await db.exec(read('supabase/migrations/20261018120000_admin_sponsored_gift_cards.sql'));
  const user=async id=>db.exec(`reset role;select set_config('test.uid','${id}',false);set role authenticated;`);
  const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
  const expires=new Date(Date.now()+86400000).toISOString();
  const create=async({amount=1000,quantity=2,service='bootcamps',scope=[],expiry=expires,request=crypto.randomUUID()}={})=>{
   await user(maker);return value('select to_jsonb(create_gift_campaign($1,$2,$3,$4,$5,$6,null,null,$7)) as value',[amount,'signature',service,quantity,expiry,scope,request]);
  };
  const claim=async(card,id)=>{await user(id);return value('select to_jsonb(claim_gift_card($1)) as value',[card.code]);};
  const balance=async(id,service='bootcamps',bootcamp=null)=>{await user(id);return value('select get_my_zero_gift_balance_v2($1,$2) as value',[service,bootcamp]);};
  let shared;
  await t.test('quantity is fully funded once and creation retries never debit twice',async()=>{
   const request=crypto.randomUUID();shared=await create({request});
   assert.equal((await create({request})).id,shared.id);
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[maker])),98000);
   await assert.rejects(create({request,quantity:3}),/already been used/);
   await assert.rejects(create({quantity:0}),/Quantity/);
   await assert.rejects(create({amount:100.5}),/whole-wallet-unit/);
   await assert.rejects(create({expiry:new Date(Date.now()-1000).toISOString()}),/future expiry/);
   await assert.rejects(claim(shared,maker),/own gift/);
  });
  await t.test('two accounts receive independent balances; repeated claims are idempotent and capacity is enforced',async()=>{
   const first=await claim(shared,alice);const again=await claim(shared,alice);assert.equal(first.id,again.id);
   const second=await claim(shared,bob);assert.notEqual(first.id,second.id);
   assert.equal(Number((await balance(alice)).available),1000);assert.equal(Number((await balance(bob)).available),1000);
   await assert.rejects(claim(shared,extra),/All claims/);
   await user(alice);const card=await value('select get_gift_card_v2($1) as value',[shared.code]);assert.equal(card.my_claim_id,first.id);assert.equal(card.claims_remaining,0);
  });
  await t.test('bootcamp restrictions apply to quotes and backend funding, regardless of client flags',async()=>{
   const scoped=await create({scope:[camp],quantity:1,amount:700});await claim(scoped,extra);
   assert.equal(Number((await balance(extra,'bootcamps',camp)).available),700);
   assert.equal(Number((await balance(extra,'bootcamps',other)).available),0);
   assert.equal(Number((await balance(extra)).available),0);
   await db.exec('reset role');
   const wrong=await value("select fund_zero_service_payment($1,'bootcamps',600,true,'bootcamp','Wrong camp','wrong',jsonb_build_object('bootcamp_id',$2::text)) as value",[extra,other]);
   assert.equal(wrong.status,'insufficient_funds');assert.equal(Number(wrong.gift_applied),0);
   const correct=await value("select fund_zero_service_payment($1,'bootcamps',1000,true,'bootcamp','Right camp','right',jsonb_build_object('bootcamp_id',$2::text)) as value",[extra,camp]);
   assert.equal(Number(correct.gift_applied),700);assert.equal(Number(correct.wallet_charged),300);
   const retried=await value("select fund_zero_service_payment($1,'bootcamps',1000,true,'bootcamp','Right camp','right',jsonb_build_object('bootcamp_id',$2::text)) as value",[extra,camp]);
   assert.deepEqual(retried,correct);
   assert.equal(Number(await value('select coins as value from profiles where id=$1',[extra])),200);
   assert.equal(Number((await balance(extra,'bootcamps',camp)).available),0);
  });
  await t.test('new all-purpose gifts remain expiring credit, separate from wallet cash',async()=>{
   const cash=await create({service:'support',quantity:1,amount:900});await claim(cash,extra);await claim(cash,extra);
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[extra])),200);
   assert.equal(Number((await balance(extra,'universal')).available),900);
  });
  await t.test('expiry blocks new claims; closing refunds only unused claim slots and cannot revoke claimed value',async()=>{
   const card=await create({quantity:3,amount:100});await claim(card,extra);
   await db.exec('reset role');await db.query("update gift_cards set expires_at=now()-interval '1 second' where id=$1",[card.id]);
   await assert.rejects(claim(card,alice),/expired/);
   await user(extra);await assert.rejects(value('select close_gift_campaign($1) as value',[card.id]),/Gift not found/);
   await user(maker);assert.equal(Number(await value('select close_gift_campaign($1) as value',[card.id])),200);assert.equal(Number(await value('select close_gift_campaign($1) as value',[card.id])),0);
   assert.equal(Number((await balance(extra)).available),1000);
  });
  await t.test('Zero Form combines gift credit and wallet, pays the organiser fully and preserves registration',async()=>{
   await user(alice);const paid=await value("select submit_zero_form_with_gift('design','{}','pay',null,true) as value");
   assert.equal(paid.status,'confirmed');assert.equal(Number(paid.gift_applied),1000);assert.equal(Number(paid.wallet_charged),200);
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[alice])),300);
   await user(alice);assert.equal((await value("select submit_zero_form_with_gift('design','{}','pay',null,true) as value")).status,'already_enrolled');
   assert.equal(Number((await balance(alice)).available),0);
  });
  await t.test('Zero Form failures roll back gift and wallet changes; interest never consumes credit',async()=>{
   await db.exec('reset role');await db.query("update zero_forms set valid=false where slug='design'");
   await user(bob);const result=await value("select submit_zero_form_with_gift('design','{}','pay',null,true) as value");assert.equal(result.status,'closed');
   assert.equal(Number((await balance(bob)).available),1000);
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[bob])),500);
   await user(bob);assert.equal((await value("select submit_zero_form_with_gift('design','{}','interest',null,true) as value")).status,'interested');
  });
  await t.test('universal credit pays club fees first, leaves only wallet remainder and retries safely',async()=>{
   await user(extra);const request=crypto.randomUUID();
   const pay=()=>value("select pay_with_gift_credit('join_club',jsonb_build_object('p_club_id',$1::text),true,$2) as value",[camp,request]);
   const result=await pay();assert.equal(result.status,'joined');assert.equal(Number(result.gift_applied),900);assert.equal(Number(result.wallet_charged),100);
   assert.deepEqual(await pay(),result);assert.equal(Number((await balance(extra,'universal')).available),0);
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[extra])),100);
  });
  await t.test('unused claimed credit expires without deducting a users own wallet money',async()=>{
   const expiring=await create({service:'universal',quantity:1,amount:600});const receipt=await claim(expiring,bob);
   assert.equal(receipt.expires_at,expiring.expires_at);
   await db.exec('reset role');await db.query("update gift_cards set expires_at=now()-interval '1 second' where id=$1 or parent_gift_id=$1",[expiring.id]);
   assert.equal(Number((await balance(bob,'universal')).available),0);
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[bob])),500);
   assert.equal(Number((await balance(bob)).available),1000);
   await user(bob);assert.equal((await value('select get_gift_card_v2($1) as value',[expiring.code])).expired,true);
   await assert.rejects(claim(expiring,bob),/expired/);
   await db.exec('reset role');assert.equal(Number(await value("select consume_zero_gift($1,'universal',600,'after_expiry','{}') as value",[bob])),0);
  });
  await t.test('insufficient Zero Form funds roll back provisional credit and cannot use credit for another bootcamp',async()=>{
   await db.exec('reset role');await db.query("update zero_forms set valid=true where slug='design'");
   await user(extra);const failed=await value("select submit_zero_form_with_gift('design','{}','pay',null,true) as value");assert.equal(failed.status,'insufficient_funds');
   assert.equal(Number((await balance(extra,'bootcamps',camp)).available),100);
   await user(extra);assert.equal((await value("select submit_zero_form_with_gift('other','{}','pay',null,true) as value")).status,'insufficient_funds');
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[extra])),100);
  });
  await t.test('generic gift checkout cannot be used for withdrawals or changing a recorded payment',async()=>{
   await user(extra);await assert.rejects(value("select pay_with_gift_credit('wallet_apply','{}') as value"),/Unsupported gift payment/);
  });
  await t.test('only platform admins can sponsor gifts without funds; sponsorship cannot become a wallet refund',async()=>{
   const adminId='70000000-0000-0000-0000-000000000007';
   await db.exec('reset role');
   await db.query('insert into profiles(id,coins,is_admin) values($1,0,true)',[adminId]);
   await user(adminId);
   const request=crypto.randomUUID();
   const issue=()=>value("select to_jsonb(create_gift_campaign(700,'signature','universal',2,$1,'{}',null,null,$2)) as value",[expires,request]);
   const gift=await issue();assert.equal(gift.funding_source,'platform');assert.equal((await issue()).id,gift.id);
   await db.exec('reset role');
   assert.equal(Number(await value('select coins as value from profiles where id=$1',[adminId])),0);
   assert.equal(Number(await value('select count(*) as value from wallet_transactions where profile_id=$1',[adminId])),0);
   const receipt=await claim(gift,alice);assert.equal(Number(receipt.remaining_amount),700);
   await db.exec('reset role');await db.query('update profiles set is_admin=false where id=$1',[adminId]);
   await user(adminId);assert.equal(Number(await value('select close_gift_campaign($1) as value',[gift.id])),0);
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[adminId])),0);
   assert.equal(Number(await value('select remaining_amount as value from gift_cards where id=$1',[receipt.id])),700);
   await assert.rejects(create({amount:5000000,quantity:2}),/Insufficient wallet/);
   const paid=await create({amount:100,quantity:2});assert.equal(paid.funding_source,'wallet');
   await db.exec('reset role');await db.query('update profiles set is_admin=true where id=$1',[maker]);
   await user(maker);assert.equal(Number(await value('select close_gift_campaign($1) as value',[paid.id])),200);
   await db.exec('reset role');await db.query('update profiles set is_admin=false where id=$1',[maker]);
   await db.exec(read('supabase/migrations/20261018120000_admin_sponsored_gift_cards.sql'));
   assert.equal(await value('select funding_source as value from gift_cards where id=$1',[gift.id]),'platform');
  });
  await t.test('expired campaign edits reopen available claims without extending previously claimed credit',async()=>{
   await db.exec('reset role');await db.exec(read('supabase/migrations/20261021200000_edit_gift_campaign.sql'));
   const card=await create({amount:100,quantity:2,service:'universal'});
   const receipt=await claim(card,alice);
   await db.exec('reset role');await db.query("update gift_cards set expires_at=now()-interval '1 day' where id=$1 or parent_gift_id=$1",[card.id]);
   const expiredClaim=await value('select expires_at as value from gift_cards where id=$1',[receipt.id]);
   const cash=Number(await value('select coins as value from profiles where id=$1',[maker]));
   await user(maker);const request=crypto.randomUUID();
   const saved=await value("select to_jsonb(update_gift_campaign($1,100,2,$2,'signature','universal',null,null,'{}',$3)) as value",[card.id,expires,request]);
   assert.equal(saved.status,'active');assert.equal(Date.parse(saved.expires_at),Date.parse(expires));
   await claim(saved,bob);
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[maker])),cash);
   assert.equal(new Date(await value('select expires_at as value from gift_cards where id=$1',[receipt.id])).getTime(),new Date(expiredClaim).getTime());
   await user(alice);assert.equal(Number((await balance(alice,'universal')).available),700);
  });
  await t.test('gift edit wallet top-ups are charged once even when saving is retried',async()=>{
   const card=await create({amount:100,quantity:2,service:'universal'});await db.exec('reset role');
   const cash=Number(await value('select coins as value from profiles where id=$1',[maker]));
   await user(maker);const request=crypto.randomUUID();
   const edit=()=>value("select to_jsonb(update_gift_campaign($1,200,3,$2,'signature','universal',null,null,'{}',$3)) as value",[card.id,expires,request]);
   assert.equal((await edit()).status,'active');assert.equal((await edit()).quantity,3);
   await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[maker])),cash-400);
  });
  await t.test('anonymous callers cannot create or redeem and cannot execute internal funding helpers',async()=>{
   await db.exec("reset role;select set_config('test.uid','',false);set role anon");await assert.rejects(value("select create_gift_campaign(1,'signature','support',1,now()+interval '1 day') as value"),/permission denied/);
   await assert.rejects(value("select zero_gift_balance_for_context($1,'bootcamps','{}') as value",[alice]),/permission denied/);
   assert.equal((await value("select submit_zero_form_with_gift('design','{}','pay',null,true) as value")).status,'sign_in_required');
  });
 }finally{await db.close();}
});
