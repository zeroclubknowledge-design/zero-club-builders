import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/features/calls/rtcRecovery.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText, {exports:api,setTimeout,clearTimeout,AbortController});
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
function setup(options={}) {
  const handlers=new Map(), states=[], joins=[], renewals=[], loads=[], leaves=[];
  let leaving=false;
  const client={
    connectionState:options.state||'DISCONNECTED', uid:47, channelName:'test-room',
    on:(name,fn)=>handlers.set(name,fn), off:(name)=>handlers.delete(name),
    join:async(...args)=>{joins.push(args);if(options.join)return options.join(...args);client.connectionState='CONNECTED';handlers.get('connection-state-change')?.('CONNECTED','CONNECTING');return 47;},
    renewToken:async token=>{renewals.push(token);}, leave:async()=>{leaves.push(true);},
  };
  const recovery=api.createRtcRecovery({
    client,appId:'test-app',channel:'test-room',uid:options.uid,
    delays:options.delays||[1,1,1], onChange:s=>states.push(s),isLeaving:()=>leaving,
    restoreMedia:options.restoreMedia,
    loadToken:async(uid,signal)=>{loads.push({uid,signal});return options.loadToken?options.loadToken(uid,signal):'fresh-token';},
  });
  return {client,recovery,states,joins,renewals,loads,leaves,handlers,setLeaving:()=>{leaving=true;}};
}
test('initial join failure obtains a fresh token and retries without a state change',async()=>{
  let n=0; const h=setup({loadToken:async()=>{if(++n<3)throw Error('offline');return 'fresh-token';}});
  try {h.recovery.failed(new Error('CAN_NOT_GET_GATEWAY_SERVER: unknown error'));await pause(45);
    assert.equal(h.loads.length,3);assert.equal(h.joins.length,1);assert.equal(h.states.at(-1).message,null);
    assert.equal(h.joins[0][2],'fresh-token');
  } finally {h.recovery.dispose();}
});
test('automatic failures stop after the configured number of attempts',async()=>{
  const h=setup({loadToken:async()=>{throw Error('offline');}});
  try {h.recovery.failed(Error('network'));await pause(45);assert.equal(h.loads.length,3);assert.equal(h.states.at(-1).retrying,false);await pause(15);assert.equal(h.loads.length,3);
    await h.recovery.retry();assert.equal(h.loads.length,4);
  } finally {h.recovery.dispose();}
});
test('simultaneous expiry events share one token request and renew a connected client',async()=>{
  let complete;const h=setup({state:'CONNECTED',loadToken:()=>new Promise(resolve=>{complete=resolve;})});
  try {h.handlers.get('token-privilege-will-expire')();h.handlers.get('token-privilege-did-expire')();
    assert.equal(h.loads.length,1);complete('renewed');await pause(5);assert.deepEqual(h.renewals,['renewed']);assert.equal(h.joins.length,0);
  } finally {h.recovery.dispose();}
});
test('an ended RTC connection rejoins with its previous UID and restores media',async()=>{
  let restored=0;const h=setup({state:'CONNECTED',restoreMedia:async()=>{restored++;}});
  try {h.client.connectionState='DISCONNECTED';h.handlers.get('connection-state-change')('DISCONNECTED','CONNECTED','NETWORK_ERROR');await pause(20);
    assert.equal(h.loads[0].uid,47);assert.equal(h.joins[0][3],47);assert.equal(restored,1);
  } finally {h.recovery.dispose();}
});
test('server bans and invalid credentials do not cause automatic retry loops',async()=>{
  for(const error of ['UID_BANNED','LICENSE_EXPIRED','invalid token, authorized failed','invalid vendor key']){
    const h=setup();try {h.recovery.failed(Error(error));await pause(8);assert.equal(h.loads.length,0,error);assert.equal(h.states.at(-1).retrying,false);}finally{h.recovery.dispose();}
  }
});
test('intentional leave suppresses scheduled recovery and in-flight token completion',async()=>{
  const h=setup();h.recovery.failed(Error('offline'));h.setLeaving();await pause(10);assert.equal(h.loads.length,0);h.recovery.dispose();
  let complete;const p=setup({loadToken:()=>new Promise(resolve=>{complete=resolve;})});
  const run=p.recovery.retry();p.setLeaving();complete('token');await run;assert.equal(p.joins.length,0);p.recovery.dispose();
});
test('disposing aborts token acquisition and removes all event listeners',async()=>{
  let complete;const h=setup({loadToken:()=>new Promise(resolve=>{complete=resolve;})});
  const run=h.recovery.retry();h.recovery.dispose();assert.equal(h.loads[0].signal.aborted,true);assert.equal(h.handlers.size,0);complete('late');await run;assert.equal(h.joins.length,0);
});
test('an SDK rejoin completing after Leave is left again and never restores media',async()=>{
  let complete,restored=0;const h=setup({restoreMedia:async()=>{restored++;},join:()=>new Promise(resolve=>{complete=resolve;})});
  const run=h.recovery.retry();await pause(1);h.setLeaving();complete(47);await run;
  assert.equal(h.leaves.length,1);assert.equal(restored,0);h.recovery.dispose();
});
test('the SDK retains ownership while CONNECTING or automatically RECONNECTING',async()=>{
  const h=setup({state:'CONNECTING'});await h.recovery.retry();assert.equal(h.loads.length,0);h.recovery.dispose();
  const r=setup({state:'RECONNECTING'});r.recovery.resume();await pause(10);assert.equal(r.loads.length,0);r.recovery.dispose();
});
test('gateway errors are readable without leaking raw SDK errors or credentials',()=>{
  const message=api.callConnectionMessage(Error('CAN_NOT_GET_GATEWAY_SERVER: flag: 4096, unknown error secret-token'));
  assert.match(message,/video service/);assert.ok(!message.includes('secret-token'));assert.ok(!message.includes('4096'));
});
