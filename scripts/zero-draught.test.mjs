import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const read = path => fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const engine = {};
vm.runInNewContext(ts.transpileModule(read('src/features/games/draught/engine.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:engine});
const {initialDraught,draughtMoves,moveDraught,chooseComputerMove,positionKey}=engine;
const plain = value => JSON.parse(JSON.stringify(value));
const position = (pieces,turn=1) => {const board=Array(64).fill(0);for(const [square,piece] of pieces)board[square]=piece;return {...plain(initialDraught()),board,turn,positions:{[positionKey(board,turn)]:1}};};
test('Draught starts with 12 pieces each and legal computer moves',()=>{
 const start=initialDraught();assert.equal(start.board.filter(p=>p===1).length,12);assert.equal(start.board.filter(p=>p===-1).length,12);
 assert.equal(draughtMoves(start.board,1).length,7);
 const computer=chooseComputerMove(start,3);assert.ok(draughtMoves(start.board,1).some(m=>m.from===computer.from&&m.to===computer.to));
});
test('mandatory captures, chained jumps and crown-ending turns',()=>{
 let state=position([[17,1],[26,-1],[44,-1],[60,-1],[1,1]]);
 assert.deepEqual(plain(draughtMoves(state.board,1)),[{from:17,to:35,capture:26}]);
 assert.throws(()=>moveDraught(state,1,8),/legal move/);
 state=moveDraught(state,17,35);assert.equal(state.turn,1);assert.equal(state.forced,35);
 state=moveDraught(state,35,53);assert.equal(state.turn,-1);assert.equal(state.forced,null);
 state=position([[40,1],[49,-1],[51,-1],[7,-1]]);
 state=moveDraught(state,40,58);assert.equal(state.board[58],2);assert.equal(state.turn,-1);assert.equal(state.forced,null);
 assert.ok(draughtMoves(state.board,1).some(m=>m.from===58&&m.to===44&&m.capture===51));
 assert.ok(draughtMoves(position([[35,2]]).board,1).some(m=>m.to===7));
});

test('flying kings move along clear diagonals and have every landing beyond an opponent',()=>{
 const clear=draughtMoves(position([[35,2]]).board,1);
 assert.ok(clear.some(m=>m.to===7));assert.ok(clear.some(m=>m.to===8));assert.ok(clear.some(m=>m.to===62));
 assert.ok(!clear.some(m=>m.to===39));
 assert.deepEqual(plain(draughtMoves(position([[56,2],[35,-1]]).board,1)),[28,21,14,7].map(to=>({from:56,to,capture:35})));
 assert.deepEqual(plain(draughtMoves(position([[56,2],[35,-1],[14,-1]]).board,1)),[28,21].map(to=>({from:56,to,capture:35})));
 assert.deepEqual(plain(draughtMoves(position([[56,2],[35,1]]).board,1)).filter(m=>m.from===56),[49,42].map(to=>({from:56,to,capture:null})));
 let state=position([[56,2],[35,-1],[19,-2]]);
 state=moveDraught(state,56,28);assert.equal(state.forced,28);assert.equal(state.turn,1);assert.equal(state.board[35],0);
 assert.deepEqual(plain(draughtMoves(state.board,1,state.forced)),[10,1].map(to=>({from:28,to,capture:19})));
 state=moveDraught(state,28,1);assert.equal(state.winner,1);assert.equal(state.board[19],0);
});
test('wins and draws cannot be played past',()=>{
 let state=moveDraught(position([[17,1],[26,-1]]),17,35);assert.equal(state.winner,1);assert.throws(()=>moveDraught(state,35,42),/ended/);
 state=position([[1,2],[62,-2]]);state.quiet=79;state=moveDraught(state,1,8);assert.equal(state.draw,true);
 state=position([[1,2],[62,-2]]);const board=[...state.board];board[1]=0;board[8]=2;state.positions[positionKey(board,-1)]=2;
 assert.equal(moveDraught(state,1,8).draw,true);
});

test('Multiplayer rules, clocks, privacy and retries in PostgreSQL',async t=>{
 const db=new PGlite();const alice='00000000-0000-0000-0000-000000000001',bob='00000000-0000-0000-0000-000000000002',eve='00000000-0000-0000-0000-000000000003';let seq=0;
 const request=()=>`10000000-0000-0000-0000-${String(++seq).padStart(12,'0')}`;
 try{
  await db.exec(`create role authenticated;create role anon;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;
  create table profiles(id uuid primary key,full_name text,username text,avatar_url text,account_status text default 'active');
  insert into profiles(id,full_name,avatar_url) values('${alice}','Alice','https://example.com/alice.png'),('${bob}','Bob',null),('${eve}','Eve',null);
  create table zero_tournaments(id uuid primary key default gen_random_uuid(),game_type text,status text default 'live');
  insert into zero_tournaments(game_type) values('sudoku');
  create table zero_tournament_runs(id uuid primary key default gen_random_uuid(),tournament_id uuid references zero_tournaments(id));
  insert into zero_tournament_runs(tournament_id) select id from zero_tournaments;`);
  const migration=read('supabase/migrations/20261019170000_zero_draught.sql');await db.exec(migration);await db.exec(migration);
  const flyingKings=read('supabase/migrations/20261020120000_flying_draught_kings.sql');await db.exec(flyingKings);await db.exec(flyingKings);
  const as=async id=>db.query("select set_config('test.uid',$1,false)",[id||'']);
  const act=async(id,room,action,payload={},req=request())=>{await as(id);return (await db.query('select zero_draught_action($1,$2,$3,$4) result',[room,action,JSON.stringify(payload),req])).rows[0].result;};
  const snapshot=async(id,room)=>{await as(id);return (await db.query('select zero_draught_room($1) result',[room])).rows[0].result;};
  let room;
  await t.test('invite matches are private, bounded to two players and idempotent',async()=>{
   const req=request();room=(await act(alice,null,'create',{},req)).room_id;
   assert.equal((await act(alice,null,'create',{},req)).room_id,room);
   await assert.rejects(snapshot(eve,room),/Join/);
   const state=await snapshot(alice,room);
   await act(bob,null,'join',{code:state.room.code.toLowerCase()});
   await assert.rejects(act(eve,null,'join',{code:state.room.code}),/full/);
   assert.equal((await snapshot(bob,room)).players.find(p=>p.id===alice).photo,'https://example.com/alice.png');
  });
  await t.test('turn ownership, stale boards and repeated moves are enforced',async()=>{
   const state=await snapshot(alice,room);const move=state.moves[0];
   await assert.rejects(act(bob,room,'move',{...move,version:state.room.version}),/turn/);
   await assert.rejects(act(alice,room,'move',{from:0,to:63,version:state.room.version}),/Illegal/);
   await assert.rejects(act(alice,room,'move',{...move,version:0}),/board changed/);
   const req=request();await act(alice,room,'move',{...move,version:state.room.version},req);
   await act(alice,room,'move',{...move,version:state.room.version},req);
   assert.equal((await snapshot(alice,room)).room.ply,1);
  });
  await t.test('client and server agree throughout full games and capture chains',async()=>{
   let state=plain(initialDraught());
   await db.query("update zero_draught_rooms set board=$2,turn=1,forced=null,quiet=0,ply=0,positions=$3,status='active',winner=null,reason=null,red_ms=600000,black_ms=600000,moved_at=now() where id=$1",[room,state.board,JSON.stringify(state.positions)]);
   let rng=821;
   for(let i=0;i<160&&!state.winner&&!state.draw;i++){
    const snap=await snapshot(alice,room),moves=plain(draughtMoves(state.board,state.turn,state.forced));
    assert.deepEqual(snap.moves,moves);
    rng=(rng*1664525+1013904223)>>>0;const move=moves[rng%moves.length];
    await act(state.turn===1?alice:bob,room,'move',{from:move.from,to:move.to,version:snap.room.version});
    state=plain(moveDraught(state,move.from,move.to));const next=await snapshot(alice,room);
    assert.deepEqual(next.room.board,state.board);assert.equal(next.room.turn,state.turn);assert.equal(next.room.forced,state.forced);assert.equal(next.room.quiet,state.quiet);
    if(state.winner)assert.equal(next.room.winner,state.winner===1?alice:bob);
    if(state.draw)assert.equal(next.room.reason,'draw');
   }
  });
  await t.test('crowning ends the turn even when the king could capture backwards',async()=>{
   const state=position([[40,1],[49,-1],[51,-1],[7,-1]]);
   await db.query("update zero_draught_rooms set board=$2,turn=1,forced=null,status='active',winner=null,red_ms=600000,black_ms=600000,moved_at=now() where id=$1",[room,state.board]);
   const snap=await snapshot(alice,room);await act(alice,room,'move',{from:40,to:58,version:snap.room.version});
   const next=await snapshot(bob,room);assert.equal(next.room.board[58],2);assert.equal(next.room.turn,-1);assert.equal(next.room.forced,null);
  });
  await t.test('server accepts long king jumps and enforces their continuation',async()=>{
   const state=position([[56,2],[35,-1],[19,-2]]);
   await db.query("update zero_draught_rooms set board=$2,turn=1,forced=null,status='active',winner=null,red_ms=600000,black_ms=600000,moved_at=now() where id=$1",[room,state.board]);
   let snap=await snapshot(alice,room);assert.deepEqual(snap.moves,plain(draughtMoves(state.board,1)));
   await act(alice,room,'move',{from:56,to:28,version:snap.room.version});
   snap=await snapshot(alice,room);assert.equal(snap.room.forced,28);assert.equal(snap.room.board[35],0);
   await assert.rejects(act(alice,room,'move',{from:28,to:7,version:snap.room.version}),/Illegal/);
   await act(alice,room,'move',{from:28,to:1,version:snap.room.version});
   snap=await snapshot(alice,room);assert.equal(snap.room.winner,alice);assert.equal(snap.room.board[19],0);
  });
  await t.test('repetition and the 40-move rule end server games as draws',async()=>{
   for(const repetition of [false,true]) {
    const state=position([[1,2],[62,-2]]);const nextBoard=[...state.board];nextBoard[1]=0;nextBoard[8]=2;
    if(repetition)state.positions[positionKey(nextBoard,-1)]=2;
    await db.query("update zero_draught_rooms set board=$2,turn=1,forced=null,quiet=$3,positions=$4,status='active',winner=null,reason=null,red_ms=600000,black_ms=600000,moved_at=now() where id=$1",[room,state.board,repetition?0:79,JSON.stringify(state.positions)]);
    const snap=await snapshot(alice,room);await act(alice,room,'move',{from:1,to:8,version:snap.room.version});
    const result=await snapshot(bob,room);assert.equal(result.room.status,'finished');assert.equal(result.room.reason,'draw');assert.equal(result.room.winner,null);
   }
   await db.query("update zero_draught_rooms set status='active',moved_at=now() where id=$1",[room]);
  });
  await t.test('draws need opponent consent and timeout/resignation persist',async()=>{
   await act(alice,room,'offer_draw');await assert.rejects(act(alice,room,'accept_draw'),/opponent/);await act(bob,room,'decline_draw');
   await act(bob,room,'offer_draw');await act(alice,room,'accept_draw');assert.equal((await snapshot(alice,room)).room.reason,'agreed_draw');
   const id=(await act(alice,null,'create')).room_id;const code=(await snapshot(alice,id)).room.code;await act(bob,null,'join',{code});
   await db.query("update zero_draught_rooms set moved_at=now()-interval '11 minutes' where id=$1",[id]);
   assert.equal((await snapshot(bob,id)).room.winner,bob);assert.equal((await snapshot(bob,id)).room.reason,'timeout');
   const second=(await act(alice,null,'create')).room_id;await act(bob,null,'join',{code:(await snapshot(alice,second)).room.code});
   await act(bob,second,'resign');assert.equal((await snapshot(alice,second)).room.winner,alice);
  });
  await t.test('direct writes, anonymous calls and retired-game creation are blocked',async()=>{
   await as(eve);await db.exec('set role authenticated');assert.equal((await db.query('select * from zero_draught_rooms')).rows.length,0);
   await assert.rejects(db.exec("update zero_draught_rooms set winner=red_id"),/permission denied/);
   await assert.rejects(db.query('select zero_draught_settle($1)',[room]),/permission denied/);
   await db.exec('reset role;set role anon');await assert.rejects(db.exec('select zero_draught_home()'),/permission denied/);await db.exec('reset role');
   await assert.rejects(db.exec("insert into zero_tournaments(game_type) values('sudoku')"),/retired/);
   await assert.rejects(db.exec('insert into zero_tournament_runs(tournament_id) select id from zero_tournaments'),/retired/);
   assert.equal((await db.query('select count(*)::int count from zero_tournament_runs')).rows[0].count,1);
   await db.exec("update zero_tournaments set status='completed' where game_type='sudoku'");
   assert.equal((await db.query('select count(*)::int count from zero_tournaments')).rows[0].count,1);
  });
 }finally{await db.close();}
});
