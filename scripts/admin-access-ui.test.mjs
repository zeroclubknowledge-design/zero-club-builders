import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function load(path, require = () => ({})) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require, Intl, console });
  return exports;
}
const plans = load('src/features/membership/plans.ts');
const noir = load('src/lib/noirTheme.ts');
const rewards = load('src/features/games/rewardEntitlements.ts', () => plans);
function renderPage(path, profile, isLoading = false) {
  const empty = () => null;
  const dependencies = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    '@tanstack/react-router': {
      createFileRoute: () => config => ({ ...config, useSearch: () => ({}) }),
      Link: ({ to, children, ...props }) => React.createElement('a', { ...props, href: to }, children),
    },
    '@tanstack/react-query': { useQueryClient: () => ({}), useQuery: () => ({ data: null }), useMutation: () => ({ isPending: false }) },
    '@/hooks/useUser': { useUser: () => ({ data: profile, isLoading }) },
    '@/hooks/useGoBack': { useGoBack: () => empty },
    '@/features/membership/plans': plans,
  };
  const stub = new Proxy({}, { get: () => empty });
  const page = load(path, name => dependencies[name] || stub);
  return renderToStaticMarkup(React.createElement(page.Route.component));
}
import * as jsxRuntime from 'react/jsx-runtime';

test('admin stays fully entitled in any mode with Basic or expired paid tiers', () => {
  for (const account_type of ['Learner','Tutor','Institution']) for (const tier of ['Basic','Creator','Premium+']) {
    const admin = { id: 'admin', is_admin: true, account_type, tier };
    assert.equal(plans.resolvePlanKey(admin), 'administrator');
    assert.equal(plans.canUseZeroAI(admin), true);
    assert.equal(noir.isPremiumMember(admin), true);
    assert.equal(rewards.fallbackZeroGameRewardAllowance(admin).weekly_limit, null);
    assert.equal(plans.fallbackClubCapacity(admin, 1000).can_create, true);
  }
  assert.equal(noir.isPremiumMember({ account_type:'Learner', tier:'Basic' }), false);
  assert.equal(rewards.fallbackZeroGameRewardAllowance({ account_type:'Tutor', tier:'Basic' }).weekly_limit, 3);
});

test('admin membership and settings render access without checkout controls', () => {
  for (const path of ['src/routes/app.premium.tsx','src/routes/app.settings.premium.tsx','src/routes/app.settings.premium.features.tsx']) {
    const html = renderPage(path, { id:'admin', is_admin:true, account_type:'Learner', tier:'Basic' });
    assert.match(html, /[Aa]dministrator/);
    assert.doesNotMatch(html, /Get Creator|Get Tutor|Go PRO|Renew now|Compare all plans|Manage membership|paid from your Zero Club wallet/);
  }
  const learner = renderPage('src/routes/app.premium.tsx', { id:'learner', is_admin:false, account_type:'Learner', tier:'Basic' });
  assert.match(learner, /Learner plans/);
  assert.match(learner, /Get Premium/);
  assert.doesNotMatch(learner, /Everything is already unlocked|Creator Max/);
  assert.doesNotMatch(renderPage('src/routes/app.premium.tsx', undefined, true), /Go PRO|Get Learner/);
});
