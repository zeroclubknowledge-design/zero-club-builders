import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const path=new URL('../src/lib/giftClaimExpiry.ts',import.meta.url);const source=fs.readFileSync(path,'utf8');
const api={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,Date});
test('claim deadline uses the receipt expiry rather than the campaign expiry',()=>{
 const now=Date.parse('2026-10-27T00:00:00Z'),deadline='2026-10-27T06:00:00Z';
 assert.equal(api.giftClaimDeadline({parent_gift_id:'campaign',expires_at:deadline,claim_deadline_at:deadline}),deadline);
 assert.equal(api.giftClaimDeadline({my_claim_id:'receipt',expires_at:'2026-10-30T00:00:00Z',my_claim_expires_at:deadline}),deadline);
 assert.equal(api.giftTimeLeft(deadline,now),'6h');
 assert.equal(api.giftTimeLeft('2026-10-27T00:30:00Z',now),'30m');
 assert.equal(api.giftClaimExpired({parent_gift_id:'campaign',expires_at:deadline},now),false);
 assert.equal(api.giftClaimExpired({parent_gift_id:'campaign',expires_at:deadline},now+6*3600000),true);
 assert.equal(api.giftClaimExpired({my_claim_released:true},now),true);
 assert.equal(api.giftClaimDeadline({expires_at:deadline}),null,'an unclaimed campaign has no individual deadline');
 assert.equal(api.giftClaimDeadline({parent_gift_id:'legacy-wallet-gift'}),null);
 assert.equal(api.giftTimeLeft('invalid',now),'Expired');
});
test('deadline helpers are identical in the main app, Zero Gifts and Zero Form',()=>{
 for(const app of ['Zero Gifts','Zero Form'])assert.equal(fs.readFileSync(new URL(`../${app}/src/lib/giftClaimExpiry.ts`,import.meta.url),'utf8'),source);
});
