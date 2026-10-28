import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = ts.transpileModule(read('ZeroStart/src/lib/theme.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup() {
  const classes = new Set(), storage = new Map(), listeners = new Map(), systemListeners = new Set();
  const meta = { content: '' }, media = {
    matches: false,
    addEventListener: (_, fn) => systemListeners.add(fn),
    removeEventListener: (_, fn) => systemListeners.delete(fn),
  };
  const events = prefix => ({
    addEventListener(name, fn) { const key = prefix + name; if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(fn); },
    removeEventListener(name, fn) { listeners.get(prefix + name)?.delete(fn); },
  });
  const document = { ...events('document:'), visibilityState: 'visible', querySelector: () => meta,
    documentElement: { classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)) } },
  };
  const window = { ...events('window:'), matchMedia: () => media };
  const api = {};
  vm.runInNewContext(source, { exports: api, document, window,
    localStorage: { setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  });
  const fire = async key => { await Promise.all([...listeners.get(key) || []].map(fn => fn())); };
  return { api, classes, storage, meta, media, systemListeners, document, fire };
}

test('account light, Black and Rose Noir use the same classes and browser colours', () => {
  const h = setup();
  h.api.applyAccountTheme('on', 'rose-noir');
  assert.ok(h.classes.has('dark')); assert.ok(h.classes.has('rose-noir')); assert.equal(h.meta.content, '#0a0409');
  h.api.applyAccountTheme('on', 'lights-out');
  assert.ok(h.classes.has('lights-out')); assert.ok(!h.classes.has('rose-noir')); assert.equal(h.meta.content, '#000000');
  h.api.applyAccountTheme('off', 'rose-noir');
  assert.equal(h.classes.size, 0); assert.equal(h.meta.content, '#f8f7f5');
  assert.deepEqual(JSON.parse(h.storage.get('zs-theme')), { mode: 'off', theme: 'rose-noir' });
});
test('system setting follows device changes and unsubscribes when disabled', () => {
  const h = setup(); h.api.applyAccountTheme('system', 'rose-noir'); assert.equal(h.classes.size, 0);
  h.media.matches = true; for (const fn of h.systemListeners) fn();
  assert.ok(h.classes.has('rose-noir'));
  h.api.applyAccountTheme('off', 'lights-out'); assert.equal(h.systemListeners.size, 0);
});
test('retired Dim and invalid variants fall back to Black, matching Zero Club', () => {
  const h = setup();
  for (const theme of ['dim', 'premium', 'invalid', null]) {
    h.api.applyAccountTheme('on', theme); assert.ok(h.classes.has('lights-out')); assert.equal(h.classes.size, 2);
  }
  h.api.resetTheme(); assert.equal(h.classes.size, 0); assert.equal(h.storage.size, 0);
});
test('focus, visible-tab return and restored pages refresh the account theme; hidden tabs do not', async () => {
  const h = setup(); let loads = 0;
  const stop = h.api.watchAccountTheme(async () => { loads++; return { theme_mode: 'on', dark_theme: 'rose-noir' }; });
  for (const event of ['window:focus', 'document:visibilitychange', 'window:pageshow']) await h.fire(event);
  assert.equal(loads, 3); assert.ok(h.classes.has('rose-noir'));
  h.document.visibilityState = 'hidden'; await h.fire('document:visibilitychange'); assert.equal(loads, 3);
  stop(); h.document.visibilityState = 'visible'; await h.fire('window:focus'); assert.equal(loads, 3);
});
test('duplicate return events coalesce, stale responses after sign-out are ignored, offline retains theme', async () => {
  const h = setup(); let complete, loads = 0;
  h.api.applyAccountTheme('on', 'lights-out');
  const stop = h.api.watchAccountTheme(() => { loads++; return new Promise(resolve => { complete = resolve; }); });
  const pending = h.fire('window:focus'); await h.fire('window:pageshow'); assert.equal(loads, 1);
  stop(); h.api.resetTheme(); complete({ theme_mode: 'on', dark_theme: 'rose-noir' }); await pending;
  assert.equal(h.classes.size, 0);
  h.api.applyAccountTheme('on', 'lights-out');
  const offline = h.api.watchAccountTheme(async () => { throw new Error('offline'); });
  await h.fire('window:focus'); assert.ok(h.classes.has('lights-out')); offline();
});
test('pre-paint script restores the cached variant and browser colour before React', () => {
  const script = read('ZeroStart/index.html').match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [theme, expected, colour] of [['rose-noir', 'rose-noir', '#0a0409'], ['dim', 'lights-out', '#000000']]) {
    const h = setup();
    vm.runInNewContext(script, {
      document: h.document, matchMedia: () => h.media,
      localStorage: { getItem: () => JSON.stringify({ mode: 'on', theme }) },
    });
    assert.ok(h.classes.has(expected)); assert.equal(h.meta.content, colour);
  }
});
