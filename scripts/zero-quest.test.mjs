import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ids = Array.from({length: 8}, (_,i) => `00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
const [alice,bob,carol] = ids;
let sequence=0;
const request = () => `10000000-0000-0000-0000-${String(++sequence).padStart(12,'0')}`;

test('Zero Quest cooperative lifecycle and reward security in PostgreSQL', async t => {
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated;create role anon;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;
   create table profiles(id uuid primary key,xp integer default 0,full_name text,username text,avatar_url text,account_status text default 'active');
   insert into profiles(id,full_name,username) values ${ids.map((id,i)=>`('${id}','Player ${i+1}','player${i+1}')`).join(',')};`);
  const xp=read('supabase/migrations/20260803100000_reliable_xp_system.sql');
  await db.exec(xp.slice(0,xp.indexOf('create or replace function public.handle_post_xp_awards')));
  const migration=read('supabase/migrations/20261019140000_zero_quest.sql');
  await db.exec(migration);
  await db.exec(migration);
  const as=async id=>db.query("select set_config('test.uid',$1,false)",[id||'']);
  const action=async (who,room,act,payload={},req=request())=>{
   await as(who);
   return (await db.query('select zero_quest_action($1,$2,$3,$4) as result',[room,act,JSON.stringify(payload),req])).rows[0].result;
  };
  const snapshot=async (who,room)=>{await as(who);return (await db.query('select zero_quest_room($1) as result',[room])).rows[0].result;};
  const create=async ()=>action(alice,null,'create',{title:'Together City'});
  let room;
  await t.test('create retries reuse the room and membership is private',async()=>{
   const req=request();
   const first=await action(alice,null,'create',{title:'Together City'},req);
   assert.deepEqual(await action(alice,null,'create',{title:'Together City'},req),first);
   await assert.rejects(action(alice,null,'create',{title:'Changed payload'},req),/different action/);
   room=first.room_id;
   await assert.rejects(action(alice,null,'create',{title:'Another City'}),/current squad/);
   await assert.rejects(snapshot(bob,room),/Join this squad/);
   const state=await snapshot(alice,room);
   assert.equal(state.missions.length,8);
   assert.ok(state.missions.every(m=>!('answer' in m)));
   await assert.rejects(action(alice,room,'start'),/at least one teammate/);
  });
  const join=async(who,id)=>{
   const code=(await db.query('select invite_code from zero_quest_rooms where id=$1',[id])).rows[0].invite_code;
   return action(who,null,'join',{code:code.toLowerCase()});
  };
  await t.test('invite joining, readiness, capacity and host permissions',async()=>{
   await join(bob,room);await join(carol,room);
   await assert.rejects(action(bob,room,'start'),/Only the host/);
   await assert.rejects(action(alice,room,'start'),/online and ready/);
   for(const id of ids.slice(3,6)) await join(id,room);
   await assert.rejects(join(ids[6],room),/full/);
   for(const id of ids.slice(3,6)) await action(id,room,'leave');
   await action(bob,room,'ready',{ready:true});await action(carol,room,'ready',{ready:true});
   await action(alice,room,'start');
   assert.equal((await snapshot(bob,room)).room.status,'active');
   await assert.rejects(join(ids[6],room),/has started/);
  });
  await t.test('chat is scoped to members and game state survives rejoining',async()=>{
   await action(bob,room,'message',{body:'Let us build the code district first'});
   assert.equal((await snapshot(alice,room)).messages.length,1);
   await assert.rejects(action(ids[7],room,'message',{body:'intruder'}),/Join this squad/);
   await action(bob,room,'leave');
   assert.equal((await snapshot(alice,room)).room.status,'active');
   await join(bob,room);
   assert.equal((await snapshot(bob,room)).messages.length,1);
  });
  const answerFor=async mission=>(await db.query('select answer from zero_quest_questions where id=$1',[mission.question_id])).rows[0].answer;
  await t.test('answers are checked on server with cooldown and idempotent penalties',async()=>{
   const mission=(await snapshot(alice,room)).missions.find(m=>m.kind==='challenge');
   const correct=await answerFor(mission);const req=request();
   const payload={mission:mission.id,choice:(correct+1)%4};
   assert.equal((await action(alice,room,'answer',payload,req)).correct,false);
   await action(alice,room,'answer',payload,req);
   assert.equal((await snapshot(alice,room)).room.health,11);
   await assert.rejects(action(alice,room,'answer',{mission:mission.id,choice:correct}),/five seconds/);
   await db.exec("update zero_quest_attempts set attempted_at=now()-interval '6 seconds'");
   await action(alice,room,'answer',{mission:mission.id,choice:correct});
  });
  const work='Our city will help new learners find a small first project. We will ask three learners to try a short onboarding flow, record where they get stuck, and compare completion before and after the change.';
  await t.test('briefs need actual work, safe links and a different teammate review',async()=>{
   const mission=(await snapshot(alice,room)).missions.find(m=>m.kind==='brief');
   await assert.rejects(action(alice,room,'submit',{mission:mission.id,work:'done'}),/120/);
   await assert.rejects(action(alice,room,'submit',{mission:mission.id,work,url:'javascript:alert(1)'}),/HTTPS/);
   await action(alice,room,'submit',{mission:mission.id,work,url:'https://example.com/project'});
   await assert.rejects(action(alice,room,'review',{mission:mission.id,approve:true}),/teammate/);
   await assert.rejects(action(bob,room,'review',{mission:mission.id,approve:false,feedback:'no'}),/useful review/);
   await action(bob,room,'review',{mission:mission.id,approve:false,feedback:'Explain what you will measure during the test.'});
   assert.equal((await snapshot(alice,room)).missions.find(m=>m.id===mission.id).status,'open');
   await action(alice,room,'submit',{mission:mission.id,work});
   const req=request();const payload={mission:mission.id,approve:true,feedback:'Clear audience, test and outcome.'};
   await action(bob,room,'review',payload,req);await action(bob,room,'review',payload,req);
   assert.equal((await snapshot(alice,room)).members.find(m=>m.id===bob).contributions,1);
  });
  const complete=async id=>{
   for(const mission of (await snapshot(alice,id)).missions){
    if(mission.status==='complete') continue;
    if(mission.kind==='challenge') await action(alice,id,'answer',{mission:mission.id,choice:await answerFor(mission)});
    else {await action(alice,id,'submit',{mission:mission.id,work});await action(bob,id,'review',{mission:mission.id,approve:true});}
   }
  };
  await t.test('squad wins award XP once, while idle players earn no XP',async()=>{
   await complete(room);
   const state=await snapshot(alice,room);
   assert.equal(state.room.status,'won');
   assert.equal(state.members.find(m=>m.id===alice).xp_awarded,100);
   assert.equal(state.members.find(m=>m.id===bob).xp_awarded,100);
   assert.equal(state.members.find(m=>m.id===carol).xp_awarded,0);
   await db.query('select zero_quest_finish($1)',[room]);
   assert.equal((await db.query('select xp from profiles where id=$1',[alice])).rows[0].xp,100);
   await assert.rejects(action(alice,room,'answer',{mission:state.missions[0].id,choice:0}),/only open during/);
  });
  await t.test('three rewarded wins per UTC day; further wins remain playable',async()=>{
   for(let i=0;i<3;i++){
    const next=(await create()).room_id;
    await join(bob,next);await action(bob,next,'ready',{ready:true});await action(alice,next,'start');
    await complete(next);
    assert.equal((await snapshot(alice,next)).members.find(m=>m.id===alice).xp_awarded,i===2?0:100);
   }
   assert.equal((await db.query('select xp from profiles where id=$1',[alice])).rows[0].xp,300);
   await as(alice);const home=(await db.query('select zero_quest_home() as result')).rows[0].result;
   assert.equal(home.wins,4);assert.equal(home.rewarded_today,3);
  });
  await t.test('deadlines are server enforced and leaving transfers the host',async()=>{
   const id=(await create()).room_id;
   await join(bob,id);await action(alice,id,'leave');
   assert.equal((await snapshot(bob,id)).room.host_id,bob);
   await join(alice,id);await action(alice,id,'ready',{ready:true});await action(bob,id,'ready',{ready:true});await action(bob,id,'start');
   await db.query("update zero_quest_rooms set expires_at=now()-interval '1 second' where id=$1",[id]);
   assert.equal((await snapshot(bob,id)).room.status,'lost');
   assert.ok((await snapshot(bob,id)).members.every(m=>m.xp_awarded===0));
  });
  await t.test('a disconnected host keeps their place while connected teammates can start',async()=>{
   const id=(await create()).room_id;
   await join(bob,id);await join(carol,id);
   await action(bob,id,'ready',{ready:true});await action(carol,id,'ready',{ready:true});
   await db.query("update zero_quest_members set last_seen=now()-interval '2 minutes' where room_id=$1 and profile_id=$2",[id,alice]);
   await action(bob,id,'start');
   const state=await snapshot(alice,id);
   assert.equal(state.room.host_id,bob);
   assert.equal(state.members.find(m=>m.id===alice).left_at,null);
   const mission=state.missions.find(m=>m.kind==='challenge');
   const correct=await answerFor(mission);
   for(let i=0;i<12;i++){
    await db.exec("update zero_quest_attempts set attempted_at=now()-interval '6 seconds'");
    await action(bob,id,'answer',{mission:mission.id,choice:(correct+1)%4});
   }
   assert.equal((await snapshot(bob,id)).room.status,'lost');
   assert.equal((await snapshot(bob,id)).room.health,0);
  });
  await t.test('a departed author cannot permanently block a creative brief',async()=>{
   const id=(await create()).room_id;
   await join(bob,id);await join(carol,id);
   await action(bob,id,'ready',{ready:true});await action(carol,id,'ready',{ready:true});await action(alice,id,'start');
   const mission=(await snapshot(alice,id)).missions.find(m=>m.kind==='brief');
   await action(alice,id,'submit',{mission:mission.id,work});await action(alice,id,'leave');
   await assert.rejects(action(bob,id,'review',{mission:mission.id,approve:true}),/author has left/);
   await action(bob,id,'review',{mission:mission.id,approve:false,feedback:'Reopening so another teammate can finish the plan.'});
   await action(bob,id,'submit',{mission:mission.id,work});await action(carol,id,'review',{mission:mission.id,approve:true});
   assert.equal((await snapshot(bob,id)).missions.find(m=>m.id===mission.id).status,'complete');
   await db.query("update zero_quest_rooms set expires_at=now()-interval '1 second' where id=$1",[id]);
   await snapshot(bob,id);
  });
  await t.test('RLS and function grants hide answers and prohibit state/reward spoofing',async()=>{
   await as(alice);await db.exec('set role authenticated');
   await assert.rejects(db.exec('select * from zero_quest_questions'),/permission denied/);
   await assert.rejects(db.exec("update zero_quest_rooms set status='won'"),/permission denied/);
   await assert.rejects(db.exec('update zero_quest_members set xp_awarded=100000'),/permission denied/);
   await assert.rejects(db.query('select zero_quest_finish($1)',[room]),/permission denied/);
   await assert.rejects(db.exec('update profiles set xp=100000'),/permission denied/);
   await db.exec('reset role');await as(ids[7]);await db.exec('set role authenticated');
   assert.equal((await db.exec('select * from zero_quest_rooms'))[0].rows.length,0);
   await assert.rejects(snapshot(ids[7],room),/Join this squad/);
   await db.exec('reset role;set role anon');
   await assert.rejects(db.exec('select zero_quest_home()'),/permission denied/);
   await db.exec('reset role');await as(null);
   await assert.rejects(db.exec('select zero_quest_home()'),/Sign in/);
  });
 } finally {await db.close();}
});
