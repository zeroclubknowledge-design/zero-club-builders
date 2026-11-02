import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('notification shortcut uses a fixed app and never loops through a web fallback', () => {
  const source = fs.readFileSync(new URL('../src/lib/notificationSettings.ts', import.meta.url), 'utf8');
  const api = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: api });
  const settings = api.notificationSettingsIntent();
  const permission = api.notificationSettingsIntent(true);
  assert.match(settings, /package=xyz\.zeroclubs\.app;/);
  assert.match(settings, /B\.requestPermission=false;/);
  assert.match(permission, /B\.requestPermission=true;/);
  assert.ok(!settings.includes('browser_fallback_url'));
  assert.ok(!permission.includes('browser_fallback_url'));
});
