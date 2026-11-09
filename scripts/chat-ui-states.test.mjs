import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function load(path, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => dependencies[name] || {}, console });
  return exports;
}
const icons = new Proxy({}, { get: () => () => null });
const base = { react: React, 'react/jsx-runtime': jsx, '@/components/icons/glyphs': icons };

for (const draft of ['', '@', 'Hello @ZeroAI']) {
  test(`club composer displays appropriate tools for ${JSON.stringify(draft)}`, () => {
    const { ClubComposer } = load('src/features/community/ClubComposer.tsx', {
      ...base,
      '@/lib/draftStorage': { usePersistentDraft: () => [draft, () => {}] },
      '@/lib/chatPrefs': { useEnterToSend: () => [false] },
      '@/components/MentionField': { MentionField: () => null },
      '@/components/ComposerSlot': { ComposerSlot: ({ show, children }) => show ? children : null },
    });
    const html = renderToStaticMarkup(React.createElement(ClubComposer, {
      storageKey: null, hasMedia: false, placeholder: 'Write a message…', onSend: () => true,
      leading: React.createElement('button', { 'aria-label': 'Options' }),
      trailing: React.createElement('button', { 'aria-label': 'Record voice note' }),
    }));
    if (draft === 'Hello @ZeroAI') {
      assert.match(html, /aria-label="Send message"/);
      assert.doesNotMatch(html, /aria-label="Options"|aria-label="Record voice note"/);
    } else {
      assert.match(html, /aria-label="Options"/);
      assert.match(html, /aria-label="Record voice note"/);
      assert.doesNotMatch(html, /aria-label="Send message"/);
    }
  });
}

for (const state of ['signed-in', 'guest', 'loading']) {
  test(`Help header shows ${state} account controls`, () => {
    const { PublicHeader } = load('src/components/public/PublicHeader.tsx', {
      ...base,
      '@/hooks/useUser': { useUser: () => ({ data: state === 'signed-in' ? { id: 'member' } : null, isPending: state === 'loading' }) },
      '@/hooks/usePublicTheme': { usePublicTheme: () => ({ dark: true, toggle() {} }) },
      '@tanstack/react-router': { Link: ({ to, children, search, params, ...props }) => React.createElement('a', { ...props, href: to }, children) },
    });
    const html = renderToStaticMarkup(React.createElement(PublicHeader, { section: 'Documentation' }));
    if (state === 'guest') assert.match(html, /Sign in/);
    else assert.doesNotMatch(html, /Sign in|>Join</);
    if (state === 'signed-in') assert.match(html, /Open Zero Club/);
  });
}

test('an empty club or announcement field cannot wrap or scroll its placeholder', () => {
  const { ClubComposer } = load('src/features/community/ClubComposer.tsx', {
    ...base,
    '@/lib/draftStorage': { usePersistentDraft: () => ['', () => {}] },
    '@/lib/chatPrefs': { useEnterToSend: () => [false] },
    '@/components/MentionField': { MentionField: ({ style, wrap, placeholder }) => React.createElement('textarea', { style, wrap, placeholder }) },
    '@/components/ComposerSlot': { ComposerSlot: ({ show, children }) => show ? children : null },
  });
  const html = renderToStaticMarkup(React.createElement(ClubComposer, {
    storageKey: null, hasMedia: false, placeholder: 'Post an announcement…', onSend: () => true,
    leading: React.createElement('button', { 'aria-label': 'Options' }),
  }));
  assert.match(html, /wrap="off"/);
  assert.match(html, /overflow-y:hidden/);
  assert.match(html, /white-space:pre/);
});

test('shared attachment menu opens the corresponding picker and optional club poll', () => {
  const primitive = () => null;
  const { ChatAttachmentMenu } = load('src/features/community/ChatAttachmentMenu.tsx', {
    ...base,
    '@/components/ui/dropdown-menu': {
      DropdownMenu: primitive, DropdownMenuTrigger: primitive,
      DropdownMenuContent: primitive, DropdownMenuItem: primitive,
    },
  });
  const chosen = [];
  const actions = { onPictures: () => chosen.push('pictures'), onVideo: () => chosen.push('video'), onFile: () => chosen.push('file') };
  const menu = ChatAttachmentMenu(actions);
  const entries = menu.props.children[1].props.children[0];
  assert.deepEqual(Array.from(entries, entry => entry.props.children[1]), ['Pictures', 'Video', 'File']);
  for (const entry of entries) entry.props.onSelect();
  assert.deepEqual(chosen, ['pictures', 'video', 'file']);
  const clubMenu = ChatAttachmentMenu({ ...actions, onPoll: () => chosen.push('poll') });
  clubMenu.props.children[1].props.children[0][3].props.onSelect();
  assert.equal(chosen.at(-1), 'poll');
});
