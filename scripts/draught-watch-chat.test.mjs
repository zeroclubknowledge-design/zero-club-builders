import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('match comments fetch the newest page and return it in conversation order',async()=>{
  const exports={}, calls=[];
  const query={select(){return this;},eq(){return this;},order(...args){calls.push(args);return this;},limit(n){calls.push(n);return Promise.resolve({data:[{id:'new'},{id:'old'}],error:null});}};
  const source=ts.transpileModule(read('src/features/games/draught/api.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{exports,require:()=>({supabase:{from:()=>query}})});
  assert.equal((await exports.draughtComments('room')).map(c=>c.id).join(','),'old,new');
  assert.equal(calls[0][1].ascending,false);assert.equal(calls[1],200);
  assert.match(exports.draughtWatchError({code:'PGRST202'},'chat'),/Match chat/);
});

test('watch and chat repair runs independently of stakes, preserves player-only moves and private invites',async t=>{
  const db=new PGlite();
  const red='00000000-0000-0000-0000-000000000001',black='00000000-0000-0000-0000-000000000002',watcher='00000000-0000-0000-0000-000000000003';
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table profiles(id uuid primary key,full_name text,username text,avatar_url text,account_status text default 'active',zp integer default 500);
      insert into profiles(id,full_name) values('${red}','Red'),('${black}','Black'),('${watcher}','Watcher');`);
    await db.exec(read('supabase/migrations/20261019170000_zero_draught.sql'));
    const repair=read('supabase/migrations/20261022020000_draught_watch_chat.sql');
    await db.exec(repair);await db.exec(repair);
    const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
    const user=async id=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[id||'']);await db.exec('set role authenticated');};
    const action=async(id,room,action,payload={})=>{await user(id);return value('select zero_draught_action($1,$2,$3,$4) as value',[room,action,JSON.stringify(payload),crypto.randomUUID()]);};
    const snapshot=async id=>{await user(id);return value('select zero_draught_room($1) as value',[room]);};
    const comment=async(id,body)=>{await user(id);return value('select to_jsonb(zero_draught_comment($1,$2)) as value',[room,body]);};
    let room=(await action(red,null,'create')).room_id;
    const invite=(await snapshot(red)).room.code;
    await t.test('unstarted private invitations cannot be watched or commented on',async()=>{
      await assert.rejects(snapshot(watcher),/not open/);
      await assert.rejects(comment(watcher,'Private?'),/not open/);
      await user(watcher);assert.deepEqual(await value('select zero_draught_live() as value'),[]);
      assert.equal(await value('select count(id)::int as value from zero_draught_rooms'),0);
    });
    await action(black,null,'join',{code:invite});
    await t.test('watchers see live boards and profiles without invite codes or player privileges',async()=>{
      const state=await snapshot(watcher);assert.equal(state.viewer,'spectator');assert.equal(state.room.code,undefined);
      assert.equal(state.room.positions,undefined);assert.equal(state.pot,0);assert.equal(state.players.length,2);
      const link=await value('select zero_draught_invite($1) as value',[invite]);
      assert.equal(link.room_id,room);assert.equal(link.watchable,true);assert.equal(link.player,false);assert.equal(link.open,false);
      await user(watcher);const live=await value('select zero_draught_live() as value');assert.equal(live[0].id,room);assert.equal(live[0].stake,0);
      assert.equal((await value('select board as value from zero_draught_rooms where id=$1',[room])).length,64);
      await assert.rejects(value('select code as value from zero_draught_rooms where id=$1',[room]),/permission denied/);
      await assert.rejects(action(watcher,room,'move',{...state.moves[0],version:state.room.version}),/Join/);
      await assert.rejects(action(watcher,room,'resign'),/Join/);
      await user(watcher);await assert.rejects(db.query("update zero_draught_rooms set status='finished' where id=$1",[room]),/permission denied/);
      assert.equal((await snapshot(red)).room.code,invite);
    });
    await t.test('watchers can chat, players read it, spam and direct spoofed writes are blocked',async()=>{
      assert.equal((await comment(watcher,'  Great move!  ')).body,'Great move!');
      await assert.rejects(comment(watcher,'Again'),/Slow down/);
      await assert.rejects(comment(black,' '.repeat(10)),/1 to 280/);
      await assert.rejects(comment(black,'x'.repeat(281)),/1 to 280/);
      await user(red);assert.equal(await value('select count(*)::int as value from zero_draught_comments where room_id=$1',[room]),1);
      await assert.rejects(db.query('insert into zero_draught_comments(room_id,profile_id,body) values($1,$2,$3)',[room,red,'Spoof']),/permission denied/);
      await db.exec('reset role');await db.query("update profiles set account_status='suspended' where id=$1",[black]);
      await assert.rejects(comment(black,'Hello'),/cannot comment/);
    });
    await t.test('watchable setting also protects chat history and does not alter balances',async()=>{
      await db.exec('reset role');await db.query('update zero_draught_rooms set watchable=false where id=$1',[room]);
      await assert.rejects(snapshot(watcher),/not open/);await assert.rejects(comment(watcher,'Hidden'),/not open/);
      await user(watcher);assert.equal(await value('select count(*)::int as value from zero_draught_comments'),0);
      assert.deepEqual(await value('select zero_draught_live() as value'),[]);
      assert.equal((await snapshot(red)).viewer,'player');
      await db.exec('reset role');assert.equal(await value('select sum(zp)::int as value from profiles'),1500);
      assert.equal(await value("select to_regclass('zero_draught_stakes')::text as value"),null);
    });
    await user(null);await assert.rejects(value('select zero_draught_live() as value'),/Sign in/);
    await db.exec('reset role;set role anon');await assert.rejects(value('select zero_draught_live() as value'),/permission denied/);
  } finally {await db.close();}
});
