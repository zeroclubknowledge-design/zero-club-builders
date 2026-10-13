import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ImageResponse } from '@vercel/og';

const read = path => fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const stub = new Proxy({}, { get: () => () => null });
function load(path, modules = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => modules[name] || stub, URL, URLSearchParams, console, ...globals });
  return exports;
}
const text = load('src/lib/og/core/text.ts');
const preview = load('src/lib/og/core/post.ts', { './text':text });
const share = load('src/lib/share.ts');
const id = '00000000-0000-0000-0000-000000000001';
const photo = 'https://example.com/videos/screenshots/photo.jpg?version=7';
const post = { id, content:'Look at my project', media_urls:['https://example.com/clip.mp4',photo], profiles:{username:'alice',full_name:'Alice'}, is_build_post:true };
const meta = (head,key) => head.meta.find(tag => tag.property===key || tag.name===key)?.content;

test('robots allows public shared post pages and preview images while keeping private pages blocked',()=>{
  const rules=read('public/robots.txt').split(/\r?\n/).map(line=>line.match(/^(Allow|Disallow):\s*(\S+)/)).filter(Boolean);
  const allowed=path=>rules.filter(([, , prefix])=>path.startsWith(prefix)).sort((a,b)=>b[2].length-a[2].length)[0]?.[1]==='Allow';
  assert.equal(allowed('/app/post/'+id),true);
  assert.equal(allowed('/api/og/post/'+id),true);
  assert.equal(allowed('/app/chat'),false);
});

test('attached photo endpoint returns a PNG without loading brand fonts or drawing a branded card',async()=>{
  const bytes=new Uint8Array([137,80,78,71]);
  const response=load('src/lib/og/core/respond.ts',{
    './specs':{buildPreviewSpec:async()=>({variant:'photo',image:photo})},
    './card':{drawPostPhoto:async source=>{assert.equal(source,photo);return bytes.buffer;},fonts:()=>{throw new Error('Brand fonts must not load');},drawCard:()=>{throw new Error('Brand card must not draw');}},
  },{Response}).previewResponse;
  const result=await response('post',id,new URL('https://www.zeroclubs.xyz'));
  assert.equal(result.status,200);
  assert.equal(result.headers.get('content-type'),'image/png');
  assert.equal(result.headers.get('content-length'),'4');
  assert.match(result.headers.get('cache-control'),/s-maxage=3600/);
});

test('actual photo renderer outputs a 1200x630 PNG under the social file limit',async()=>{
  const card=load('src/lib/og/core/card.ts',{'@vercel/og':{ImageResponse}},
    {AbortController,setTimeout,clearTimeout,Uint8Array,btoa,fetch});
  const tinyPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const png=Buffer.from(await card.drawPostPhoto(tinyPng));
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
  assert.ok(png.length<5_000_000);
});

test('LinkedIn opens its link sharer before asynchronous clipboard access',async()=>{
  const opened=[];let copied;
  const linkedin=load('src/lib/linkedinShare.ts',{}, {navigator:{userAgent:'Desktop',clipboard:{writeText:async text=>{assert.equal(opened.length,1);copied=text;}}},window:{open:url=>opened.push(url)}});
  const url=linkedin.linkedInUrl(share.postLinkUrl(id,'alice'));
  assert.equal(await linkedin.openLinkedInComposer('Read more '+url,url),true);
  const target=new URL(opened[0]);assert.equal(target.pathname,'/sharing/share-offsite/');
  assert.equal(target.searchParams.get('url'),url);assert.equal(copied,'Read more '+url);
});

test('mobile LinkedIn sharing supplies an explicit URL and preserves the excerpt',async()=>{
  let payload;
  const linkedin=load('src/lib/linkedinShare.ts',{}, {navigator:{userAgent:'Android',share:async value=>{payload=value;}},window:{open:()=>{throw new Error('Native share should handle this');}}});
  const url=share.postLinkUrl(id);
  await linkedin.openLinkedInComposer('My project\nContinue reading here 👉 '+url,url);
  assert.equal(payload.url,url);assert.match(payload.text,/My project/);assert.ok(!payload.text.includes(url));
});

