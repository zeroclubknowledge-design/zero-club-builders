import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import createCore from '@ffmpeg/core';

function load(file, imports={},extra={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>{if(name in imports)return imports[name];throw new Error(name);},Blob,Uint8Array,AbortController,Error,setTimeout,clearTimeout,...extra});
  return exports;
}
const video=load('src/lib/videoExport.ts',{'@ffmpeg/ffmpeg':{},'@ffmpeg/core?url':{},'virtual:zero-video-codec':{}});
const media=load('src/lib/downloadMedia.ts',{sonner:{toast:{}}});

test('file bytes override a misleading MP4 filename and MIME type',async()=>{
  const disguised=new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,0,0,0,0])],{type:'video/mp4'});
  assert.equal(await media.mediaContainer(disguised),'video/webm');
  assert.equal(media.buildDownloadFilename('https://example.test/a.mp4',true,'My Clip.mp4','video/webm'),'My-Clip.webm');
  assert.equal(media.buildDownloadFilename('https://example.test/a.webm',true,'My Clip.webm','video/mp4'),'My-Clip.mp4');
  assert.equal(media.buildDownloadFilename('/broken%name.mov',true,undefined,'video/mp4'),'brokenname.mp4');
  assert.equal(media.buildDownloadFilename('/file',false,'notes.pdf','application/pdf'),'notes.pdf');
  assert.equal(media.isVideoResource('/image.png?video=false'),false);
});

test('codec policy preserves compatible H264 but converts HEVC, VP9, high bit depth and non-AAC audio',()=>{
  const compatible={codec_type:'video',codec_name:'h264',pix_fmt:'yuv420p',profile:'High',width:1280,height:720};
  const args=streams=>Array.from(video.socialVideoArgs({streams}));
  assert.ok(args([compatible,{codec_type:'audio',codec_name:'aac'}]).includes('copy'));
  for(const stream of [{...compatible,codec_name:'hevc'},{...compatible,codec_name:'vp9'},{...compatible,pix_fmt:'yuv420p10le'},{...compatible,width:3840}]) {
    const result=args([stream,{codec_type:'audio',codec_name:'opus'}]);
    assert.ok(result.includes('libx264'));assert.ok(result.includes('aac'));assert.ok(result.includes('yuv420p'));assert.ok(result.includes('+faststart'));
  }
  assert.throws(()=>args([{codec_type:'audio',codec_name:'opus'}]),/video track/);
});

test('failed conversion never starts a fake MP4 download and original export has the real extension',async()=>{
  const saved=[],errors=[];
  const original=new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,0,0,0,0])],{type:'video/mp4'});
  const api=load('src/lib/downloadMedia.ts',{
    sonner:{toast:{loading:()=>1,error:(message,options)=>errors.push({message,options}),dismiss(){},success(){throw Error('False success');}}},
    './videoExport':{exportSocialVideo:async()=>{throw Error('Encoder failed');}},
  },{
    fetch:async()=>({ok:true,headers:new Headers({'content-type':'video/mp4'}),blob:async()=>original}),
    File,URL:{createObjectURL:blob=>{saved.push({blob});return 'blob:original';},revokeObjectURL(){}},
    document:{createElement:()=>({style:{},click(){saved.at(-1).filename=this.download;},remove(){}}),body:{appendChild(){}}},
    setTimeout:()=>0,
  });
  await api.downloadMedia('/old-recording.mp4',{isVideo:true});
  assert.equal(saved.length,0);assert.equal(errors[0].message,'Encoder failed');
  errors[0].options.action.onClick();
  assert.equal(saved[0].filename,'old-recording.webm');
  assert.equal(saved[0].blob.type,'video/webm');
});

test('cancelled export shows neither an error nor a download',async()=>{
  const messages=[];let cancel;
  const api=load('src/lib/downloadMedia.ts',{
    sonner:{toast:{loading:(_,options)=>{cancel=options.action.onClick;return 1;},error:()=>messages.push('error'),dismiss:()=>messages.push('dismiss'),success:()=>messages.push('success')}},
    './videoExport':{exportSocialVideo:async(_blob,_progress,signal)=>{cancel();signal.throwIfAborted();}},
  },{fetch:async()=>({ok:true,headers:new Headers({'content-type':'video/webm'}),blob:async()=>new Blob(['source'],{type:'video/webm'})}),File});
  await api.downloadMedia('/clip.webm',{isVideo:true});
  assert.deepEqual(messages,['dismiss']);
});

test('actual encoder preserves a video longer than 15 seconds, sound and MP4 compatibility',async()=>{
  // The production WASM core, running against its virtual filesystem in Node.
  globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
  const core=await createCore({wasmBinary:fs.readFileSync(new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',import.meta.url))});
  const run=(...args)=>{core.reset();core.exec(...args);assert.equal(core.ret,0);};
  run('-f','lavfi','-i','color=c=blue:s=160x90:r=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','20','-c:v','libvpx','-c:a','libopus','-f','webm','input');
  const probe=path=>{core.reset();core.ffprobe('-v','error','-show_streams','-show_format','-of','json',path,'-o','metadata.json');return JSON.parse(core.FS.readFile('metadata.json',{encoding:'utf8'}));};
  const original=probe('input');
  run(...video.socialVideoArgs(original));
  const output=probe('output.mp4');
  assert.equal(output.streams.find(s=>s.codec_type==='video').codec_name,'h264');
  assert.equal(output.streams.find(s=>s.codec_type==='video').pix_fmt,'yuv420p');
  assert.equal(output.streams.find(s=>s.codec_type==='audio').codec_name,'aac');
  assert.ok(Number(output.format.duration)>=19.9);
  const bytes=Buffer.from(core.FS.readFile('output.mp4'));
  assert.equal(bytes.toString('ascii',4,8),'ftyp');
  assert.ok(bytes.indexOf('moov')<bytes.indexOf('mdat'),'metadata comes before video data for sharing/streaming');
  // Decoding the full output verifies that this is playable media, not just a renamed file.
  run('-i','output.mp4','-f','null','-');
});
