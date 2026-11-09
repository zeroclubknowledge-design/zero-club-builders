import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

function load(file, globals) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, URL, URLSearchParams, console, ...globals });
  return exports;
}
function surface() {
  const document = new EventTarget(); document.hidden = false;
  const window = new EventTarget();
  const navigator = { onLine: true };
  let now = 100_000;
  const module = load('src/lib/resumeRefresh.ts', { document, window, navigator, Date: { now: () => now } });
  return { ...module, document, window, navigator, advance: () => { now += 31_000; } };
}

test('returning refreshes stale data while retaining the visible screen data', async () => {
  const s = surface();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['screen'], 'already visible');
  let finish;
  const observer = new QueryObserver(client, {
    queryKey: ['screen'], queryFn: () => new Promise(resolve => { finish = resolve; }),
    staleTime: 0, refetchOnMount: false,
  });
  const unsubscribe = observer.subscribe(() => {});
  const dispose = s.installResumeRefresh(client);
  s.document.hidden = true; s.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(finish, undefined);
  s.document.hidden = false; s.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(client.getQueryData(['screen']), 'already visible');
  assert.equal(observer.getCurrentResult().isPending, false);
  assert.equal(observer.getCurrentResult().isFetching, true);
  finish('updated in background');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(client.getQueryData(['screen']), 'updated in background');
  dispose(); unsubscribe(); client.clear();
});

test('resume coalesces events, skips offline activity, and removes listeners', async () => {
  const s = surface(); let calls = 0; let finish;
  const dispose = s.installResumeRefresh({ refetchQueries: filters => {
    assert.equal(filters.type, 'active'); assert.equal(filters.stale, true);
    calls++; return new Promise(resolve => { finish = resolve; });
  } });
  s.navigator.onLine = false; s.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 0);
  s.navigator.onLine = true; s.window.dispatchEvent(new Event('online'));
  s.document.dispatchEvent(new Event('visibilitychange')); assert.equal(calls, 1);
  finish(); await new Promise(resolve => setTimeout(resolve, 0));
  s.document.dispatchEvent(new Event('visibilitychange')); assert.equal(calls, 1);
  s.advance(); s.document.dispatchEvent(new Event('visibilitychange')); assert.equal(calls, 2);
  finish(); dispose(); s.advance(); s.window.dispatchEvent(new Event('online'));
  assert.equal(calls, 2);
});

test('background preload errors never reload or swallow imports; actual route errors still recover', async () => {
  const window = new EventTarget(); let reloads = 0;
  window.location = { href: 'https://www.zeroclubs.xyz/app', reload: () => { reloads++; } };
  const document = { hidden: false };
  const store = new Map();
  const recovery = load('src/lib/chunk-recovery.ts', {
    window, document, navigator: {}, Date,
    sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
  });
  recovery.installChunkRecovery();
  const error = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(error);
  const rejection = new Event('unhandledrejection', { cancelable: true });
  rejection.reason = 'Failed to fetch dynamically imported module'; window.dispatchEvent(rejection);
  assert.equal(reloads, 0); assert.equal(error.defaultPrevented, false);
  assert.equal(rejection.defaultPrevented, false);
  document.hidden = true;
  assert.equal(recovery.recoverFromChunkError(), false); assert.equal(reloads, 0);
  document.hidden = false;
  assert.equal(recovery.recoverFromChunkError(), true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(reloads, 1);
});
