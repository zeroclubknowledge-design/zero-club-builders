import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function navigation() {
  const exports = {};
  let resolved;
  const calls = [];
  const router = {
    history: { location: { pathname: '/app', state: { __TSR_index: 0 }, search: '' }, go: steps => calls.push(steps) },
    subscribe: (_, handler) => { resolved = handler; return () => {}; },
    navigate: options => calls.push(options),
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/useGoBack.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, URLSearchParams, window: {}, require: name => name === 'react'
    ? { useCallback: fn => fn } : { useRouter: () => router } });
  exports.trackNavigationDepth(router);
  return { calls, back: fallback => exports.useGoBack(fallback)(), visit: (index, pathname, searchStr = '') =>
    resolved({ toLocation: { pathname, searchStr, state: { __TSR_index: index } } }) };
}

test('store back returns to wallet, and the next back leaves wallet', () => {
  const n = navigation();
  n.visit(1, '/app/wallet'); n.visit(2, '/app/store');
  n.back('/app/wallet'); assert.equal(n.calls.pop(), -1);
  n.visit(1, '/app/wallet'); n.back('/app'); assert.equal(n.calls.pop(), -1);
});

test('back skips room changes but preserves distinct clubs', () => {
  const n = navigation();
  n.visit(1, '/app/clubs/chat', '?clubId=one&room=general');
  n.visit(2, '/app/clubs/chat', '?clubId=one&room=announcements');
  n.visit(3, '/app/clubs/chat', '?clubId=two&room=general');
  n.back(); assert.equal(n.calls.pop(), -1);
  n.visit(2, '/app/clubs/chat', '?clubId=one&room=announcements');
  n.back(); assert.equal(n.calls.pop(), -2);
});

test('return detours do not create a back-arrow ping-pong', () => {
  const n = navigation();
  n.visit(1, '/app/store'); n.visit(2, '/app/wallet'); n.visit(3, '/app/store');
  n.back(); assert.equal(n.calls.pop(), -3);
});

test('a directly opened page replaces itself with its fallback', () => {
  const n = navigation();
  n.back('/app/clubs');
  assert.equal(n.calls[0].href, '/app/clubs'); assert.equal(n.calls[0].replace, true);
});

test('new navigation after back uses the new branch', () => {
  const n = navigation();
  n.visit(1, '/app/wallet'); n.visit(2, '/app/store');
  n.visit(1, '/app/wallet'); n.visit(2, '/app/settings');
  n.back(); assert.equal(n.calls.pop(), -1);
});
