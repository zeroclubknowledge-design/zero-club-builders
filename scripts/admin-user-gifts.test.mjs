import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const catalog = {};
vm.runInNewContext(ts.transpileModule(read('src/features/membership/giftCatalog.ts'), { compilerOptions: { module:ts.ModuleKind.CommonJS } }).outputText, { exports:catalog });
test('gift catalog includes every existing service, wallet support, subscriptions and points', () => {
  for (const kind of ['subscription','support','custom','zp','bootcamps','membership','zero-ai','tutor-session','zero-store']) assert.ok(catalog.giftType(kind));
  const plans=[{key:'learner',audience:'learner'},{key:'creator',audience:'creator'},{key:'tutor',audience:'tutor'},{key:'institution',audience:'institution'}];
  assert.equal(catalog.eligibleGiftPlans(plans,{account_type:'Learner'}).length,2);
  assert.equal(catalog.eligibleGiftPlans(plans,{account_type:'Tutor'}).length,1);
  assert.equal(catalog.eligibleGiftPlans(plans,{account_type:'Learner',tutor_enabled:true}).length,3);
  assert.equal(catalog.eligibleGiftPlans(plans,{account_type:'Learner',is_admin:true}).length,0);
});
test('real PostgreSQL gifts enforce recipient privacy, expiry, idempotency and accounting',async t => {
  const db=new PGlite();
  const admin='00000000-0000-0000-0000-000000000001', alice='00000000-0000-0000-0000-000000000002', bob='00000000-0000-0000-0000-000000000003';
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table profiles(id uuid primary key,username text,full_name text,avatar_url text,account_type text default 'Learner',account_status text default 'active',tutor_enabled boolean default false,is_admin boolean default false,coins numeric default 0,zp integer default 0);
      create function is_zero_club_admin() returns boolean language sql stable security definer as $$select coalesce((select is_admin from profiles where id=auth.uid()),false)$$;
      create table notifications(id uuid default gen_random_uuid(),recipient_id uuid,actor_id uuid,type text,entity_id uuid,content text);
      create table admin_audit_logs(admin_id uuid,action text,target_type text,target_id uuid,details jsonb);
      create table gift_cards(id uuid primary key default gen_random_uuid(),code text unique,creator_id uuid not null references profiles,amount numeric,template_id text,service text,message text,status text,claimed_by uuid,claimed_at timestamptz,remaining_amount numeric,redeemed_at timestamptz,created_at timestamptz default now());
      create table gift_redemptions(gift_card_id uuid,profile_id uuid,service text,amount numeric,payment_reference text,metadata jsonb);
      create table platform_rewards(id uuid primary key,kind text,reward_type text,admin_id uuid,recipient_id uuid,amount numeric,zp bigint,naira_cost bigint,reason text);
      create table wallet_entries(profile_id uuid,amount numeric,reference text unique);
      create function wallet_apply(uuid,text,numeric,text,text,text,jsonb) returns numeric language plpgsql as $$declare balance numeric;begin insert into wallet_entries values($1,$3,$6);update profiles set coins=coins+$3 where id=$1 returning coins into balance;return balance;end$$;
      create function award_profile_zp(uuid,text,text,integer,jsonb) returns integer language plpgsql as $$begin update profiles set zp=zp+$4 where id=$1;return $4;end$$;
      create function zp_per_naira() returns integer language sql immutable as $$select 10$$;
      insert into profiles(id,username,is_admin) values('${admin}','admin',true),('${alice}','alice',false),('${bob}','bob',false);`);
    const creditSql=read('supabase/migrations/20260817110000_restricted_zero_gift_balances.sql');
    for(const name of ['restricted_zero_gift_services','zero_gift_balance_for','consume_zero_gift']) {
      const start=creditSql.indexOf('create or replace function public.'+name+'(');
      await db.exec(creditSql.slice(start,creditSql.indexOf('$$;',start)+3));
    }
    await db.exec(read('supabase/migrations/20261012210000_admin_user_gifts.sql'));
    const user=async id => db.exec(`reset role;select set_config('test.uid','${id}',false);set role authenticated;`);
    const value=async (sql,args=[]) => (await db.query(sql,args)).rows[0].value;
    const send=async(kind,amount,username='alice',message='Well done!',deadline=new Date(Date.now()+86400000).toISOString(),request=crypto.randomUUID()) => {
      await user(admin);
      return value('select admin_send_user_gift($1,$2,$3,$4,$5,$6) as value',[username,kind,amount,message,deadline,request]);
    };
    const claim=async(id,recipient=alice) => { await user(recipient);return value('select claim_admin_user_gift($1) as value',[id]); };
    await t.test('only admins send and look up recipients; validates all fields',async()=>{
      await user(bob);
      await assert.rejects(value("select admin_gift_recipient('alice') as value"),/Only Zero Club admins/);
      await assert.rejects(value("select admin_send_user_gift('alice','support',10,'hi',now()+interval '1 day',gen_random_uuid()) as value"),/Only Zero Club admins/);
      await assert.rejects(send('invalid',100),/gift type/);
      await assert.rejects(send('support',0),/amount/);
      await assert.rejects(send('zp',11),/steps of 10/);
      await assert.rejects(send('custom',100,'alice',''),/Describe/);
      await assert.rejects(send('support',100,'missing'),/No user/);
      await assert.rejects(send('support',100,'alice','hi',new Date(Date.now()-1000).toISOString()),/future/);
      await user(admin);
      assert.equal((await value("select admin_gift_recipient(' @ALICE ') as value")).username,'alice');
    });
    const first=await send('support',500);
    await t.test('recipient-only gifts cannot be claimed or modified by other users',async()=>{
      await user(bob);
      assert.equal((await db.query('select * from admin_user_gifts')).rows.length,0);
      await assert.rejects(claim(first.id,bob),/not found/);
      await user(alice);
      assert.equal((await db.query('select * from admin_user_gifts')).rows.length,1);
      await assert.rejects(db.query("update admin_user_gifts set status='claimed'"),/permission denied/);
    });
    await t.test('wallet claim credits once, records platform cost and leaves admin wallet untouched',async()=>{
      assert.equal((await claim(first.id)).status,'claimed');
      assert.equal((await claim(first.id)).status,'already_claimed');
      await db.exec('reset role');
      assert.equal(Number(await value('select coins as value from profiles where id=$1',[alice])),500);
      assert.equal(Number(await value('select coins as value from profiles where id=$1',[admin])),0);
      assert.equal(Number(await value('select naira_cost as value from platform_rewards where id=$1',[first.id])),500);
      assert.equal(Number(await value('select count(*) as value from wallet_entries')),1);
    });
    await t.test('points and every service credit become real account benefits',async()=>{
      const points=await send('zp',1000);await claim(points.id);await claim(points.id);
      await db.exec('reset role');assert.equal(await value('select zp as value from profiles where id=$1',[alice]),1000);
      for(const kind of ['bootcamps','membership','zero-ai','tutor-session','zero-store']) {
        const gift=await send(kind,2000);await claim(gift.id);await claim(gift.id);
        await db.exec('reset role');
        const card=await value('select row_to_json(c) as value from gift_cards c where id=(select gift_card_id from admin_user_gifts where id=$1)',[gift.id]);
        assert.equal(card.claimed_by,alice);assert.equal(card.status,'claimed');assert.equal(card.service,kind);assert.equal(Number(card.remaining_amount),2000);
      }
    });
    await t.test('claimed credits work with the actual checkout consumption functions',async()=>{
      await db.exec('reset role');
      assert.equal(Number(await value("select zero_gift_balance_for($1,'bootcamps') as value",[alice])),2000);
      assert.equal(Number(await value("select consume_zero_gift($1,'bootcamps',750,'test_checkout','{}') as value",[alice])),750);
      assert.equal(Number(await value("select zero_gift_balance_for($1,'bootcamps') as value",[alice])),1250);
      assert.equal(Number(await value("select zero_gift_balance_for($1,'zero-store') as value",[alice])),2000);
      assert.equal(Number(await value("select zero_gift_balance_for($1,'bootcamps') as value",[bob])),0);
    });
    await t.test('server deadline prevents expired gifts from granting value',async()=>{
      const gift=await send('support',300);
      await db.exec('reset role');await db.query("update admin_user_gifts set claim_deadline=now()-interval '1 second' where id=$1",[gift.id]);
      assert.equal((await claim(gift.id)).status,'expired');
      await db.exec('reset role');assert.equal(Number(await value('select coins as value from profiles where id=$1',[alice])),500);
      assert.equal(Number(await value('select count(*) as value from platform_rewards where id=$1',[gift.id])),0);
    });
    await t.test('retried sends produce one gift and one notification; changed requests are rejected',async()=>{
      const deadline=new Date(Date.now()+86400000).toISOString(),request=crypto.randomUUID();
      const a=await send('custom',100,'alice','For your project',deadline,request);
      const b=await send('custom',100,'alice','For your project',deadline,request);assert.equal(a.id,b.id);
      await assert.rejects(send('custom',200,'alice','For your project',deadline,request),/another gift/);
      await db.exec('reset role');assert.equal(Number(await value('select count(*) as value from notifications where admin_gift_id=$1',[a.id])),1);
    });
  } finally { await db.close(); }
});
