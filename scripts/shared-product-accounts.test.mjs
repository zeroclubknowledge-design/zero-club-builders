import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const a='10000000-0000-0000-0000-000000000001',b='20000000-0000-0000-0000-000000000002';
const source=read('public/sso-bridge.html').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm,'');
async function bridge({action='accounts',account=b,origin='https://gifts.zeroclubs.xyz',saved=true,expired=false}={}) {
  const messages=[],clients=[],fetches=[],storage=new Map();
  const session={user:{id:a},access_token:'main-access',refresh_token:'main-refresh'};
  if(saved)storage.set('zero_club_multi_accounts',JSON.stringify([{id:b,username:'second',session:{access_token:'saved-access',refresh_token:'saved-refresh'}}]));
  const parent={postMessage:(data,target)=>messages.push({data,target})};
  const context={URLSearchParams,Map,JSON,location:{search:'?'+new URLSearchParams({origin,action,account_id:account,request_id:'request-123'})},window:{parent},navigator:{locks:{request:async(_key,fn)=>fn()}},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    createClient:(_url,_key,opts)=>{
      clients.push(opts||{});
      return {auth:{getSession:async()=>({data:{session}}),setSession:async tokens=>{
        assert.equal(tokens.refresh_token,'saved-refresh');
        return expired?{error:Error('revoked'),data:{session:null}}:{data:{session:{user:{id:b},access_token:'new-access',refresh_token:'new-refresh'}}};
      }},from:()=>({select:()=>({in:async()=>({data:[{id:a,username:'first',avatar_url:'a.jpg'},{id:b,username:'second',avatar_url:'b.jpg'}]})})})};
    },
    fetch:async(_url,request)=>{fetches.push(request);return {ok:true,json:async()=>({token_hash:'one-time-handoff',user_id:action==='switch'?account:a})};},
  };
  vm.runInNewContext(source,context);await new Promise(setImmediate);
  return {messages,clients,fetches,storage};
}
test('bridge lists explicit account metadata without any saved credentials',async()=>{
  const h=await bridge();assert.equal(h.messages[0].data.type,'zc-accounts');assert.equal(h.messages[0].data.request_id,'request-123');
  assert.equal(h.messages[0].data.accounts.length,2);assert.equal(h.fetches.length,0);
  const text=JSON.stringify(h.messages);for(const secret of ['main-access','saved-access','main-refresh','saved-refresh','session'])assert.ok(!text.includes(secret));
});
test('switch validates a saved login in isolation and hands off a one-time code',async()=>{
  const h=await bridge({action:'switch'});assert.equal(h.clients[1].auth.persistSession,false);assert.equal(h.clients[1].auth.autoRefreshToken,false);
  assert.equal(h.fetches[0].headers.Authorization,'Bearer new-access');assert.equal(h.messages[0].data.type,'zc-account-switch');
  assert.equal(h.messages[0].data.token_hash,'one-time-handoff');assert.ok(!JSON.stringify(h.messages).includes('new-refresh'));
  assert.equal(JSON.parse(h.storage.get('zero_club_multi_accounts'))[0].session.refresh_token,'new-refresh');
});
test('unknown accounts and expired saved logins cannot mint handoffs',async()=>{
  for(const args of [{saved:false},{expired:true}]){
    const h=await bridge({action:'switch',...args});assert.equal(h.fetches.length,0);assert.notEqual(h.messages[0].data.status,'ok');
  }
});
test('bridge rejects untrusted requesting origins before reading a session',async()=>{
  const h=await bridge({origin:'https://evil.example'});assert.equal(h.clients.length,0);assert.equal(h.messages.length,0);
});
test('existing single-account SSO protocol still works for ZeroStart',async()=>{
  const h=await bridge({action:'signin',origin:'https://start.zeroclubs.xyz'});
  assert.equal(h.messages[0].data.type,'zc-sso');assert.equal(h.messages[0].data.status,'ok');assert.equal(h.fetches[0].headers.Authorization,'Bearer main-access');
});