test('attached images use a crawler-safe public PNG endpoint for Open Graph and Twitter',()=>{
  const head=preview.postPreviewHead(post);
  assert.equal(meta(head,'og:image'),`https://www.zeroclubs.xyz/api/og/post/${id}?v=5`);
  assert.equal(meta(head,'twitter:image'),meta(head,'og:image'));
  assert.equal(meta(head,'og:image:type'),'image/png');
  assert.equal(meta(head,'og:image:width'),'1200');
  assert.equal(meta(head,'og:title'),"Alice's Project on Zero Club");
  assert.equal(meta(head,'og:description'),'Look at my project');
});
test('attachments preserve order, skip videos/files/broken URLs and handle relative paths',()=>{
  assert.equal(preview.postPreviewImage({media_urls:[null,'','broken','javascript:alert(1)','https://example.com/file.pdf','https://example.com/clip.mp4?download=1',photo,'https://example.com/second.png']}),photo);
  assert.equal(preview.postPreviewImage({media_urls:['/photos/photo.webp']}),'https://www.zeroclubs.xyz/photos/photo.webp');
  assert.equal(preview.postPreviewImage({media_urls:'bad data'}),null);
  assert.match(meta(preview.postPreviewHead({...post,media_urls:[]}), 'og:image'),/api\/og\/post\//);
});
test('shared post links refresh old previews while preserving referral attribution',()=>{
  const url=new URL(share.postLinkUrl(id,'ref & code'));
  assert.equal(url.pathname,'/app/post/'+id);
  assert.equal(url.searchParams.get('preview'),'5');
  assert.equal(url.searchParams.get('ref'),'ref & code');
});
test('signed-out SSR loads public post data before producing its photo metadata',async()=>{
  const calls=[];
  const supabase={rpc:async(name,args)=>{calls.push([name,args]);return {data:{found:true,post,author:post.profiles}};},from:()=>{throw new Error('Protected table reads must not run for preview crawlers');}};
  const route=load('src/routes/app.post.$id.tsx', {
    '@tanstack/react-router':{createFileRoute:()=>config=>config},
    '@/lib/supabase':{supabase},'@/lib/og/core/post':preview,'@/lib/share':share,
  }).Route;
  const data=await route.loader({params:{id},context:{queryClient:{getQueryData:()=>[],getQueriesData:()=>[]}}});
  assert.equal(calls[0][0],'get_post_public');
  assert.equal(meta(route.head({loaderData:data}),'og:image'),meta(preview.postPreviewHead(post),'og:image'));
});
test('root and post metadata agree on the normalized PNG dimensions',()=>{
  const root=load('src/routes/__root.tsx',{
    '@tanstack/react-router':{createRootRouteWithContext:()=>config=>config},
    '@/lib/og/core/post':preview,
  }).Route;
  const tags=root.head({matches:[{routeId:'/app/post/$id',loaderData:{post}}]}).meta;
  assert.equal(tags.some(tag=>tag.property==='og:image:type' && tag.content==='image/png'),true);
  assert.equal(root.head({matches:[]}).meta.some(tag=>tag.property==='og:image:type' && tag.content==='image/png'),true);
});
test('legacy post image endpoint uses the public reader instead of an anonymous table lookup',async()=>{
  const specs=load('src/lib/og/core/specs.ts',{
    './text':text,'./post':preview,
    './db':{one:()=>{throw new Error('Anonymous table read');},rpc:async()=>({found:true,post,author:post.profiles})},
  });
  const spec=await specs.buildPreviewSpec('post',id,new URL('https://www.zeroclubs.xyz'));
  assert.equal(spec.image,photo);assert.equal(spec.variant,'photo');assert.equal(spec.title,post.content);
});
