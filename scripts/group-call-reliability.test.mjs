import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const identity={};
vm.runInNewContext(ts.transpileModule(read('src/features/groups/callIdentity.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:identity});
const admin='10000000-0000-0000-0000-000000000001',alice='20000000-0000-0000-0000-000000000002',outsider='30000000-0000-0000-0000-000000000003',group='40000000-0000-0000-0000-000000000004';

test('RTC presence overrides numeric and UUID member fallbacks without Joining placeholders',()=>{
  const members=[{profile_id:alice,profile:{username:'alice',full_name:'Alice',avatar_url:'photo.jpg'}}];
  const presence=[{profile_id:alice,uid:'123456',name:'Alice Updated',avatar:'new-photo.jpg'}];
  const byUid=identity.callPeopleByUid(presence,members);
  assert.equal(byUid.get('123456').name,'Alice Updated');
  assert.equal(byUid.get(String(identity.agoraUidFor(alice))).avatar,'photo.jpg');
  assert.equal(byUid.get(alice).name,'Alice');
});

test('real PostgreSQL group calls preserve background members and synchronize explicit endings',async t=>{
  const db=new PGlite();
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
      create table profiles(id uuid primary key,full_name text,username text,avatar_url text);
      create table chat_groups(id uuid primary key,call_active_since timestamptz,call_started_by uuid);
      create table chat_group_members(group_id uuid,profile_id uuid,role text,primary key(group_id,profile_id));
      create table chat_group_call_participants(group_id uuid,profile_id uuid,agora_uid bigint,joined_at timestamptz,last_seen timestamptz,primary key(group_id,profile_id));
      create table call_rings(kind text,target_id uuid,recipient_id uuid,ended_at timestamptz);
      create function chat_group_call_sweep(p_group uuid) returns void language plpgsql as $$begin update chat_groups set call_active_since=null where id=p_group;end$$;
      create function chat_group_call_sweep() returns boolean language plpgsql as $$begin update chat_groups set call_active_since=null;return true;end$$;
      insert into profiles values('${admin}','Admin','admin',null),('${alice}','Alice','alice',null);
      insert into auth.users values('${alice}','{"avatar_url":"https://example.com/alice.jpg"}');
      insert into chat_groups values('${group}',now(),'${admin}');
      insert into chat_group_members values('${group}','${admin}','owner'),('${group}','${alice}','member');
      insert into call_rings values('group_call','${group}','${alice}',null);`);
    await db.exec(read('supabase/migrations/20261017200000_group_call_reliability.sql'));
    const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
    const user=async id=>db.exec(`reset role;select set_config('test.uid','${id}',false);set role authenticated;`);
    await user(admin);
    let started=(await value('select group_call_state_v2($1) as value',[group])).started_at;
    const ac=crypto.randomUUID(),bc=crypto.randomUUID();
    const beat=async(id,connection,background=false,join=true,generation=started)=>{
      await user(id);return value('select group_call_heartbeat_v2($1,$2,$3,$4,$5,$6) as value',[group,identity.agoraUidFor(id),generation,connection,background,join]);
    };
    const leave=async(id,connection,end=false,generation=started)=>{
      await user(id);return value('select group_call_leave_v2($1,$2,$3,$4) as value',[group,generation,connection,end]);
    };
    await t.test('actual RTC IDs map to authenticated names and provider photos',async()=>{
      await beat(admin,ac);
      const state=await beat(alice,bc);
      assert.equal(state.active,true);assert.equal(state.people.length,2);
      const person=state.people.find(p=>p.profile_id===alice);
      assert.equal(person.uid,String(identity.agoraUidFor(alice)));
      assert.equal(person.name,'Alice');assert.equal(person.avatar,'https://example.com/alice.jpg');
      assert.equal(state.can_end,false);
    });
    await t.test('background leases survive old sweep readers and short missed heartbeats',async()=>{
      await beat(alice,bc,true,false);
      await db.exec('reset role');
      await db.query("update chat_groups set call_active_since=now()-interval '10 minutes' where id=$1",[group]);
      started=await value('select call_active_since as value from chat_groups where id=$1',[group]);
      await db.query("update chat_group_call_participants set last_seen=now()-interval '5 minutes',lease_until=case when profile_id=$2 then now()+interval '10 minutes' else now()-interval '1 minute' end where group_id=$1",[group,alice]);
      await db.query('select chat_group_call_sweep($1)',[group]);
      assert.equal(await value('select chat_group_call_sweep() as value'),false);
      await user(admin);
      assert.equal((await value('select group_call_state_v2($1) as value',[group])).active,true);
      await beat(admin,ac);
    });
    await t.test('leaving only removes that participant; late heartbeats cannot resurrect them',async()=>{
      assert.equal((await leave(alice,bc)).ended,false);
      assert.equal((await beat(alice,bc,false,false)).replaced,true);
      assert.equal((await beat(alice,bc,false,true)).replaced,true);
      await user(admin);const state=await value('select group_call_state_v2($1) as value',[group]);
      assert.equal(state.active,true);assert.deepEqual(state.people.map(p=>p.profile_id),[admin]);
    });
    await t.test('rejoining uses a new connection and rejects stale device leave requests',async()=>{
      const newConnection=crypto.randomUUID();
      assert.equal((await beat(alice,newConnection)).active,true);
      assert.equal((await leave(alice,bc)).stale,true);
      await assert.rejects(leave(alice,newConnection,true),/Only the call starter or group admins/);
    });
    await t.test('end for everyone is shared and old connections cannot revive the call',async()=>{
      assert.equal((await leave(admin,ac,true)).ended,true);
      await user(alice);assert.equal((await value('select group_call_state_v2($1) as value',[group])).active,false);
      assert.equal((await beat(admin,ac)).active,false);
      await db.exec('reset role');
      assert.equal(await value('select count(*)::int as value from call_rings where ended_at is null'),0);
    });
    await t.test('an old call cannot close a new call and the final participant ends it',async()=>{
      await db.exec('reset role');
      await db.query('update chat_groups set call_active_since=now(),call_started_by=$2 where id=$1',[group,admin]);
      const old=started;started=await value('select call_active_since as value from chat_groups where id=$1',[group]);
      const next=crypto.randomUUID();await beat(admin,next);
      assert.equal((await leave(admin,ac,true,old)).stale,true);
      assert.equal((await leave(admin,next)).ended,true);
    });
    await t.test('abandoned calls expire, outsiders and anonymous users cannot read call members',async()=>{
      await db.exec('reset role');await db.query("update chat_groups set call_active_since=now()-interval '20 minutes' where id=$1",[group]);
      await user(admin);assert.equal((await value('select group_call_state_v2($1) as value',[group])).active,false);
      await user(outsider);
      await assert.rejects(value('select group_call_state_v2($1) as value',[group]),/Not a group member/);
      await assert.rejects(value('select group_call_heartbeat_v2($1,1,now(),$2) as value',[group,crypto.randomUUID()]),/Not a group member/);
      await db.exec('reset role;set role anon');
      await assert.rejects(value('select group_call_state_v2($1) as value',[group]),/permission denied/);
    });
  } finally {await db.close();}
});
