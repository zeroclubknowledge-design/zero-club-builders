import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = path => fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const stub = new Proxy({}, {get:()=>()=>null});
function load(path,modules={},globals={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,require:name=>modules[name]||stub,URL,URLSearchParams,Request,Response,console,...globals});
  return exports;
}
const text=load('src/lib/og/core/text.ts');
const photo='https://example.com/attached-cover.jpg';

test('standalone form and gift links send social crawlers to public metadata and browsers to the app',()=>{
  for(const [folder,paths] of [
    ['Zero Form',['/form/:slug','/form/:slug/info','/form/:slug/register','/f/:slug']],
    ['Zero Gifts',['/gift/:code','/app/gifts/:code']]]) {
    const {rewrites}=JSON.parse(read(folder+'/vercel.json'));
    for(const path of paths) {
      const rule=rewrites.find(r=>r.source===path);
      assert.ok(rule);assert.match(rule.destination,/^https:\/\/www\.zeroclubs\.xyz\/api\/link-preview\?/);
      const match=new RegExp(rule.has[0].value);
      for(const agent of ['facebookexternalhit/1.1','LinkedInBot/1.0','WhatsApp/2.0','WhatsApp','Twitterbot','TelegramBot','Discordbot','Slackbot-LinkExpanding'])assert.ok(match.test(agent),agent);
      assert.equal(match.test('Mozilla/5.0 Chrome/140 Safari/537.36'),false);
    }
    assert.equal(rewrites.at(-1).destination,'/index.html');
  }
});

test('metadata is complete before JavaScript, escapes user copy and never supplies executable content',async()=>{
  const calls=[];
  const handler=load('src/lib/og/core/linkPreview.ts',{'./specs':{buildPreviewSpec:async(kind,id)=>{calls.push([kind,id]);return {title:'Design <script>alert(1)</script>',subtitle:'A "great" course & more',kicker:'Zero Form'};}}}).linkPreviewResponse;
  for(const kind of ['form','gift','campaign']) {
    const response=await handler(new Request(`https://www.zeroclubs.xyz/api/link-preview?kind=${kind}&id=CODE123`));
    const html=await response.text();
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
    assert.match(html,/name="twitter:card" content="summary_large_image"/);
    assert.match(html,new RegExp(`property="og:image" content="https://www.zeroclubs.xyz/api/og/${kind}/CODE123`));
    assert.match(html,/og:image:type" content="image\/png/);assert.match(html,/og:image:width" content="1200/);
    assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));assert.match(html,/&quot;great&quot;/);
    assert.match(response.headers.get('cache-control'),/s-maxage=60/);
  }
  assert.equal(calls.length,3);
  for(const query of ['kind=private&id=abc','kind=form&id=https%3A%2F%2Fevil.example','kind=gift&id=','kind=form&id=%00'])assert.equal((await handler(new Request('https://www.zeroclubs.xyz/api/link-preview?'+query))).status,404);
  assert.equal(await (await handler(new Request('https://www.zeroclubs.xyz/api/link-preview?kind=form&id=course',{method:'HEAD'}))).text(),'');
});

test('campaign, bootcamp and form spec select the artwork belonging to that link',async()=>{
  const id='00000000-0000-0000-0000-000000000001';
  const specs=load('src/lib/og/core/specs.ts',{'./text':text,'./db':{
    rpc:async(name,args)=>name==='zs_campaign_link_preview'?{found:true,title:'Campaign',cover_url:photo,summary:'Hello'}:{found:true,form:{title:'Form',banner_url:'https://example.com/form.png'},bootcamp:{banner_url:photo}},
    one:async(table)=>table==='bootcamps'?{status:'active',title:'Camp',banner_url:photo}:{banner_url:'https://example.com/form.png'},
  }});
  for(const [kind,key,expected] of [['campaign','ABC123',photo],['bootcamp',id,photo],['form','course','https://example.com/form.png']]) {
    const spec=await specs.buildPreviewSpec(kind,key,new URL('https://www.zeroclubs.xyz'));
    assert.equal(spec.image,expected);assert.equal(spec.variant,'photo');
  }
});

test('every photo variant renders the attached image before any branded fallback',async()=>{
  const bytes=new Uint8Array([137,80,78,71]);
  const response=load('src/lib/og/core/respond.ts',{
    './specs':{buildPreviewSpec:async()=>({variant:'photo',image:photo})},
    './card':{drawPostPhoto:async image=>{assert.equal(image,photo);return bytes.buffer;},fonts:()=>{throw Error('No brand fallback expected');}},
  }).previewResponse;
  for(const kind of ['post','form','bootcamp','campaign','product','club','live']) {
    const result=await response(kind,'test',new URL('https://www.zeroclubs.xyz'));
    assert.equal(result.headers.get('content-type'),'image/png');assert.equal((await result.arrayBuffer()).byteLength,4);
  }
});

test('public campaign lookup is idempotent and excludes draft, paused and removed campaigns',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;
      create table zs_amb_campaigns(id int,status text,title text,summary text,description text,cover_url text);
      create table zs_campaign_members(campaign_id int,code text,profile_id text);
      insert into zs_amb_campaigns values(1,'live','Live','Summary','Description','${photo}'),(2,'draft','Secret',null,null,null),(3,'paused','Paused',null,null,null),(4,'removed','Removed',null,null,null),(5,'ended','Ended',null,null,null);
      insert into zs_campaign_members values(1,'LIVE123','private-user'),(2,'DRAFT123','private-user'),(3,'PAUSE123','private-user'),(4,'GONE123','private-user'),(5,'END123','private-user');
      revoke all on zs_campaign_members,zs_amb_campaigns from public;`);
    const migration=read('supabase/migrations/20261029160000_campaign_link_previews.sql');
    await db.exec(migration);await db.exec(migration);await db.exec('set role anon');
    const preview=async code=>(await db.query('select zs_campaign_link_preview($1) result',[code])).rows[0].result;
    const live=await preview(' live123 ');assert.equal(live.cover_url,photo);assert.equal(live.found,true);
    assert.deepEqual(Object.keys(live).sort(),['cover_url','description','found','summary','title']);
    for(const code of ['DRAFT123','PAUSE123','GONE123','UNKNOWN'])assert.equal((await preview(code)).found,false);
    assert.equal((await preview('END123')).found,true);
    await assert.rejects(db.query('select * from zs_campaign_members'),/permission denied/);
  } finally {await db.close();}
});

test('Zero Start signup metadata keeps campaign referral code and cover in initial HTML',async()=>{
  const route=load('src/routes/signup.tsx',{
    '@tanstack/react-router':{createFileRoute:()=>config=>config},
    '@/lib/og/core/db':{rpc:async(name,args)=>{assert.equal(name,'zs_campaign_link_preview');assert.equal(args.p_code,'ABC123');return {found:true,title:'Learn design',summary:'<p>Build together</p>'};}},
    '@/lib/og/core/text':text,
  }).Route;
  const data=await route.loader({deps:{code:'ABC123'}});
  const head=route.head({loaderData:data});
  const meta=key=>head.meta.find(tag=>tag.property===key||tag.name===key)?.content;
  assert.equal(meta('og:title'),'Learn design');assert.match(meta('og:url'),/signup\?c=ABC123$/);
  assert.match(meta('og:image'),/api\/og\/campaign\/ABC123/);assert.equal(meta('og:image'),meta('twitter:image'));
  assert.equal(await route.loader({deps:{}}),null);
});
