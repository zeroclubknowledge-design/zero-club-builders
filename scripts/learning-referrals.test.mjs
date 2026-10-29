import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const owner='10000000-0000-0000-0000-000000000001',sharer='20000000-0000-0000-0000-000000000002',buyer='30000000-0000-0000-0000-000000000003',other='40000000-0000-0000-0000-000000000004',camp='50000000-0000-0000-0000-000000000005',form='60000000-0000-0000-0000-000000000006';
test('short referral links bind accounts and forms to real bootcamp commission settlement',async t=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,coins numeric default 0,full_name text,username text);
 create table bootcamps(id uuid primary key,referral_percent numeric default 0,creator_id uuid);
 create table zero_forms(id uuid primary key,slug text,status text,owner_id uuid,bootcamp_id uuid);
 create table bootcamp_referral_clicks(id uuid default gen_random_uuid(),bootcamp_id uuid,referrer_id uuid,visitor_id uuid,created_at timestamptz default now(),expires_at timestamptz default now()+interval '30 days');
 create table referral_earnings(referrer_id uuid,buyer_id uuid,bootcamp_id uuid,gross_amount numeric,percent numeric,amount numeric,payment_reference text unique,status text default 'pending');
 create table platform_revenue(source text,bootcamp_id uuid,buyer_id uuid,gross_amount numeric,fee_amount numeric,payment_reference text unique);
 create table notifications(profile_id uuid,actor_id uuid,type text,content text);
 create table wallet_transactions(profile_id uuid,direction text,amount numeric,reference text unique);
 create function zero_club_platform_fee_percent() returns numeric language sql immutable as $$select 10::numeric$$;
 create function wallet_apply(p_profile_id uuid,p_direction text,p_amount numeric,p_source text,p_description text,p_reference text,p_metadata jsonb default '{}') returns numeric language plpgsql as $$
 declare n numeric;begin
 if exists(select 1 from wallet_transactions where reference=p_reference) then select coins into n from profiles where id=p_profile_id;return n;end if;
 update profiles set coins=coins+case when p_direction='credit' then p_amount else -p_amount end where id=p_profile_id returning coins into n;
 if n<0 then raise exception 'Insufficient funds';end if;
 insert into wallet_transactions values(p_profile_id,p_direction,p_amount,p_reference);return n;end $$;
 insert into profiles values('${owner}',0,'Owner','owner'),('${sharer}',0,'Sharer','sharer'),('${buyer}',20000,'Buyer','buyer'),('${other}',20000,'Other','other');
 insert into bootcamps values('${camp}',15,'${owner}');insert into zero_forms values('${form}','design','published','${owner}','${camp}');
 create function submit_zero_form_v2(form_slug text,answers jsonb,intent text default 'pay',guest jsonb default null) returns jsonb language plpgsql as $$
 declare form public.zero_forms;caller uuid:=auth.uid();payable numeric:=10000;reference text:=coalesce(answers->>'reference','form-payment');begin
 select * into form from zero_forms where slug=form_slug;
 update public.profiles set coins = coins - payable where id = caller;
 update public.profiles set coins = coalesce(coins, 0) + payable where id = form.owner_id;
 return jsonb_build_object('status','confirmed');end $$;`);
 await db.exec(read('supabase/migrations/20260813180000_no_referral_on_coupon.sql'));
 const migration=read('supabase/migrations/20261029130000_short_learning_referral_links.sql');await db.exec(migration);await db.exec(migration);
 const uid=async id=>db.query("select set_config('test.uid',$1,false)",[id||'']);
 const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
 await uid(sharer);
 const code=await value('select create_learning_share_link($1,null) as value',[camp]);
 const formCode=await value('select create_learning_share_link(null,$1) as value',['design']);
 await t.test('stable short codes are unique per sharer and destination',async()=>{
   assert.match(code,/^[0-9a-f]{12}$/);assert.equal(await value('select create_learning_share_link($1,null) as value',[camp]),code);assert.notEqual(formCode,code);
   await uid(other);assert.notEqual(await value('select create_learning_share_link($1,null) as value',[camp]),code);await uid(sharer);
 });
 await t.test('public resolution points to the linked bootcamp/form without an open redirect',async()=>{
   assert.equal((await value('select resolve_learning_share_link($1) as value',[code])).referrer_id,sharer);
   const resolved=await value('select resolve_learning_share_link($1) as value',[formCode]);assert.equal(resolved.bootcamp_id,camp);assert.equal(resolved.form_slug,'design');
   assert.equal(await value('select resolve_learning_share_link($1) as value',['https://evil.example']),null);
 });
 await t.test('authenticated identity determines attribution; self-referral and stale visits fail',async()=>{
   assert.equal(await value('select record_learning_referral($1) as value',[code]),false);
   await uid(buyer);assert.equal(await value("select record_learning_referral($1,now()-interval '31 days') as value",[code]),false);
   assert.equal(await value('select record_learning_referral($1) as value',['000000000000']),false);
   assert.equal(await value('select record_learning_referral($1) as value',[formCode]),true);
   await value('select record_learning_referral($1) as value',[formCode]);assert.equal(Number(await value('select count(*) as value from bootcamp_referral_clicks')),1);
 });
 await t.test('form checkout pays the configured 15% referral, 10% fee and organiser remainder',async()=>{
   await value("select submit_zero_form_v2('design','{}') as value");
   const earning=await value('select to_jsonb(e) as value from referral_earnings e');assert.equal(earning.referrer_id,sharer);assert.equal(Number(earning.amount),1500);assert.equal(earning.status,'pending');
   assert.equal(Number(await value('select coins as value from profiles where id=$1',[owner])),7500);
   assert.equal(Number(await value('select fee_amount as value from platform_revenue')),1000);
   assert.equal(Number(await value('select coins as value from profiles where id=$1',[buyer])),10000);
 });
 await t.test('disabled referral rewards and coupon payments do not create earnings',async()=>{
   await db.exec('update bootcamps set referral_percent=0');await value("select settle_bootcamp_payment($1,$2,$3,100,'no-reward',false) as value",[camp,buyer,owner]);
   await db.exec('update bootcamps set referral_percent=15');await value("select settle_bootcamp_payment($1,$2,$3,100,'coupon',true) as value",[camp,buyer,owner]);
   assert.equal(Number(await value('select count(*) as value from referral_earnings')),1);
 });
 await t.test('anonymous creation and attribution are rejected; unpublished forms cannot be shared by outsiders',async()=>{
   await uid(null);await assert.rejects(value('select create_learning_share_link($1,null) as value',[camp]),/Sign in/);await assert.rejects(value('select record_learning_referral($1) as value',[code]),/Sign in/);
   await uid(sharer);await db.exec("update zero_forms set status='draft'");await assert.rejects(value("select create_learning_share_link(null,'design') as value"),/not available/);
 });
 await t.test('public visitors can resolve a link but cannot inspect the link table or create links',async()=>{
   await db.exec('set role anon');
   assert.ok(await value('select resolve_learning_share_link($1) as value',[code]));
   await assert.rejects(value('select count(*) as value from learning_share_links'),/permission denied/);
   await assert.rejects(value('select create_learning_share_link($1,null) as value',[camp]),/permission denied/);
   await db.exec('reset role');
 });
 await t.test('unrecognized live form settlement fails safely instead of replacing custom payment behavior',async()=>{
   await db.exec(`create or replace function submit_zero_form_v2(form_slug text,answers jsonb,intent text default 'pay',guest jsonb default null) returns jsonb language sql as $$select '{}'::jsonb$$;`);
   await assert.rejects(db.exec(migration),/settlement needs review/);await db.exec('rollback');
 });
 }finally{await db.close();}
});

test('sharing and anonymous-to-signed-in attribution use short links and retain the original visit',async()=>{
 const api={},store=new Map(),calls=[];let session=null;
 const code='123abc456def';const exports=ts.transpileModule(read('src/lib/learningReferrals.ts').replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(exports,{exports:api,useEffect:()=>{},Date,URLSearchParams,window:{location:{search:'?via='+code}},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},supabase:{auth:{getSession:async()=>({data:{session}})},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='create_learning_share_link'?code:name==='resolve_learning_share_link'?{bootcamp_id:camp,form_slug:'design'}:true,error:null};}}});
 await api.prepareLearningReferral({formSlug:'design'});assert.equal(calls.filter(x=>x.name==='record_learning_referral').length,0);
 session={user:{id:buyer}};await api.prepareLearningReferral({bootcampId:camp});
 assert.equal(calls.filter(x=>x.name==='record_learning_referral').length,1);
 const saved=JSON.parse(store.get('zero-learning-referrals-v1'))[camp];assert.equal(calls.find(x=>x.name==='record_learning_referral').args.p_seen_at,new Date(saved.seenAt).toISOString());
 assert.equal(await api.learningShareUrl({bootcampId:camp}),'https://www.zeroclubs.xyz/s/'+code);
 assert.equal(calls.at(-1).args.p_bootcamp_id,camp);
 assert.equal(read('src/lib/learningReferrals.ts'),read('Zero Form/src/lib/learningReferrals.ts'));
});

test('short redirect is server-side, fixed-origin and does not cache failures or tracking destinations',async()=>{
 let route;let response={data:{bootcamp_id:camp},error:null};let requests=0;
 const code=ts.transpileModule(read('src/routes/s.$code.ts').replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:{},Response,encodeURIComponent,createFileRoute:()=>options=>{route=options;},supabase:{rpc:async()=>{requests++;return response;}}});
 const get=code=>route.server.handlers.GET({params:{code}});
 const redirect=await get('ABC123DEF456');assert.equal(redirect.status,302);assert.equal(redirect.headers.get('Location'),`https://www.zeroclubs.xyz/app/bootcamps/${camp}?via=abc123def456`);assert.equal(redirect.headers.get('Cache-Control'),'no-store');
 response={data:{form_slug:'design',bootcamp_id:camp},error:null};assert.equal((await get('abc123def456')).headers.get('Location'),'https://www.zeroclubs.xyz/form/design?via=abc123def456');
 const before=requests;assert.equal((await get('https://evil.example')).status,404);assert.equal(requests,before);
 response={data:null,error:Error('offline')};assert.equal((await get('abc123def456')).status,503);
 response={data:null,error:null};assert.equal((await get('abc123def456')).status,404);
});
