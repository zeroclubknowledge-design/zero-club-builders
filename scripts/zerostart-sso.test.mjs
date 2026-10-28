import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = ts.transpileModule(read('ZeroStart/src/lib/sso.ts').replace(/^import .*;\r?\n/gm, ''), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ origin = 'https://start.zeroclubs.xyz', verify = async () => ({ error: null }) } = {}) {
  const listeners = new Set(), frames = [], storage = new Map(), exchanges = [];
  const api = {};
  const window = { location: { origin }, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  vm.runInNewContext(source, {
    exports: api, URL, setTimeout, clearTimeout, window,
    config: { productKey: 'zerostart', zeroClubUrl: 'https://www.zeroclubs.xyz' },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    supabase: { auth: { verifyOtp: args => { exchanges.push(args); return verify(args); } } },
    document: {
      createElement: () => ({ style: {}, contentWindow: {}, setAttribute() {}, remove() { this.removed = true; } }),
      body: { appendChild: frame => frames.push(frame) },
    },
  });
  const message = (overrides = {}) => {
    const event = { origin: 'https://www.zeroclubs.xyz', source: frames[0]?.contentWindow, data: { type: 'zc-sso', status: 'ok', token_hash: 'one-use-code' }, ...overrides };
    for (const listener of [...listeners]) void listener(event);
  };
  return { api, frames, listeners, exchanges, message };
}

test('trusted handoff exchanges one code and cleans up the hidden frame', async () => {
  const h = setup(); const result = h.api.trySharedSignIn(200);
  assert.match(h.frames[0].src, /origin=https%3A%2F%2Fstart.zeroclubs.xyz$/);
  h.message();
  assert.equal(await result, true);
  assert.equal(h.exchanges[0].type, 'magiclink');
  assert.equal(h.exchanges[0].token_hash, 'one-use-code');
  assert.equal(h.listeners.size, 0); assert.equal(h.frames[0].removed, true);
});
test('foreign origins and other frames cannot supply a sign-in code', async () => {
  const h = setup(); const result = h.api.trySharedSignIn(200);
  h.message({ origin: 'https://evil.example' }); h.message({ source: {} });
  h.message({ data: { type: 'other', status: 'ok', token_hash: 'bad' } });
  assert.equal(h.exchanges.length, 0);
  h.message(); assert.equal(await result, true);
});
test('concurrent callers and duplicate messages only exchange once', async () => {
  let complete; const h = setup({ verify: () => new Promise(resolve => { complete = resolve; }) });
  const first = h.api.trySharedSignIn(200), second = h.api.trySharedSignIn(200);
  assert.equal(first, second); h.message(); h.message();
  assert.equal(h.exchanges.length, 1); complete({ error: null });
  assert.equal(await first, true);
});
test('an explicit sign-out prevents shared sign-in until manual sign-in enables it', async () => {
  const h = setup(); h.api.turnSharedSignInOff();
  assert.equal(await h.api.trySharedSignIn(), false); assert.equal(h.frames.length, 0);
  h.api.turnSharedSignInOn(); const result = h.api.trySharedSignIn(200);
  h.message(); assert.equal(await result, true);
});
test('no Club session, network failure, and timeout all allow normal sign-in', async () => {
  for (const mode of ['none', 'error', 'timeout', 'exchange']) {
    const h = setup({ verify: async () => { throw new Error('offline'); } });
    const result = h.api.trySharedSignIn(15);
    if (mode === 'none') h.message({ data: { type: 'zc-sso', status: 'none' } });
    if (mode === 'error') h.frames[0].onerror();
    if (mode === 'exchange') h.message();
    assert.equal(await result, false, mode);
    assert.equal(h.frames[0].removed, true); assert.equal(h.listeners.size, 0);
  }
});
test('only the two explicitly trusted ZeroStart hosts request a handoff', async () => {
  for (const origin of ['http://start.zeroclubs.xyz', 'https://unknown.zeroclubs.xyz', 'http://localhost:5173']) {
    const h = setup({ origin }); assert.equal(await h.api.trySharedSignIn(), false); assert.equal(h.frames.length, 0);
  }
  const h = setup({ origin: 'https://zerostart.zeroclubs.xyz' });
  const result = h.api.trySharedSignIn(200); h.message(); assert.equal(await result, true);
});
test('bridge and server agree on exact trusted app origins', () => {
  const bridge = read('public/sso-bridge.html'), edge = read('supabase/functions/sso-handoff/index.ts');
  const allowed = JSON.parse(bridge.match(/const ALLOWED = (\[[^;]+\]);/)[1]);
  const targets = JSON.parse(edge.match(/const TARGETS = (\[[^;]+\]);/)[1]);
  assert.deepEqual(allowed, targets);
  assert.ok(targets.includes('https://start.zeroclubs.xyz'));
  assert.ok(targets.includes('https://zerostart.zeroclubs.xyz'));
  assert.ok(targets.includes('https://form.zeroclubs.xyz'));
  assert.ok(targets.includes('https://gifts.zeroclubs.xyz'));
});
