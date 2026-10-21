import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const helpers={};
vm.runInNewContext(ts.transpileModule(read('src/features/groups/callRecording.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:helpers});

test('recording starts only after the shared announcement and cleans up failed/cancelled starts',async()=>{
  for(const scenario of ['success','failed','cancelled','rejected','encoder']) {
    const calls=[];
    const run=helpers.startAnnouncedCallRecording({
      announce:async on=>{calls.push(on);if(on && scenario==='rejected') throw Error('Unavailable');},
      start:async()=>{calls.push('start');if(scenario==='encoder') throw Error('Encoder');return scenario==='success';},
      isCurrent:()=>scenario!=='cancelled',
    });
    if(['rejected','encoder'].includes(scenario)) await assert.rejects(run);
    else assert.equal(await run,scenario==='success');
    assert.equal(calls[0],true);
    if(scenario==='success') assert.deepEqual(calls,[true,'start']);
    else assert.equal(calls.at(-1),false);
    if(['cancelled','rejected'].includes(scenario)) assert.ok(!calls.includes('start'));
  }
});

test('standalone recording repair enforces permissions and isolates call/device generations',async t=>{
  const db=new PGlite();
  const owner='10000000-0000-0000-0000-000000000001',member='20000000-0000-0000-0000-000000000002',other='30000000-0000-0000-0000-000000000003',group='40000000-0000-0000-0000-000000000004';
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
      create table profiles(id uuid primary key,full_name text,username text,avatar_url text);
      create table chat_groups(id uuid primary key,call_active_since timestamptz,call_started_by uuid);
      create table chat_group_members(group_id uuid,profile_id uuid,role text,primary key(group_id,profile_id));
      create table chat_group_call_participants(group_id uuid,profile_id uuid,agora_uid bigint,joined_at timestamptz,last_seen timestamptz,primary key(group_id,profile_id));
      create table call_rings(kind text,target_id uuid,recipient_id uuid,ended_at timestamptz);
      create table notices(content text);
      create function chat_group_display(p_id uuid) returns text language sql as $$select full_name from profiles where id=p_id$$;
      create function chat_group_system(uuid,text,uuid,text) returns uuid language plpgsql as $$begin insert into notices values($2);return null;end$$;
      create function chat_group_call_sweep(p_group uuid) returns void language plpgsql as $$begin end$$;
      create function chat_group_call_sweep() returns boolean language sql as $$select false$$;
      insert into profiles values('${owner}','Owner','owner',null),('${member}','Member','member',null);
      insert into chat_groups values('${group}',now(),'${owner}');
      insert into chat_group_members values('${group}','${owner}','owner'),('${group}','${member}','member');`);
    await db.exec(read('supabase/migrations/20261017200000_group_call_reliability.sql'));
    const repair=read('supabase/migrations/20261021220000_enable_group_call_recording.sql');
    await db.exec(repair);await db.exec(repair);
    const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
    const user=async id=>db.exec(`reset role;select set_config('test.uid','${id}',false);set role authenticated;`);
    let generation=await value('select call_active_since as value from chat_groups where id=$1',[group]);
    let oc=crypto.randomUUID();const mc=crypto.randomUUID();
    const beat=async(id,connection)=>{await user(id);return value('select group_call_heartbeat_v2($1,$2,$3,$4,false,true) as value',[group,id===owner?101:102,generation,connection]);};
    const record=async(id,connection,on=true,gen=generation)=>{await user(id);return value('select set_group_call_recording_v2($1,$2,$3,$4) as value',[group,on,gen,connection]);};
    const state=async id=>{await user(id);return value('select group_call_state_v2($1) as value',[group]);};
    await beat(owner,oc);await beat(member,mc);
    await t.test('members and outsiders cannot start recordings; starter can announce to everyone',async()=>{
      await assert.rejects(record(member,mc),/Only the call starter/);
      await assert.rejects(record(other,crypto.randomUUID()),/Not a group member/);
      assert.equal((await record(owner,oc)).recording_by,owner);
      assert.equal((await state(member)).recording_name,'Owner');
      await record(owner,oc);
      await db.exec('reset role');assert.equal(await value('select count(*)::int as value from notices'),1);
    });
    await t.test('admin competitors cannot override another recording; nonowner stop is harmless',async()=>{
      await db.exec('reset role');await db.query("update chat_group_members set role='admin' where profile_id=$1",[member]);
      await assert.rejects(record(member,mc),/already recording/);
      assert.equal((await record(member,mc,false)).recording_by,owner);
      assert.equal((await record(owner,oc,false)).recording_by,null);
      assert.equal((await record(member,mc)).recording_by,member);
      await record(member,mc,false);
    });
    await t.test('legacy deployed client can record after applying only this migration',async()=>{
      await user(owner);
      assert.equal((await value('select set_group_call_recording($1,true) as value',[group])).recording_by,owner);
      await value('select set_group_call_recording($1,false) as value',[group]);
    });
    await t.test('new device clears abandoned notice and old device cannot stop the new recording',async()=>{
      await record(owner,oc);const old=oc;oc=crypto.randomUUID();
      assert.equal((await beat(owner,oc)).recording_by,null);
      await record(owner,oc);
      assert.equal((await record(owner,old,false)).recording_by,owner);
      await assert.rejects(record(owner,old),/rejoin/);
    });
    await t.test('new call rejects delayed starts/stops and expired recorders do not end other participants calls',async()=>{
      const old=generation;await db.exec('reset role');
      await db.query('update chat_groups set call_active_since=now() where id=$1',[group]);
      generation=await value('select call_active_since as value from chat_groups where id=$1',[group]);
      assert.equal((await state(member)).recording_by,null);
      await record(owner,oc);
      assert.equal((await record(owner,oc,false,old)).recording_by,owner);
      await assert.rejects(record(owner,oc,true,old),/ended/);
      await db.exec('reset role');await db.query("update chat_group_call_participants set last_seen=now()-interval '4 minutes',lease_until=now()-interval '1 minute' where profile_id=$1",[owner]);
      const next=await state(member);assert.equal(next.recording_by,null);assert.equal(next.active,true);
      await assert.rejects(record(owner,oc),/rejoin/);
    });
    await db.exec('reset role;set role anon');
    await assert.rejects(value('select set_group_call_recording_v2($1,true,$2,$3) as value',[group,generation,oc]),/permission denied/);
  } finally { await db.close(); }
});
