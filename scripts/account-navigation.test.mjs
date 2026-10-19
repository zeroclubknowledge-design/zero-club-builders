import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/accountNavigation.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const { accountNavigation, navigationAudience, navigationAllowed } = exports;
const destinations = [
  '/app/creator', '/app/my-store', '/app/tutor-studio', '/app/certifications',
  '/app/institution-studio', '/app/business', '/app/admin',
];
const visible = profile => Array.from(accountNavigation(profile, destinations.map(to => ({ to }))), link => link.to);

test('each account only sees its professional tools', () => {
  const cases = [
    [{ account_type: 'Learner' }, []],
    [{ account_type: 'Learner', active_mode: 'creator' }, ['/app/creator', '/app/my-store']],
    [{ account_type: 'Creator' }, ['/app/creator', '/app/my-store']],
    [{ account_type: 'Tutor' }, ['/app/tutor-studio', '/app/certifications']],
    [{ account_type: 'Institution' }, ['/app/certifications', '/app/institution-studio']],
    [{ account_kind: 'business', business_mode: 'institutional' }, ['/app/certifications', '/app/institution-studio']],
    [{ account_kind: 'business', business_mode: 'company' }, ['/app/business']],
    [null, []],
    [{ account_type: 'unrecognized' }, []],
  ];
  for (const [profile, expected] of cases) assert.deepEqual(visible(profile), expected);
});

test('subscriptions and tutor approval never leak tools from another mode', () => {
  for (const tier of ['Basic', 'Creator', 'CreatorMax', 'Premium', 'Premium+']) {
    assert.deepEqual(visible({ account_type: 'Learner', active_mode: 'learner', tutor_enabled: true, tier }), []);
    assert.deepEqual(visible({ account_type: 'Tutor', active_mode: 'creator', tier }), ['/app/tutor-studio', '/app/certifications']);
  }
  assert.equal(navigationAudience({ account_type: 'Learner', active_mode: 'tutor', tutor_enabled: true }), 'learner');
});

test('switching modes updates tools without changing the subscription', () => {
  const profile = { account_type: 'Learner', active_mode: 'learner', tier: 'CreatorMax' };
  assert.deepEqual(visible(profile), []);
  profile.active_mode = 'creator';
  assert.deepEqual(visible(profile), ['/app/creator', '/app/my-store']);
  profile.account_type = 'Tutor';
  profile.active_mode = 'tutor';
  assert.deepEqual(visible(profile), ['/app/tutor-studio', '/app/certifications']);
  profile.account_type = 'Learner';
  profile.active_mode = 'learner';
  assert.deepEqual(visible(profile), []);
});

test('shared features remain available for all account types', () => {
  for (const account_type of ['Learner', 'Creator', 'Tutor', 'Institution', 'Business']) {
    for (const path of ['/app', '/app/bootcamps', '/app/clubs', '/app/chat', '/app/tasks', '/app/wallet', '/app/store', '/app/teams', '/app/metrics', '/app/portfolio', '/app/notes', '/app/zero-ai']) {
      assert.equal(navigationAllowed({ account_type }, path), true, `${account_type}: ${path}`);
    }
  }
});

test('nested links and query strings follow the same account restrictions', () => {
  const learner = { account_type: 'Learner' };
  for (const path of ['/app/tutor-studio/create', '/app/creator/?tab=earnings', '/app/business?tab=talent', '/app/certifications#templates']) {
    assert.equal(navigationAllowed(learner, path), false, path);
  }
  assert.equal(navigationAllowed({ account_type: 'Tutor' }, '/app/tutor-studio/create'), true);
});

test('Zero Club administrators keep access to every workspace', () => {
  for (const account_type of ['Learner', 'Tutor', 'Institution']) {
    assert.deepEqual(visible({ is_admin: true, account_type, active_mode: 'learner' }), destinations);
  }
});
