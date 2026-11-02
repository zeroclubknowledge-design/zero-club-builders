import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/features/notes/noteHtml.ts', import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api});
test('media split paragraph fragments and blank paragraphs never render as text',()=>{
 for(const fragment of ['</p>','&lt;/p&gt;','&#60;/p&#62;','<p><br></p>','<p> &nbsp; <br /> </p>','<p>&lt;/p&gt;</p>']) {
  assert.equal(api.normalizeNoteHtml(fragment),'');
 }
 assert.equal(api.normalizeNoteHtml('After the video</p>'),'After the video');
});
test('paragraphs, formatting and links survive cleanup',()=>{
 const body='<p>First <strong>paragraph</strong></p><p><a href="https://example.com">Second</a></p>';
 assert.equal(api.normalizeNoteHtml(body),body);
 assert.equal(api.normalizeNoteHtml(body+'</p>'),body);
 assert.equal(api.normalizeNoteHtml('A plain note\n\nWith spacing'),'A plain note\n\nWith spacing');
});
