import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const read=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const migration=read('20261027090000_gift_claim_use_window.sql');
const maker='10000000-0000-0000-0000-000000000001',alice='20000000-0000-0000-0000-000000000002',bob='30000000-0000-0000-0000-000000000003',camp='40000000-0000-0000-0000-000000000004';
test('gift claim deadlines, recycling and payment integrity',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table profiles(id uuid primary key,coins integer default 0,full_name text,username text,avatar_url text,is_admin boolean default false);
   create table bootcamps(id uuid primary key,title text);
   create table clubs(id uuid primary key,name text,bootcamp_id uuid,parent_club_id uuid);
   create table notifications(profile_id uuid,actor_id uuid,type text,content text);
   create table wallet_transactions(id uuid default gen_random_uuid(),profile_id uuid,direction text,amount numeric,balance_after numeric,source text,description text,reference text unique,metadata jsonb);
   create function is_zero_club_admin() returns boolean language sql stable as $$select coalesce((select is_admin from profiles where id=auth.uid()),false)$$;
   insert into profiles(id,coins,username) values('${maker}',100000,'org'),('${alice}',500,'alice'),('${bob}',500,'bob');
   insert into bootcamps values('${camp}','Design Bootcamp');`);
  const wallet=read('20260806120000_wallet_reliability.sql'),start=wallet.indexOf('create or replace function public.wallet_apply(');
  await db.exec(wallet.slice(start,wallet.indexOf('$$;',start)+3));
  for(const file of ['20260725180000_create_zero_club_gift_cards.sql','20260813150000_gift_support_and_custom.sql','20260817110000_restricted_zero_gift_balances.sql','20261018090000_multi_claim_gift_cards.sql','20261018120000_admin_sponsored_gift_cards.sql','20261024090000_zero_gifts_club_scope.sql'])await db.exec(read(file));
  const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const user=id=>db.query("select set_config('test.uid',$1,false)",[id]);
  const create=async(hours=48,quantity=20)=>{await user(maker);return value("select to_jsonb(create_gift_campaign(500,'signature','bootcamps',$1,now()+make_interval(secs=>$2),'{}',null,null,$3)) as value",[quantity,hours*3600,crypto.randomUUID()]);};
  const claim=async(card,id)=>{await user(id);return value('select to_jsonb(claim_gift_card($1)) as value',[card.code]);};
  const row=id=>value('select to_jsonb(g) as value from gift_cards g where id=$1',[id]);
  const expire=id=>db.query("update gift_cards set expires_at=now()-interval '1 second' where id=$1",[id]);
  const sweep=id=>value('select refresh_zero_gift_claims($1) as value',[id]);
  const legacy=await create();const legacyReceipt=await claim(legacy,alice);
  await t.test('Browse installs before the earlier publishing and six-hour claim-window updates',async()=>{
    await db.exec(read('20261027150000_gift_browse_campaigns.sql'));
    await user('');await db.exec('set role anon');
    const gifts=await value('select browse_zero_gift_campaigns(null,null,100) as value');
    assert.equal(gifts.find(g=>g.id===legacy.id).claims_remaining,19);
    assert.ok(!gifts.some(g=>g.id===legacyReceipt.id));
    await db.exec('reset role');
  });
  await db.exec(migration);
  const visibilityMigration=read('20261027120000_publish_gift_campaigns.sql');
  await db.exec("alter table gift_cards add column is_public boolean not null default false");
  await db.exec(visibilityMigration);
  await t.test('existing and new campaigns are public across apps while personal receipts stay private',async()=>{
    assert.equal((await row(legacy.id)).is_public,true);
    assert.equal((await row(legacyReceipt.id)).is_public,false);
    const c=await create();assert.equal(c.is_public,true);
    const receipt=await claim(c,bob);assert.equal(receipt.is_public,false);
    // Older clients cannot accidentally hide campaigns with the former toggle.
    await db.query('update gift_cards set is_public=false where id=$1',[c.id]);
    assert.equal((await row(c.id)).is_public,true);
    await db.query('update gift_cards set is_public=true where id=$1',[receipt.id]);
    assert.equal((await row(receipt.id)).is_public,false);
    await db.query("insert into gift_cards(code,creator_id,amount,service,status,claimed_by,expires_at,is_public) values('PERSONAL',$1,500,'universal','claimed',$2,now()+interval '1 day',true)",[maker,alice]);
    assert.equal(await value("select is_public as value from gift_cards where code='PERSONAL'"),false);
    await db.query("insert into gift_cards(code,creator_id,amount,service,is_public) values('LEGACY-LINK',$1,500,'universal',true)",[maker]);
    assert.equal(await value("select is_public as value from gift_cards where code='LEGACY-LINK'"),false);
    await db.exec(visibilityMigration);
    assert.equal((await row(c.id)).is_public,true);
  });
  await t.test('rollout grants existing credit a capped grace window; rerunning never extends it',async()=>{
    const first=await row(legacyReceipt.id);assert.ok(first.claim_deadline_at);
    assert.ok(Date.parse(first.expires_at)<=Date.now()+6*3600000+1000);
    await db.exec(migration);assert.equal((await row(first.id)).expires_at,first.expires_at);
  });
  await t.test('a new claim reserves one slot for six hours and notifies the claimant',async()=>{
    const c=await create();const r=await claim(c,alice);
    assert.equal((await row(c.id)).claimed_count,1);
    assert.equal(Date.parse(r.expires_at)-Date.parse(r.claimed_at),6*3600000);
    assert.equal(r.expires_at,r.claim_deadline_at);
    assert.equal((await claim(c,alice)).id,r.id);
    assert.equal((await row(c.id)).claimed_count,1);
    assert.ok(Number(await value("select count(*) as value from notifications where profile_id=$1 and content like '%6 hours%'",[alice]))>0);
  });
  await t.test('a campaign with less than six hours left caps its claim deadline',async()=>{
    const c=await create(.5);const r=await claim(c,bob);assert.equal(r.expires_at,c.expires_at);
    await db.query("update gift_cards set expires_at=now()+interval '1 day' where id=$1",[r.id]);
    assert.equal((await row(r.id)).expires_at,r.claim_deadline_at);
  });
  await t.test('unused credit expires and returns 19 available places to 20 exactly once',async()=>{
    const c=await create();const r=await claim(c,alice);await expire(r.id);
    assert.equal(await sweep(c.id),1);assert.equal(await sweep(c.id),0);
    assert.equal((await row(c.id)).claimed_count,0);
    const expired=await row(r.id);assert.equal(expired.status,'cancelled');assert.equal(Number(expired.remaining_amount),0);assert.ok(expired.claim_released_at);
    assert.equal((await claim(c,alice)).id,r.id);assert.equal((await row(c.id)).claimed_count,0);
    await claim(c,bob);assert.equal((await row(c.id)).claimed_count,1);
  });
  await t.test('public reads and the next claim recycle a sold-out campaign without waiting for cron',async()=>{
    const c=await create(48,1);const r=await claim(c,alice);assert.equal((await row(c.id)).status,'claimed');await expire(r.id);
    const publicCard=await value('select get_gift_card_public($1) as value',[c.code]);assert.equal(publicCard.claims_remaining,1);assert.equal(publicCard.status,'active');
    const r2=await claim(c,bob);assert.notEqual(r2.id,r.id);assert.equal((await row(c.id)).claimed_count,1);
    const c2=await create(48,1);const first=await claim(c2,alice);await expire(first.id);await claim(c2,bob);assert.equal((await row(c2.id)).claimed_count,1);
  });
  await t.test('partly spent credit never returns a slot and cannot be spent after the deadline',async()=>{
    const c=await create(48,1);const r=await claim(c,alice);
    await db.query("insert into gift_redemptions(gift_card_id,profile_id,service,amount,payment_reference) values($1,$2,'bootcamps',100,'partial')",[r.id,alice]);
    await db.query('update gift_cards set remaining_amount=400 where id=$1',[r.id]);await expire(r.id);
    assert.equal(await sweep(c.id),0);assert.equal((await row(c.id)).claimed_count,1);
    await assert.rejects(claim(c,bob),/taken/);
    // Isolate this receipt from the earlier test gifts and use the real checkout primitive.
    await db.query("update gift_cards set expires_at=now()-interval '1 second' where claimed_by=$1 and id<>$2",[alice,r.id]);
    await user(alice);const result=await value("select fund_zero_service_payment($1,'bootcamps',100,true,'bootcamp','Registration','expired-checkout','{}') as value",[alice]);
    assert.equal(Number(result.gift_applied),0);assert.equal(Number(result.wallet_charged),100);
  });
  await t.test('shortening campaign expiry caps claims; extending it never revives a released claim',async()=>{
    const c=await create();const r=await claim(c,bob);await expire(c.id);
    assert.ok(Date.parse((await row(r.id)).expires_at)<Date.now());await sweep(c.id);
    await db.query("update gift_cards set expires_at=now()+interval '1 day' where id=$1",[c.id]);
    assert.equal(Number((await row(r.id)).remaining_amount),0);assert.equal((await row(r.id)).status,'cancelled');
    await user(bob);const page=await value('select get_gift_card_v2($1) as value',[c.code]);assert.equal(page.my_claim_expired,true);assert.equal(page.my_claim_released,true);
  });
  await t.test('editing value fully funds recycled places before another person claims',async()=>{
    const c=await create(48,1);const r=await claim(c,alice);await expire(r.id);await user(maker);
    const before=Number(await value('select coins as value from profiles where id=$1',[maker]));
    const request=crypto.randomUUID();
    const edit=()=>value("select to_jsonb(update_gift_campaign($1,1000,1,now()+interval '1 day','signature','bootcamps',null,null,'{}',$2)) as value",[c.id,request]);
    await edit();assert.equal(before-Number(await value('select coins as value from profiles where id=$1',[maker])),500);
    await edit();assert.equal(before-Number(await value('select coins as value from profiles where id=$1',[maker])),500);
    assert.equal(Number((await claim(c,bob)).remaining_amount),1000);
  });
  await t.test('closing refunds recycled wallet-funded slots once without refunding platform gifts',async()=>{
    const c=await create(48,1);const r=await claim(c,alice);await expire(r.id);await user(maker);
    assert.equal(Number(await value('select close_gift_campaign($1) as value',[c.id])),500);
    assert.equal(Number(await value('select close_gift_campaign($1) as value',[c.id])),0);
    await db.query('update profiles set is_admin=true where id=$1',[maker]);
    const sponsored=await create(48,1);assert.equal(sponsored.funding_source,'platform');
    assert.equal(Number(await value('select close_gift_campaign($1) as value',[sponsored.id])),0);
  });
  await t.test('Browse includes unfunded admin campaigns for guests and members without exposing personal credits',async()=>{
    await db.query('update profiles set coins=0,is_admin=true where id=$1',[maker]);
    const sponsored=await create(48,2);
    assert.equal(sponsored.funding_source,'platform');
    assert.equal(Number(await value('select coins as value from profiles where id=$1',[maker])),0);
    // Reproduce campaigns created before the visibility fix was installed.
    await db.exec('alter table gift_cards disable trigger publish_zero_gift_campaign');
    await db.query("update gift_cards set is_public=false,message='A 100% sponsored gift' where id=$1",[sponsored.id]);
    await db.exec('alter table gift_cards enable trigger publish_zero_gift_campaign');
    await db.exec('drop function if exists browse_gift_cards(text,text,integer)');
    await db.exec("create function public.browse_gift_cards(p_service text default null,p_search text default null,p_limit integer default 60) returns jsonb[] language sql as $$select array[]::jsonb[]$$");
    const browseMigration=read('20261027150000_gift_browse_campaigns.sql');
    await db.exec(browseMigration);await db.exec(browseMigration);
    const browse=async(service=null,search=null,limit=100)=>value('select browse_zero_gift_campaigns($1,$2,$3) as value',[service,search,limit]);
    await user('');await db.exec('set role anon');
    const guest=await browse();assert.ok(guest.some(g=>g.id===sponsored.id));
    assert.ok(guest.every(g=>!g.mine&&!g.claimed&&g.claims_remaining>0));
    assert.ok(guest.every(g=>!('claimed_by' in g)&&!('remaining_amount' in g)&&!('funding_source' in g)));
    assert.deepEqual((await value('select browse_gift_cards(null,null,100) as value')).map(g=>g.id),guest.map(g=>g.id));
    assert.deepEqual((await browse('bootcamps','100%')).map(g=>g.id),[sponsored.id]);
    assert.equal((await browse('membership','100%')).length,0);
    assert.ok((await browse(null,'@org')).some(g=>g.id===sponsored.id));
    assert.equal((await browse(null,null,1)).length,1);
    await assert.rejects(db.query('select * from gift_cards'),/permission denied/);
    await db.exec('reset role');
    const receipt=await claim(sponsored,alice);
    await db.exec('set role authenticated');
    const member=await browse();assert.equal(member.find(g=>g.id===sponsored.id).claimed,true);
    assert.equal(member.find(g=>g.id===sponsored.id).claims_remaining,1);
    assert.ok(!member.some(g=>g.id===receipt.id));
    await db.exec('reset role');await user(maker);
    assert.equal((await browse()).find(g=>g.id===sponsored.id).mine,true);
    await expire(receipt.id);assert.equal((await browse()).find(g=>g.id===sponsored.id).claims_remaining,2);
    await expire(sponsored.id);assert.ok(!(await browse()).some(g=>g.id===sponsored.id));
    const closed=await create();await value('select close_gift_campaign($1) as value',[closed.id]);
    assert.ok(!(await browse()).some(g=>g.id===closed.id));
    // Compatibility also supports deployments where the old RPC returned jsonb.
    await db.exec('drop function browse_gift_cards(text,text,integer)');
    await db.exec("create function browse_gift_cards(p_service text default null,p_search text default null,p_limit integer default 60) returns jsonb language sql as $$select '[]'::jsonb$$");
    await db.exec(browseMigration);
    assert.deepEqual(await value('select browse_gift_cards(null,null,100) as value'),await browse());
    await db.exec('drop function browse_gift_cards(text,text,integer)');
    await db.exec("create function browse_gift_cards(p_service text default null,p_search text default null,p_limit integer default 60) returns setof jsonb language sql as $$select value from jsonb_array_elements('[]'::jsonb)$$");
    await db.exec(browseMigration);
    assert.deepEqual(await value("select coalesce(jsonb_agg(value),'[]'::jsonb) as value from browse_gift_cards(null,null,100) value"),await browse());
  });
 }finally{await db.close();}
});
