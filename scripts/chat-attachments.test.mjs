import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('Windows picker metadata and reselection preserve uploadable file bytes',async()=>{
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(new URL('../src/lib/chatAttachments.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{exports,File});
  const photo=new File(['image bytes'],'PHOTO.PNG'),video=new File(['video bytes'],'clip.MP4',{type:'application/octet-stream'});
  const input={files:[photo,video],value:'C:\\fakepath\\PHOTO.PNG'};
  const selected=exports.readChatAttachments(input);
  assert.equal(input.value,'');assert.equal(selected[0].type,'image/png');assert.equal(selected[1].type,'video/mp4');
  assert.equal(await selected[0].text(),'image bytes');assert.equal(await selected[1].text(),'video bytes');
  assert.equal(exports.readChatAttachments(input).length,2);
});

// Exercise the real draft hook with a small deterministic hook lifecycle.
function harness() {
  const slots=[], effects=[], revoked=[];let cursor=0, next=0;
  const react={
    useRef(value){const i=cursor++;return slots[i]??=( {current:value});},
    useState(value){const i=cursor++;slots[i]??=value;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useCallback(fn){cursor++;return fn;},
    useEffect(fn,deps){const i=cursor++;const previous=slots[i];if(!deps || !previous || deps.some((d,j)=>d!==previous.deps[j])) effects.push(()=>{previous?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
  };
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(new URL('../src/hooks/useDraftMedia.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{exports,require:()=>react,File,URL:{createObjectURL:file=>`blob:${++next}:${file.name}`,revokeObjectURL:url=>revoked.push(url)}});
  return {
    render(key){cursor=0;const result=exports.useDraftMedia(key);effects.splice(0).forEach(fn=>fn());return result;},
    unmount(){slots.forEach(s=>s?.cleanup?.());},revoked,
  };
}

test('desktop image/video selection is immediately paired, removable and selectable again',()=>{
  const h=harness();let draft=h.render('dm:1');
  const image=new File(['image'],'photo.png',{type:'image/png'}),video=new File(['video'],'movie.mp4',{type:'video/mp4'});
  draft.addFiles([image,video]);draft=h.render('dm:1');
  assert.equal(draft.files[0],image);assert.equal(draft.files[1],video);
  assert.equal(draft.previews[0],'blob:1:photo.png');assert.equal(draft.previews[1],'blob:2:movie.mp4');
  draft.removeFile(0);draft=h.render('dm:1');
  assert.equal(draft.files[0],video);assert.equal(draft.previews[0],'blob:2:movie.mp4');
  assert.deepEqual(h.revoked,['blob:1:photo.png']);
  draft.addFiles([image]);draft=h.render('dm:1');
  assert.equal(draft.previews[1],'blob:3:photo.png');
  draft.clear();draft=h.render('dm:1');assert.equal(draft.files.length,0);assert.equal(draft.previews.length,0);
  assert.equal(h.revoked.length,3);h.unmount();
});

test('profile arriving during selection keeps the draft while switching chats clears it',()=>{
  const h=harness();let draft=h.render(null);
  const image=new File(['x'],'photo.jpg',{type:'image/jpeg'});
  draft.addFiles([image]);draft=h.render('dm:ready');
  assert.equal(draft.files[0],image);assert.equal(draft.previews[0],'blob:1:photo.jpg');
  const old=draft;draft=h.render('dm:other');old.addFiles([image]);draft=h.render('dm:other');
  assert.equal(draft.files.length,0);assert.equal(draft.previews.length,0);assert.equal(h.revoked.length,1);
  h.unmount();
});
