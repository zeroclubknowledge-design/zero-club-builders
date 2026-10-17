import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const post={id:'post-1',author_id:'bob',content:'A real feed post'};
function render(options={}) {
  const {tab,posts,pending,fetching,postError,following,followError,followFetching}={tab:'Following',posts:[post],pending:false,fetching:false,postError:false,following:['bob'],followError:false,followFetching:false,...options};
  const output={};const modules={
    react:React,'react/jsx-runtime':jsx,
    '@tanstack/react-router':{createFileRoute:()=>config=>({...config,useSearch:()=>({})}),useRouter:()=>({navigate:()=>{}}),Link:({children,...props})=>React.createElement('a',{},children)},
    '@tanstack/react-query':{useQueryClient:()=>({invalidateQueries:()=>{}}),useQuery:options=>options.queryKey[0]==='feed_posts'?{data:posts,isPending:pending,isFetching:fetching,isError:postError,refetch:()=>{}}:{data:[],isLoading:false}},
    '@/hooks/useUser':{useUser:()=>({data:{id:'alice'},followSummary:{data:following===undefined?undefined:{following_ids:following},isError:followError,isFetching:followFetching,refetch:()=>{}}})},
    '@/lib/draftStorage':{draftKey:(_,part)=>part,usePersistentDraft:(_,fallback)=>[fallback==='Discover'?tab:null,()=>{}]},
    '@/components/PostCard':{PostCard:({post})=>React.createElement('article',{},post.content)},
    '@/features/boost/api':{sponsoredSlots:()=>[]},
    '@/features/create/CreateHub':{useLiveClubs:()=>({data:[],isLoading:false})},
  };
  const empty=new Proxy({}, {get:()=>()=>null});
  vm.runInNewContext(ts.transpileModule(read('src/routes/app.index.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:output,require:name=>modules[name]||empty});
  return renderToStaticMarkup(React.createElement(output.Feed));
}
test('cached posts wait for following data rather than flashing an empty feed',()=>{
  const html=render({following:undefined,followFetching:true});
  assert.match(html,/Loading feed/);assert.doesNotMatch(html,/No posts|quiet feed|Ship your work/);
});
test('returning Home uses cached follows immediately and keeps posts during background refresh',()=>{
  for(const options of [{},{fetching:true,followFetching:true},{followError:true}]) {
    const html=render(options);assert.match(html,/A real feed post/);
    assert.doesNotMatch(html,/Loading feed|No posts|quiet feed|Ship your work/);
  }
});
test('cached empty results do not flash an empty screen while a refresh is pending',()=>{
  assert.match(render({posts:[],fetching:true}),/Loading feed/);
  assert.match(render({posts:undefined,pending:true,fetching:true}),/Loading feed/);
});
test('only a completed empty Following feed offers Discover',()=>{
  const html=render({posts:[]});assert.match(html,/No posts from people you follow yet/);assert.match(html,/Explore Discover/);
  assert.doesNotMatch(html,/quiet feed|Ship your work/);
});
test('failed requests offer retry instead of claiming there are no posts',()=>{
  for(const options of [{posts:undefined,postError:true},{following:undefined,followError:true}]) {
    const html=render(options);assert.match(html,/Try again/);assert.doesNotMatch(html,/No posts|quiet feed|Ship your work/);
  }
});
test('Discover does not wait for the Following filter',()=>{
  assert.match(render({tab:'Discover',following:undefined,followFetching:true}),/A real feed post/);
});
test('the post fetcher rejects a failed request instead of caching an empty success',async()=>{
  const ast=ts.createSourceFile('api.ts',read('src/services/api.ts'),ts.ScriptTarget.Latest,true);
  const declaration=ast.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='getPosts'));
  const output={};const failure=new Error('Network unavailable');
  const supabase={from:table=>{const query={};for(const method of ['select','order','limit'])query[method]=()=>query;query.then=resolve=>resolve({data:null,error:table==='posts'?failure:null});return query;}};
  vm.runInNewContext(ts.transpileModule(declaration.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:output,supabase,getCachedSession:async()=>({data:{session:null}}),console:{error:()=>{}}});
  await assert.rejects(output.getPosts(),/Network unavailable/);
});
