import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

process.env.TZ='Africa/Lagos';
const api={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/features/bootcamps/schedule.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,Date,Error});
test('bootcamp inputs show the local calendar date and time across UTC midnight',()=>{
  assert.equal(api.localBootcampStart('2026-10-27T23:30:42.123Z'),'2026-10-28T00:30');
  assert.equal(api.localBootcampDate('2026-10-27T23:30:42.123Z'),'2026-10-28');
});
test('changing the start date saves the chosen local time and validates end ordering',()=>{
  const dates=api.bootcampSchedulePayload('2026-11-01T09:30','2026-11-01');
  assert.equal(dates.starts_at,'2026-11-01T08:30:00.000Z');
  assert.equal(dates.ends_at,'2026-11-01T22:59:59.999Z');
  assert.throws(()=>api.bootcampSchedulePayload('2026-11-02T09:30','2026-11-01'),/cannot be before/);
});
test('unrelated edits preserve the original start instant and undecided dates remain optional',()=>{
  const original='2026-10-27T23:30:42.123Z';
  assert.equal(api.bootcampSchedulePayload(api.localBootcampStart(original),'',original).starts_at,original);
  assert.equal(api.bootcampSchedulePayload('','').starts_at,null);
  assert.equal(api.bootcampSchedulePayload('','').ends_at,null);
  assert.throws(()=>api.bootcampSchedulePayload('not a date',''),/valid bootcamp start/);
  assert.throws(()=>api.bootcampSchedulePayload('','not a date'),/valid bootcamp end/);
});
