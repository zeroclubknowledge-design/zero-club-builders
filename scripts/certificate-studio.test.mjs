import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration=fs.readFileSync(new URL('../supabase/migrations/20261018130000_certificate_design_studio.sql',import.meta.url),'utf8');
const basic='10000000-0000-0000-0000-000000000001',pro='20000000-0000-0000-0000-000000000002',org='30000000-0000-0000-0000-000000000003',learner='40000000-0000-0000-0000-000000000004';
const signature=id=>`https://project.supabase.co/storage/v1/object/public/certificate-assets/${id}/signature-aaaaaaaa.png`;
const logo=id=>`https://project.supabase.co/storage/v1/object/public/certificate-assets/${id}/logo-aaaaaaaa.png`;
const design=(id,brand=false)=>({artwork_version:2,template:'folio',use_brand:brand,brand_name:'Studio Academy',brand_logo:brand?logo(id):'',signature_url:signature(id),signer_name:'Taylor Smith',signer_title:'Programme Director',back_text:'Practical learning and achievement.',appearance:{background_color:'#142630',back_background_color:'#203b48',text_color:'#f8f5ed',heading_font:'georgia',heading:'Certificate of Achievement',show_texture:false,alignment:'left'}});
test('certificate studio uses server permissions and immutable issuance snapshots',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema storage;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table profiles(id uuid primary key,is_admin boolean default false,account_type text,full_name text,username text,avatar_url text,plan_key text);
   create table bootcamps(id uuid primary key default gen_random_uuid(),creator_id uuid references profiles(id),title text,certificate_enabled boolean default true);
   create table bootcamp_certificates(id uuid primary key default gen_random_uuid(),code text unique,bootcamp_id uuid references bootcamps(id),learner_name text,revoked_at timestamptz);
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   create policy legacy_storage on storage.objects for all to authenticated using(true) with check(true);
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
   create function refresh_my_subscription_lifecycle() returns void language plpgsql as $$begin return;end$$;
   create function zero_club_plan_key(target_profile uuid) returns text language sql stable as $$select plan_key from profiles where id=target_profile$$;
   create function get_bootcamp_certificate(p_code text) returns jsonb language sql stable as $$select jsonb_build_object('code',code,'learner_name',learner_name,'revoked',revoked_at is not null) from bootcamp_certificates where upper(code)=upper(btrim(p_code))$$;
   grant usage on schema storage to authenticated;
   grant select on profiles to authenticated;
   grant select,insert,update on bootcamps,bootcamp_certificates to authenticated;
   grant select,insert,update,delete on storage.objects to authenticated;
   insert into profiles(id,account_type,plan_key) values('${basic}','Tutor','tutor_basic'),('${pro}','Tutor','tutor_premium'),('${org}','Institution','institution'),('${learner}','Learner','learner_premium');
   insert into bootcamps(id,creator_id,title) values('50000000-0000-0000-0000-000000000005','${basic}','Legacy camp');
   insert into bootcamp_certificates(code,bootcamp_id,learner_name) values('LEGACY','50000000-0000-0000-0000-000000000005','Legacy Learner');`);
  await db.exec(migration);await db.exec(migration);
  for(const id of [basic,pro,org])await db.query("insert into storage.objects(bucket_id,name) values('certificate-assets',$1),('certificate-assets',$2)",[`${id}/signature-aaaaaaaa.png`,`${id}/logo-aaaaaaaa.png`]);
  const user=async id=>db.exec(`reset role;select set_config('test.uid','${id}',false);set role authenticated;`);
  const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const save=async(id,d)=>{await user(id);return value('select save_certificate_defaults($1) as value',[d]);};
  let camp,cert;
  await t.test('basic tutors can save Zero Club designs but cannot spoof Pro branding',async()=>{
   await save(basic,design(basic));const capabilities=await value('select get_my_certificate_studio() as value');assert.equal(capabilities.can_manage,true);assert.equal(capabilities.can_brand,false);assert.equal(capabilities.defaults.template,'folio');
   await assert.rejects(save(basic,design(basic,true)),/Custom branding requires/);
   await assert.rejects(save(basic,{...design(basic),signature_url:''}),/transparent PNG/);
   await assert.rejects(save(basic,{...design(basic),signature_url:signature(pro)}),/transparent PNG/);
   await assert.rejects(save(basic,{...design(basic),signature_url:signature(basic).replace('aaaaaaaa','bbbbbbbb')}),/Signature upload not found/);
   await assert.rejects(save(basic,{...design(basic),template:'invented'}),/Choose a certificate template/);
   await assert.rejects(db.query('select * from certificate_design_defaults'),/permission denied/);
  });
  await t.test('Pro tutors and organizations can use their own logos; learners cannot configure certificates',async()=>{
   await save(pro,design(pro,true));assert.equal((await value('select get_my_certificate_studio() as value')).can_brand,true);
   assert.deepEqual((await value('select get_my_certificate_studio() as value')).defaults.appearance,design(pro,true).appearance);
   await save(org,design(org,true));assert.equal((await value('select get_my_certificate_studio() as value')).can_brand,true);
   await assert.rejects(save(learner,design(learner)),/Tutors and organizations/);
  });
  await t.test('new bootcamps require a template and signature; only the creator can change the design',async()=>{
   await user(basic);await assert.rejects(value('insert into bootcamps(creator_id,title) values($1,$2) returning id as value',[basic,'Missing design']),/Choose a certificate template/);
   camp=await value('insert into bootcamps(creator_id,title,certificate_design) values($1,$2,$3) returning id as value',[basic,'New bootcamp',design(basic)]);
   await user(pro);await assert.rejects(db.query('update bootcamps set certificate_design=$1 where id=$2',[design(pro,true),camp]),/Only the bootcamp creator/);
   await user(basic);await assert.rejects(db.query('update bootcamps set certificate_enabled=false,certificate_design=$1 where id=$2',[{...design(basic),signature_url:''},camp]),/transparent PNG/);
   await db.query('update bootcamps set certificate_enabled=false,certificate_design=null where id=$1',[camp]);
   await assert.rejects(db.query('update bootcamps set certificate_enabled=true where id=$1',[camp]),/Choose a certificate template/);
   await db.query('update bootcamps set certificate_enabled=true,certificate_design=$1 where id=$2',[design(basic),camp]);
  });
  await t.test('issuance snapshots the chosen design and later edits do not rewrite certificates',async()=>{
   await user(basic);cert=await value("insert into bootcamp_certificates(code,bootcamp_id,learner_name) values('NEW-CERT',$1,'Alex Morgan') returning id as value",[camp]);
   await db.query('update bootcamps set certificate_design=$1 where id=$2',[{...design(basic),template:'orbit'},camp]);
   assert.equal((await value('select design_snapshot as value from bootcamp_certificates where id=$1',[cert])).template,'folio');
   assert.equal((await value('select design_snapshot as value from bootcamp_certificates where id=$1',[cert])).artwork_version,2);
   assert.deepEqual((await value('select design_snapshot as value from bootcamp_certificates where id=$1',[cert])).appearance,design(basic).appearance);
   await assert.rejects(db.query('update bootcamp_certificates set design_snapshot=$1 where id=$2',[{...design(basic),template:'orbit'},cert]),/Issued certificate designs cannot be changed/);
   await db.query('update bootcamp_certificates set revoked_at=now() where id=$1',[cert]);
   await db.exec("reset role;select set_config('test.uid','',false);set role anon");
   const publicCert=await value("select get_bootcamp_certificate_v2('new-cert') as value");assert.equal(publicCert.design.template,'folio');assert.equal(publicCert.revoked,true);
   assert.deepEqual(publicCert.design.appearance,design(basic).appearance);
   assert.equal((await value("select get_bootcamp_certificate_v2('LEGACY') as value")).design,null);
   assert.equal(await value("select get_bootcamp_certificate_v2('missing') as value"),null);
  });
  await t.test('losing Pro access blocks new own-brand designs while issued branding stays intact',async()=>{
   await user(pro);
   const brandCamp=await value('insert into bootcamps(creator_id,title,certificate_design) values($1,$2,$3) returning id as value',[pro,'Branded programme',design(pro,true)]);
   await db.query("insert into bootcamp_certificates(code,bootcamp_id,learner_name) values('BRANDED',$1,'Alex Morgan')",[brandCamp]);
   await db.exec('reset role');await db.query("update profiles set plan_key='tutor_basic' where id=$1",[pro]);
   await assert.rejects(save(pro,design(pro,true)),/Custom branding requires/);
   await save(pro,design(pro,false));
   await db.exec("reset role;select set_config('test.uid','',false);set role anon");
   assert.equal((await value("select get_bootcamp_certificate_v2('BRANDED') as value")).design.use_brand,true);
  });
  await t.test('issued assets cannot be overwritten or deleted even with legacy broad storage policies',async()=>{
   await user(basic);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('certificate-assets',$1)",[`${pro}/forged.png`]),/row-level security/);
   assert.equal((await db.query("update storage.objects set name='changed' where bucket_id='certificate-assets' returning id")).rows.length,0);
   assert.equal((await db.query("delete from storage.objects where bucket_id='certificate-assets' returning id")).rows.length,0);
   await db.exec("reset role;select set_config('test.uid','',false);set role anon");
   await assert.rejects(value('select get_my_certificate_studio() as value'),/permission denied/);
  });
 }finally{await db.close();}
});
