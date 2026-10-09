import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const element = (type, props) => ({ type, props });
function nodes(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
function harness(file, options = {}) {
  const events = [], state = [], cache = new Map(); let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++; if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useMemo: (fn) => fn(), useEffect() {},
  };
  const client = {
    invalidateQueries: async (data) => { events.push(["invalidate", data.queryKey]); },
    getQueryData: (key) => cache.get(JSON.stringify(key)),
    setQueryData: (key, value) => cache.set(JSON.stringify(key), value),
  };
  const query = {
    useQueryClient: () => client,
    useQuery: (args) => {
      const key = JSON.stringify(args.queryKey);
      if (options.conversations) return { data: options.conversations, isLoading: false };
      if (args.enabled && !cache.has(key)) cache.set(key, args.queryFn());
      return { data: cache.get(key) };
    },
  };
  const storage = new Map();
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, window: { setTimeout() { assert.fail("Actions must preserve the click gesture"); } },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
      if (name === "@tanstack/react-query") return query;
      if (name === "sonner") return { toast: { success: (v) => events.push(["success", v]), error: (v) => events.push(["error", v]) } };
      if (name.includes("icons")) return new Proxy({}, { get: (_, key) => String(key) });
      if (name.includes("ui/drawer")) return { Drawer: "Drawer", DrawerContent: "DrawerContent", DrawerTitle: "DrawerTitle" };
      if (name.includes("useVoiceRecorder")) return { decodeChatMedia: (url) => ({ url }) };
      if (name.includes("ImageLightbox")) return { downloadMedia: () => {} };
      if (name === "@/api") return { getConversations() {}, sendMessageAction: options.send || (async () => {}) };
      if (name === "@/lib/share") return { copyToClipboard: (value) => events.push(["copy", value]) };
      throw new Error(name);
    },
  });
  return { exports, events, state, storage, render(name, props) { cursor = 0; return exports[name](props); } };
}

test("copy runs synchronously and the action drawer sits above full-screen chat", () => {
  const h = harness("../src/features/chat/MessageActions.tsx");
  const tree = h.render("MessageActionsSheet", {
    open: true, message: { id: "1", content: "Hello", created_at: new Date().toISOString() },
    isMe: true, onOpenChange: () => h.events.push(["close"]),
  });
  const content = nodes(tree).find((n) => n.type === "DrawerContent");
  assert.equal(tree.props.handleOnly, true);
  assert.match(content.props.className, /z-\[210\]/);
  assert.equal(content.props.overlayClassName, "z-[200]");
  nodes(tree).find((n) => n.type === "button" && n.props.children?.includes?.("Copy")).props.onClick();
  assert.deepEqual(h.events.slice(0, 2), [["copy", "Hello"], ["close"]]);
});

test("failed forwards retry only failed recipients, with the forwarded label", async () => {
  const calls = []; let fail = true, closes = 0;
  const h = harness("../src/features/chat/MessageActions.tsx", {
    conversations: [{ user: { id: "a", username: "A" } }, { user: { id: "b", username: "B" } }],
    send: async (input) => { calls.push(input); if (input.receiverId === "b" && fail) throw new Error("offline"); },
  });
  const props = { message: { content: "Shared" }, onClose: () => closes++ };
  h.render("ForwardSheet", props); h.state[1] = ["a", "b"];
  let tree = h.render("ForwardSheet", props);
  assert.equal(tree.props.handleOnly, true);
  await nodes(tree).filter((n) => n.type === "button").at(-1).props.onClick();
  assert.equal(closes, 0); assert.deepEqual([...h.state[1]], ["b"]);
  fail = false; tree = h.render("ForwardSheet", props);
  await nodes(tree).filter((n) => n.type === "button").at(-1).props.onClick();
  assert.deepEqual(calls.map((c) => c.receiverId), ["a", "b", "b"]);
  assert.ok(calls.every((c) => c.forwarded === true)); assert.equal(closes, 1);
});

test("club highlights persist under the account and update immediately", () => {
  const h = harness("../src/features/chat/useClubHighlights.ts");
  let a = h.render("useClubHighlights", "account-a"); a.toggle("message-1");
  a = h.render("useClubHighlights", "account-a"); assert.ok(a.ids.has("message-1"));
  const b = h.render("useClubHighlights", "account-b"); assert.equal(b.ids.size, 0);
  assert.equal(h.storage.get("zc:club-highlights:account-a"), '["message-1"]');
  a.toggle("message-1"); assert.equal(h.render("useClubHighlights", "account-a").ids.size, 0);
});

test("highlight policies hide other users' stars and block unrelated messages even with an older permissive policy", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select current_setting('test.uid')::uuid$$;
      grant usage on schema auth to authenticated;
      create table profiles(id uuid primary key);
      create table messages(id uuid primary key, sender_id uuid, receiver_id uuid);
      create table message_highlights(profile_id uuid references profiles(id), message_id uuid references messages(id), primary key(profile_id,message_id));
      insert into profiles values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
      insert into messages values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');
      create policy old_allow_all on message_highlights for all to authenticated using(true) with check(true);
      grant select on messages to authenticated;
      insert into message_highlights values ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');`);
    await db.exec(fs.readFileSync(new URL("../supabase/migrations/20261009160000_secure_message_highlights.sql", import.meta.url), "utf8"));
    await db.exec(`set role authenticated; set test.uid = '00000000-0000-0000-0000-000000000001'`);
    assert.equal((await db.query("select * from message_highlights")).rows.length, 0);
    await assert.rejects(db.exec(`insert into message_highlights values ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')`), /row-level security/);
    await db.exec(`insert into message_highlights values ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')`);
    assert.equal((await db.query("select * from message_highlights")).rows.length, 1);
  } finally { await db.close(); }
});
