import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
const exports={};
const source=fs.readFileSync(new URL('src/features/membership/giftEdit.ts',root),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});

test('gift saves require the confirmed card, value, capacity, date and active status',()=>{
  const payload={p_gift:'gift-1',p_amount:1000,p_quantity:3,p_expires_at:'2026-10-29T12:00:00Z'};
  const saved={id:'gift-1',amount:1000,quantity:3,claimed_count:1,expires_at:'2026-10-29T13:00:00+01:00',status:'active'};
  assert.equal(exports.verifyGiftEdit(saved,payload),saved);
  for(const invalid of [null,{}, {...saved,id:'another'}, {...saved,expires_at:'invalid'}, {...saved,expires_at:'2026-10-20T12:00:00Z'}, {...saved,status:'claimed'}, {...saved,amount:500}])
    assert.throws(()=>exports.verifyGiftEdit(invalid,payload));
  assert.doesNotThrow(()=>exports.verifyGiftEdit({...saved,claimed_count:3,status:'claimed'},payload));
});

test('timeouts and server failures provide actionable feedback without losing the draft',()=>{
  assert.match(exports.giftEditError({name:'TimeoutError'}),/try again.*changes are still here/);
  assert.match(exports.giftEditError({code:'PGRST202'}),/changes have been kept/);
  assert.equal(exports.giftEditError({message:'Not enough wallet funds'}),'Not enough wallet funds');
  assert.match(exports.giftEditError(null),/could not be updated/);
});

test('standalone and main gift editor use the same verified save flow',()=>{
  assert.equal(fs.readFileSync(new URL('Zero Gifts/src/features/membership/giftEdit.ts',root),'utf8'),source);
  assert.equal(fs.readFileSync(new URL('Zero Gifts/src/features/membership/GiftEditSheet.tsx',root),'utf8'),fs.readFileSync(new URL('src/features/membership/GiftEditSheet.tsx',root),'utf8'));
});
