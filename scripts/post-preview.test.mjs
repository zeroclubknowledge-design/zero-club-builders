import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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

test('the first attached image is used directly for Open Graph and Twitter',()=>{
  const head=preview.postPreviewHead(post);
  assert.equal(meta(head,'og:image'),photo);
  assert.equal(meta(head,'twitter:image'),photo);
  assert.equal(meta(head,'og:image:type'),undefined);
  assert.equal(meta(head,'og:image:width'),undefined);
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
  assert.equal(url.searchParams.get('preview'),'4');
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
  assert.equal(meta(route.head({loaderData:data}),'og:image'),photo);
});
test('root metadata does not mislabel an attached JPEG as the brand PNG',()=>{
  const root=load('src/routes/__root.tsx',{
    '@tanstack/react-router':{createRootRouteWithContext:()=>config=>config},
    '@/lib/og/core/post':preview,
  }).Route;
  const tags=root.head({matches:[{routeId:'/app/post/$id',loaderData:{post}}]}).meta;
  assert.equal(tags.some(tag=>tag.property==='og:image:type'),false);
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
