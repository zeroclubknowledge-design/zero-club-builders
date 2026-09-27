import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the request hook with deterministic hook storage, clock and transport.
// Media capture still requires a manual test in two signed-in browser sessions.
function room(isAdmin = false) {
  const slots = [], effects = [], sent = [], notices = [];
  let cursor = 0, now = 100000, tick;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => dep !== slots[index][i])) effects.push(fn);
      slots[index] = deps;
    },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/hooks/usePresentationRequests.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: name => name === "react" ? react : { toast: Object.fromEntries(["info", "error", "success"].map(key => [key, message => notices.push(message)])) },
    Date: { now: () => now }, crypto: { randomUUID: () => "request-1" },
    setInterval: fn => { tick = fn; return 1; }, clearInterval() {},
  });
  const props = {
    uid: isAdmin ? "tutor" : "learner", isAdmin,
    peers: [{ uid: "tutor", isAdmin: true }, { uid: "learner", isAdmin: false }],
    channelRef: { current: { state: "joined", send: async message => { sent.push(message.payload); return "ok"; } } },
  };
  const render = () => {
    cursor = 0;
    const result = exports.usePresentationRequests(props);
    effects.splice(0).forEach(fn => fn());
    return result;
  };
  return { render, props, sent, notices, advance: ms => { now += ms; tick(); } };
}

test("learner requests, tutor accepts, learner consumes one approval", async () => {
  const learner = room(), tutor = room(true);
  await learner.render().askOrCancel();
  assert.equal(learner.render().canStart(), false);
  tutor.render().receive(learner.sent[0]);
  const pending = tutor.render().incoming[0];
  assert.ok(pending);
  await tutor.render().decide(pending, true);
  learner.render().receive(tutor.sent[0]);
  assert.equal(learner.render().canStart(), true);
  learner.render().consume();
  assert.equal(learner.render().canStart(), false);
  learner.render().receive(tutor.sent[0]);
  assert.equal(learner.render().canStart(), false);
});

test("non-tutor and mismatched responses cannot grant approval", async () => {
  const learner = room();
  await learner.render().askOrCancel();
  learner.render().receive({ ...learner.sent[0], action: "accept", by: "learner" });
  assert.equal(learner.render().canStart(), false);
  learner.render().receive({ ...learner.sent[0], action: "accept", by: "tutor", id: "stale" });
  assert.equal(learner.render().canStart(), false);
});

test("cancel removes the tutor request and ignores late acceptance", async () => {
  const learner = room(), tutor = room(true);
  await learner.render().askOrCancel();
  tutor.render().receive(learner.sent[0]);
  await learner.render().askOrCancel();
  tutor.render().receive(learner.sent[1]);
  assert.equal(tutor.render().incoming.length, 0);
  learner.render().receive({ ...learner.sent[0], action: "accept", by: "tutor" });
  assert.equal(learner.render().request, null);
});

test("decline, expiry and tutor departure clear pending approval", async () => {
  for (const action of ["decline", "expire", "leave"]) {
    const learner = room();
    await learner.render().askOrCancel();
    if (action === "decline") learner.render().receive({ ...learner.sent[0], action, by: "tutor" });
    if (action === "expire") learner.advance(61000);
    if (action === "leave") { learner.props.peers = []; learner.render(); }
    assert.equal(learner.render().request, null);
    assert.equal(learner.render().canStart(), false);
  }
});

test("failed delivery restores the request button", async () => {
  const learner = room();
  learner.props.channelRef.current.send = async () => "timed out";
  await learner.render().askOrCancel();
  assert.equal(learner.render().request, null);
  assert.equal(learner.render().busy, false);
  assert.equal(learner.notices.length, 1);
});
