import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('campaign visits, signup credit, deduplication and ambassador isolation',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid,raw_user_meta_data jsonb,email_confirmed_at timestamptz);
 create table profiles(id uuid primary key,username text,full_name text);
 create table zs_amb_campaigns(id uuid primary key,title text,status text,tracking text,created_at timestamptz default now());
 create table zs_campaign_members(campaign_id uuid,profile_id uuid,code text unique);
 create table zs_campaign_results(id uuid default gen_random_uuid(),campaign_id uuid,ambassador_id uuid,kind text,referred_profile_id uuid,status text,reviewed_at timestamptz,created_at timestamptz default now(),unique(kind,referred_profile_id));
 insert into profiles values('10000000-0000-0000-0000-000000000001','amb','Ambassador');
 insert into zs_amb_campaigns values('20000000-0000-0000-0000-000000000001','First campaign','live','both',now());
 insert into zs_campaign_members values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','CAMP123');`);
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261102100000_campaign_referral_tracking.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const visitor='30000000-0000-0000-0000-000000000001';
 const visit=async code=>(await db.query('select zs_record_campaign_visit($1,$2) as ok',[code,visitor])).rows[0].ok;
 assert.equal(await visit(' camp123 '),true);assert.equal(await visit('CAMP123'),true);assert.equal(await visit('INVALID'),false);
 await db.exec(`insert into auth.users values('40000000-0000-0000-0000-000000000001','{"zs_campaign_code":"CAMP123"}',null);insert into profiles values('40000000-0000-0000-0000-000000000001','newmember','New Member');`);
 assert.equal((await db.query('select count(*) as n from zs_campaign_results')).rows[0].n,0);
 await db.exec("update auth.users set email_confirmed_at=now()");
 const uid=async id=>db.query("select set_config('test.uid',$1,false)",[id]);
 const tracking=async()=>(await db.query('select zs_my_referral_tracking() as value')).rows[0].value;
 await uid('10000000-0000-0000-0000-000000000001');let data=await tracking();assert.equal(data.campaigns[0].visitors,1);assert.equal(data.campaigns[0].signups,1);assert.equal(data.referrals[0].username,'newmember');
 await uid(visitor);data=await tracking();assert.deepEqual(data.campaigns,[]);assert.deepEqual(data.referrals,[]);
 assert.equal((await db.query("select has_table_privilege('anon','zs_campaign_visits','select') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
