import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {PGlite} from '@electric-sql/pglite';
const owner='10000000-0000-0000-0000-000000000001',a='20000000-0000-0000-0000-000000000002',b='30000000-0000-0000-0000-000000000003',c='40000000-0000-0000-0000-000000000004',camp='50000000-0000-0000-0000-000000000005',club='60000000-0000-0000-0000-000000000006';
const migration=fs.readFileSync(new URL('../supabase/migrations/20261028120000_multiple_bootcamp_tutors.sql',import.meta.url),'utf8');
test('multiple tutor assignments are owner-controlled, atomic and compatible with existing assignments',async t=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   create table profiles(id uuid primary key,is_admin boolean default false);
   create table bootcamps(id uuid primary key,creator_id uuid,title text,status text default 'active',assigned_tutor_id uuid);
   create table institution_tutors(institution_id uuid,tutor_id uuid,unique(institution_id,tutor_id));
   create table clubs(id uuid primary key,creator_id uuid,bootcamp_id uuid);
   create table club_members(id uuid default gen_random_uuid(),club_id uuid,profile_id uuid,role text,status text default 'active',unique(club_id,profile_id));
   create function can_manage_bootcamp(uuid) returns boolean language sql security definer as $$select exists(select 1 from bootcamps where id=$1 and(creator_id=auth.uid() or assigned_tutor_id=auth.uid()))$$;
   alter table bootcamps enable row level security;grant select,update on bootcamps to authenticated;
   create policy bootcamp_read on bootcamps for select to authenticated using(can_manage_bootcamp(id));
   create policy bootcamp_update on bootcamps for update to authenticated using(can_manage_bootcamp(id)) with check(can_manage_bootcamp(id));
   insert into profiles(id) values('${owner}'),('${a}'),('${b}'),('${c}');
   insert into institution_tutors values('${owner}','${a}'),('${owner}','${b}');
   insert into bootcamps(id,creator_id,title,assigned_tutor_id) values('${camp}','${owner}','Design','${a}');
   insert into clubs values('${club}','${owner}','${camp}');
   insert into club_members(club_id,profile_id,role) values('${club}','${a}','Administrator'),('${club}','${b}','Member');`);
  await db.exec(migration);
  const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const user=id=>db.query("select set_config('test.uid',$1,false)",[id]);
  const row=()=>value('select to_jsonb(b) as value from bootcamps b where id=$1',[camp]);
  const save=ids=>value('select to_jsonb(set_bootcamp_tutors($1,$2)) as value',[camp,ids]);
  const role=id=>value('select role as value from club_members where club_id=$1 and profile_id=$2',[club,id]);
  await user(owner);
  await t.test('backfills the existing tutor; owner can save several tutors without duplicates',async()=>{
   assert.deepEqual((await row()).assigned_tutor_ids,[a]);
   await save([a,b,b]);assert.deepEqual((await row()).assigned_tutor_ids,[a,b]);assert.equal((await row()).assigned_tutor_id,a);
   assert.equal(await role(a),'Administrator');assert.equal(await role(b),'Administrator');
   await db.exec(migration);assert.deepEqual((await row()).assigned_tutor_ids,[a,b]);
  });
  await t.test('only the owner can assign and all selected tutors must belong to the organization',async()=>{
   await user(a);await assert.rejects(save([a]),/Only the bootcamp creator/);
   await user(c);await assert.rejects(save([c]),/Only the bootcamp creator/);
   await user(owner);await assert.rejects(save([a,c]),/belong to your organization/);
   assert.deepEqual((await row()).assigned_tutor_ids,[a,b]);
  });
  await t.test('removal restores old roles and retains independently appointed administrators',async()=>{
   await save([b]);assert.equal(await role(a),'Administrator');
   await save([]);assert.equal(await role(b),'Member');assert.equal((await row()).assigned_tutor_id,null);
   await db.query('insert into institution_tutors values($1,$2)',[owner,c]);
   await save([c]);assert.equal(await role(c),'Administrator');
   await save([]);assert.equal(await role(c),undefined);
  });
  await t.test('older clients changing the primary tutor retain the other assigned tutors',async()=>{
   await save([a,b]);await db.query('update bootcamps set assigned_tutor_id=$1 where id=$2',[c,camp]);
   assert.deepEqual((await row()).assigned_tutor_ids,[c,b]);assert.equal((await row()).assigned_tutor_id,c);
  });
  await t.test('every assigned tutor can find the bootcamp, while owner-only editing stays protected',async()=>{
   await user(b);await db.exec('set role authenticated');
   assert.equal(await value('select can_manage_bootcamp($1) as value',[camp]),true);
   assert.equal((await db.query('select id from bootcamps where assigned_tutor_ids @> array[$1]::uuid[]',[b])).rows.length,1);
   assert.equal((await db.query("update bootcamps set title='Not allowed' where id=$1 returning id",[camp])).rows.length,0);
   await assert.rejects(db.query('select * from bootcamp_tutor_club_access'),/permission denied/);
   await db.exec('reset role');await user(owner);
   assert.equal((await row()).title,'Design');
  });
  await t.test('club permission failures roll back the whole assignment, including the primary tutor',async()=>{
   await save([]);
   await db.exec(`alter table club_members add constraint block_test_grant check(profile_id<>'${b}' or role<>'Administrator')`);
   await assert.rejects(save([b]),/block_test_grant/);
   assert.deepEqual((await row()).assigned_tutor_ids,[]);assert.equal((await row()).assigned_tutor_id,null);assert.equal(await role(b),'Member');
   await db.exec('alter table club_members drop constraint block_test_grant');
   await save([a,b]);assert.deepEqual((await row()).assigned_tutor_ids,[a,b]);
  });
  await t.test('legacy membership tables without a composite unique constraint still support assignment',async()=>{
   await save([]);await db.exec('alter table club_members drop constraint club_members_club_id_profile_id_key');
   await save([a,b,c]);assert.deepEqual((await row()).assigned_tutor_ids,[a,b,c]);assert.equal(await role(c),'Administrator');
   await save([]);assert.equal(await role(b),'Member');assert.equal(await role(c),undefined);
  });
 }finally{await db.close();}
});

test('assignment controls never sit inside a card navigation handler or link',()=>{
 const source=fs.readFileSync(new URL('../src/routes/app.institution-studio.index.tsx',import.meta.url),'utf8');
 const file=ts.createSourceFile('institution.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let checked=0;
 function visit(node,ancestors=[]){
  if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)){
   const opening=ts.isJsxElement(node)?node.openingElement:node;
   const attributes=opening.attributes.properties;
   const assignment=attributes.some(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(file)==='onClick'&&attr.getText(file).includes('setAssignDrawer(b.id)'));
   const menu=attributes.some(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(file)==='aria-label'&&attr.getText(file).includes('Actions for'));
   if(assignment||menu){checked++;
    for(const parent of ancestors){
     assert.ok(!['Link','a'].includes(parent.tagName.getText(file)),'assignment controls must not be nested inside navigation links');
     assert.ok(!parent.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&['onClick','onPointerDown'].includes(attr.name.getText(file))&&attr.getText(file).includes('navigate(')),'card navigation must not capture assignment actions');
    }
   }
   ancestors=[...ancestors,opening];
  }
  ts.forEachChild(node,child=>visit(child,ancestors));
 }
 visit(file);assert.ok(checked>=3,'check the assign button, three-dot menu and menu assignment action');
});
test('tutor IDs merge legacy and multiple assignments without duplicates',()=>{
 const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/features/bootcamps/tutors.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,Set});
 assert.deepEqual(Array.from(api.assignedBootcampTutorIds({assigned_tutor_id:a,assigned_tutor_ids:[a,b]})),[a,b]);
 assert.equal(api.isAssignedBootcampTutor({assigned_tutor_ids:[a,b]},b),true);
 assert.equal(api.isAssignedBootcampTutor({assigned_tutor_id:a},c),false);
});
