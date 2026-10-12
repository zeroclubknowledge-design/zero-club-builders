import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(read('src/features/membership/plans.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, Intl });
test('membership screens follow current account mode, never a historic Creator tier', () => {
  for (const tier of ['Basic','Premium','Creator','CreatorMax']) {
    const learner = {account_type:'Learner',active_mode:'learner',tier};
    assert.equal(exports.membershipAudience(learner),'Learner');
    assert.equal(exports.fallbackClubCapacity(learner,0).can_create,false);
    assert.equal(exports.fallbackClubCapacity(learner,0).permanent_club_limit,0);
  }
  assert.equal(exports.membershipAudience({account_type:'Tutor',tier:'Creator'}),'Tutor');
  assert.equal(exports.membershipAudience({account_type:'Institution',active_mode:'creator'}),'Institution');
  assert.equal(exports.resolvePlanKey({account_type:'Learner',active_mode:'creator',tier:'Basic'}),'creator_basic');
  assert.equal(exports.canUseZeroAI({account_type:'Learner',active_mode:'creator',tier:'Creator'}),false);
  assert.equal(exports.canUseZeroAI({account_type:'Learner',active_mode:'creator',tier:'CreatorMax'}),true);
  assert.equal(exports.canUseZeroAI({account_type:'Tutor',tier:'Premium'}),false);
  assert.equal(exports.canUseZeroAI({account_type:'Tutor',tier:'Premium+'}),true);
});
const fn = (source,name) => {
  const start=source.indexOf('create or replace function public.'+name+'(');
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('$$;',start)+3);
};
test('PostgreSQL enforces Pro/Max pricing, mode restrictions, AI access, and gifted Max benefits', async t => {
 const db=new PGlite();
 const uid='00000000-0000-0000-0000-000000000001';
 const base=read('supabase/migrations/20260802120000_subscription_creator_club_system.sql');
 const payments=read('supabase/migrations/20260817120000_apply_zero_gifts_to_payments.sql');
 try {
  await db.exec(`create role authenticated;create role anon;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  create table profiles(id uuid primary key,username text,account_type text default 'Learner',active_mode text default 'learner',account_status text default 'active',tier text default 'Basic',tutor_enabled boolean default false,is_admin boolean default false,coins numeric default 100000,first_club_benefit_redeemed boolean default false,first_club_benefit_started_at timestamptz,first_club_benefit_expires_at timestamptz);
  create function is_zero_club_admin() returns boolean language sql stable security definer as $$select coalesce((select is_admin from profiles where id=auth.uid()),false)$$;
  create table platform_settings(key text,description text);
  create table bootcamps(id uuid primary key,creator_id uuid);
  create table clubs(id uuid primary key default gen_random_uuid(),creator_id uuid,club_type text default 'permanent',bootcamp_id uuid,status text default 'active',created_at timestamptz default now(),updated_at timestamptz,continuity_mode boolean default false,premium_experience_started_at timestamptz,premium_experience_expires_at timestamptz);
  create table notifications(id uuid default gen_random_uuid(),recipient_id uuid,actor_id uuid,type text,entity_id uuid,content text);
  create table admin_audit_logs(admin_id uuid,action text,target_type text,target_id uuid,details jsonb);
  create table zero_ai_daily_usage(profile_id uuid,request_day date,kind text check(kind in('chat','voice')),requests integer,primary key(profile_id,request_day,kind));
  create table zero_game_competitions(creator_id uuid,status text,created_at timestamptz);
  insert into profiles(id,username) values('${uid}','alice');select set_config('test.uid','${uid}',false);`);
  for(const table of ['subscription_plans','subscriptions']) {
   const start=base.indexOf('create table if not exists public.'+table+' (');
   await db.exec(base.slice(start,base.indexOf('\n);',start)+4));
  }
  const seed=base.indexOf('insert into public.subscription_plans');
  await db.exec(base.slice(seed,base.indexOf('updated_at = now();',seed)+'updated_at = now();'.length));
  for(const name of ['zero_club_plan_key','zero_club_permanent_club_limit','club_capacity_message','apply_creator_first_club_benefit','get_my_club_capacity','refresh_owned_club_continuity']) await db.exec(fn(base,name));
  await db.exec(`create function zero_game_reward_plan(uuid) returns text language sql as $$select zero_club_plan_key($1)$$;
  create function fund_zero_service_payment(uuid,text,numeric,boolean,text,text,text,jsonb) returns jsonb language plpgsql as $$begin update profiles set coins=coins-$3 where id=$1;return jsonb_build_object('status','paid','amount',$3);end$$;`);
  await db.exec(fn(read('supabase/migrations/20260802150000_zero_games_reward_allowances.sql'),'get_zero_game_reward_allowance'));
  await db.exec(fn(payments,'activate_membership'));
  await db.exec(read('supabase/migrations/20261012170000_admin_membership_gifts.sql'));
  await db.exec(read('supabase/migrations/20261012190000_personalized_pro_max_memberships.sql'));
  await db.exec('create trigger capacity before insert on clubs for each row execute function enforce_permanent_club_capacity();');
  const value=async(sql,params=[]) => (await db.query(sql,params)).rows[0].value;
  await t.test('prices and subscription names match the requested plans',async()=>{
   const prices=(await db.query("select key,name,price_amount from subscription_plans where key in('creator','creator_max','tutor_premium','tutor_premium_plus') order by key")).rows;
   assert.deepEqual(prices.map(p=>[p.key,p.name,Number(p.price_amount)]),[['creator','Creator PRO',3000],['creator_max','Creator Max',5000],['tutor_premium','Tutor Pro',7000],['tutor_premium_plus','Tutor Max',12000]]);
  });
  await t.test('learner cannot create clubs or buy a hidden Creator plan',async()=>{
   await assert.rejects(db.query('insert into clubs(creator_id) values($1)',[uid]),/Learners/);
   await assert.rejects(db.query("select activate_membership('creator',false,false)"),/current account mode/);
   assert.equal(await value('select can_use_zero_ai() as value'),true);
  });
  await t.test('Creator PRO charges 3000 and cannot invoke conversational AI',async()=>{
   await db.exec("update profiles set active_mode='creator';");
   assert.equal(Number((await value("select activate_membership('creator',false,false) as value")).amount),3000);
   assert.equal(await value('select can_use_zero_ai() as value'),false);
   await assert.rejects(db.query("select claim_zero_ai_request('chat')"),/ZERO_AI_MAX_REQUIRED/);
   assert.equal(await value("select claim_zero_ai_request('verification') as value"),true);
   await db.exec(`insert into clubs(creator_id) select '${uid}'::uuid from generate_series(1,3);`);
   await assert.rejects(db.query('insert into clubs(creator_id) values($1)',[uid]),/limit/);
  });
  await t.test('Creator Max activates AI and keeps existing clubs and plan limits',async()=>{
   assert.equal(Number((await value("select activate_membership('creator_max',false,false) as value")).amount),5000);
   assert.equal(await value('select can_use_zero_ai() as value'),true);
   assert.equal(await value("select claim_zero_ai_request('chat') as value"),true);
   assert.equal(await value('select tier as value from profiles'),'CreatorMax');
   assert.equal((await value('select get_zero_game_reward_allowance(auth.uid()) as value')).weekly_limit,12);
   await db.exec("update profiles set active_mode='learner';");
   assert.equal((await value('select get_my_club_capacity() as value')).can_create,false);
   await assert.rejects(db.query('insert into clubs(creator_id) values($1)',[uid]),/Learners/);
   await db.exec('select refresh_owned_club_continuity(auth.uid());');
   assert.equal(Number((await db.query("select count(*) n from clubs where status='active'")).rows[0].n),3);
  });
  await t.test('Tutor Pro charges 7000; Tutor Max charges 12000 and unlocks AI',async()=>{
   await db.exec("update profiles set account_type='Tutor',active_mode='tutor',tutor_enabled=true;");
   assert.equal(Number((await value("select activate_membership('tutor_premium',false,false) as value")).amount),7000);
   assert.equal(await value('select can_use_zero_ai() as value'),false);
   assert.equal(Number((await value("select activate_membership('tutor_premium_plus',false,false) as value")).amount),12000);
   assert.equal(await value('select can_use_zero_ai() as value'),true);
  });
  await t.test('admin can gift Creator Max and claiming sets the correct Max tier',async()=>{
   await db.exec("update profiles set account_type='Learner',active_mode='creator',is_admin=true,tutor_enabled=false;update subscriptions set status='expired';");
   const gift=await value("select admin_gift_membership('alice','creator_max',30,now()+interval '1 day') as value");
   await db.exec('update profiles set is_admin=false;');
   assert.equal((await value('select claim_membership_gift($1) as value',[gift.id])).status,'claimed');
   assert.equal(await value('select tier as value from profiles'),'CreatorMax');
   assert.equal(await value('select can_use_zero_ai() as value'),true);
  });
  await t.test('expired Max membership cannot continue using AI before a dashboard refresh',async()=>{
   await db.exec("update subscriptions set current_period_end=now()-interval '1 second' where status='active';");
   assert.equal(await value('select can_use_zero_ai() as value'),false);
   await assert.rejects(db.query("select claim_zero_ai_request('voice')"),/ZERO_AI_MAX_REQUIRED/);
  });
 }finally{await db.close();}
});