function app() {
  const exports={},listeners=new Set(),frames=[],exchanges=[];
  const code=ts.transpileModule(read('Zero Gifts/src/lib/sharedAccounts.ts').replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,URL,URLSearchParams,crypto:{randomUUID:()=> 'nonce-123'},setTimeout,clearTimeout,
    config:{zeroClubUrl:'https://www.zeroclubs.xyz'},turnSharedSignInOn:()=>{},
    window:{location:{origin:'https://gifts.zeroclubs.xyz'},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)},
    document:{createElement:()=>({style:{},setAttribute(){},contentWindow:{},remove(){this.removed=true;}}),body:{appendChild:frame=>frames.push(frame)}},
    supabase:{auth:{verifyOtp:async args=>{exchanges.push(args);return {data:{user:{id:b},session:{user:{id:b}}}};},signOut:async()=>{}}},
  });
  const message=(data,extra={})=>{for(const fn of [...listeners])fn({origin:'https://www.zeroclubs.xyz',source:frames[0].contentWindow,data:{request_id:'nonce-123',status:'ok',...data},...extra});};
  return {exports,frames,listeners,exchanges,message};
}
test('product ignores wrong origin, wrong frame, nonce and protocol; cleans up after valid response',async()=>{
  const h=app(),result=h.exports.getSharedAccounts();
  const payload={type:'zc-accounts',accounts:[{id:b,username:'second'}]};
  h.message(payload,{origin:'https://evil.example'});h.message(payload,{source:{}});h.message({...payload,request_id:'wrong'});h.message({...payload,type:'zc-sso'});
  assert.equal(h.listeners.size,1);h.message(payload);assert.equal((await result)[0].id,b);assert.equal(h.listeners.size,0);assert.equal(h.frames[0].removed,true);
});
test('account switch only exchanges a token for the selected account, once',async()=>{
  const h=app(),result=h.exports.switchSharedAccount(b);
  h.message({type:'zc-account-switch',user_id:b,token_hash:'single-use'});h.message({type:'zc-account-switch',user_id:b,token_hash:'single-use'});
  await result;assert.equal(h.exchanges.length,1);assert.equal(h.exchanges[0].type,'magiclink');
  const bad=app(),rejected=bad.exports.switchSharedAccount(b);bad.message({type:'zc-account-switch',user_id:a,token_hash:'wrong-account'});
  await assert.rejects(rejected,/selected account/);assert.equal(bad.exchanges.length,0);
});
test('both standalone apps keep account-switch behavior identical',()=>{
  for(const file of ['lib/sharedAccounts.ts','lib/auth.tsx','components/AccountMenu.tsx'])assert.equal(read('Zero Form/src/'+file),read('Zero Gifts/src/'+file));
});
test('all checkout copies offer owned gift credit without manual gift-code entry',()=>{
  const base=read('src/components/ZeroGiftPaymentOption.tsx');
  assert.match(base,/Apply available Zero Cards/);assert.match(base,/get_my_zero_gift_balance_v2/);assert.match(base,/p_bootcamp_id: bootcampId/);assert.match(base,/amount - usable/);
  assert.ok(!base.includes('GiftCodeRedeemer'));assert.ok(!base.includes('claim_gift_card'));
  assert.ok(!base.includes('GiftClaimLink'));assert.ok(!base.includes('target="_blank"'));assert.ok(!base.includes('gifts.zeroclubs.xyz'));
  for(const app of ['Zero Form','Zero Gifts'])assert.equal(read(app+'/src/components/ZeroGiftPaymentOption.tsx'),base);
});
test('main app gifts navigation stays inside Zero Club',()=>{
  const link=read('src/components/GiftClaimLink.tsx');assert.match(link,/<Link to="\/app\/gifts"/);assert.ok(!link.includes('target="_blank"'));assert.ok(!link.includes('https://gifts.zeroclubs.xyz'));
});
