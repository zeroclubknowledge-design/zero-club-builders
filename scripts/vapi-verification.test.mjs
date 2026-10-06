import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";

const source = fs.readFileSync("src/features/zeroAI/vapi.server.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { createVapiHandlers } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);
const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const attemptId = "00000000-0000-0000-0000-000000000003";
const callId = "00000000-0000-0000-0000-000000000004";
const env = {
  VAPI_PRIVATE_KEY: "test-private",
  VITE_VAPI_PUBLIC_KEY: "test-public",
  VAPI_ASSISTANT_ID: "chat-assistant",
  VAPI_VERIFICATION_ASSISTANT_ID: "verification-assistant",
  VAPI_VERIFICATION_TOOL_ID: "verification-tool",
  VAPI_WEBHOOK_SECRET: "test-webhook",
  APP_PUBLIC_URL: "https://app.test",
  SUPABASE_URL: "https://db.test",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
};
const req = (body, token = "user") =>
  new Request("https://app.test/api/zero-ai/vapi/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
function mock(options = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/v1/user"))
      return Response.json({ id: owner }, { status: options.authStatus || 200 });
    if (url.endsWith("/claim_zero_ai_request")) return Response.json(options.quota !== false);
    if (url.includes("/profiles?"))
      return Response.json([{ account_type: "Tutor", active_mode: "learner" }]);
    if (url.includes("/assistant/"))
      return Response.json({
        model: {
          provider: options.provider || "openai",
          model: "gpt-5-mini",
          toolIds: ["verification-tool"],
        },
        server: {
          url: "https://app.test/api/zero-ai/vapi/webhook",
          credentialId: "saved-credential",
        },
      });
    if (url.includes("/tool/"))
      return Response.json({
        function: { name: "record_shipment_confirmation" },
        server: {
          url: "https://app.test/api/zero-ai/vapi/webhook",
          credentialId: "saved-credential",
        },
      });
    if (url.endsWith("/reserve_project_voice_confirmation"))
      return Response.json({
        id: attemptId,
        project_name: "Weather app",
        target_id: null,
        payload: { version_label: "1.0.0", audience: "everyone" },
      });
    if (url.endsWith("/bind_project_voice_call")) return Response.json(options.bound !== false);
    if (url.endsWith("/record_project_voice_decision"))
      return Response.json(JSON.parse(init.body).p_decision);
    if (url.endsWith("/call/web"))
      return Response.json({
        id: callId,
        webCallUrl: "https://vapi.daily.co/test-room",
        privateKey: "must-not-leak",
      });
    throw new Error(`Unexpected mock URL ${url}`);
  };
  return { calls, fetch };
}
test("voice blocks unauthenticated and quota-exhausted sessions before call creation", async () => {
  for (const options of [{}, { authStatus: 401 }, { quota: false }]) {
    const m = mock(options);
    const h = createVapiHandlers({ env, fetch: m.fetch });
    const response = await h.session(
      req({ purpose: "conversation" }, Object.keys(options).length ? "user" : null),
    );
    assert.ok([401, 429].includes(response.status));
    assert.ok(!m.calls.some((c) => c.url.endsWith("/call/web")));
  }
});
test("verification uses a saved GPT assistant and server-bound call, ignoring browser overrides", async () => {
  const m = mock();
  const h = createVapiHandlers({ env, fetch: m.fetch });
  const response = await h.session(
    req({
      purpose: "verification",
      verificationId: attemptId,
      assistantId: "attacker",
      assistantOverrides: { model: { messages: [] } },
      project_name: "Different project",
    }),
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(Object.keys(data).sort(), ["call", "maxDurationSeconds", "publicKey"]);
  assert.equal(data.call.privateKey, undefined);
  const payload = JSON.parse(m.calls.find((c) => c.url.endsWith("/call/web")).init.body);
  assert.equal(payload.assistantId, "verification-assistant");
  assert.equal(payload.assistantOverrides.variableValues.project_name, "Weather app");
  assert.equal(payload.assistantOverrides.model, undefined);
  const binding = m.calls.find((c) => c.url.endsWith("/bind_project_voice_call"));
  assert.deepEqual(JSON.parse(binding.init.body), { p_id: attemptId, p_call_id: callId });
  assert.equal(binding.init.headers.Authorization, "Bearer test-service");
});
test("non-GPT assistants and failed bindings never provide a browser join URL", async () => {
  for (const options of [{ provider: "other" }, { bound: false }]) {
    const m = mock(options);
    const response = await createVapiHandlers({ env, fetch: m.fetch }).session(
      req({ purpose: "verification", verificationId: attemptId }),
    );
    assert.notEqual(response.status, 200);
    assert.equal((await response.json()).call, undefined);
  }
});
test("webhook requires the credential and derives the attempt from the trusted call ID", async () => {
  const m = mock();
  const h = createVapiHandlers({ env, fetch: m.fetch });
  const body = {
    message: {
      type: "tool-calls",
      call: { id: callId, assistantId: "verification-assistant" },
      toolCallList: [
        {
          id: "tool-1",
          function: {
            name: "record_shipment_confirmation",
            arguments: { decision: "approved", verificationId: "attacker" },
          },
        },
      ],
    },
  };
  assert.equal((await h.webhook(req(body, "wrong"))).status, 401);
  assert.equal(m.calls.length, 0);
  const response = await h.webhook(req(body, "test-webhook"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].toolCallId, "tool-1");
  assert.deepEqual(JSON.parse(m.calls[0].init.body), { p_call_id: callId, p_decision: "approved" });
});
test("unrecognized tools do not authorize and call end only cancels pending attempts", async () => {
  const m = mock();
  const h = createVapiHandlers({ env, fetch: m.fetch });
  const call = { id: callId, assistantId: "verification-assistant" };
  const response = await h.webhook(
    req(
      {
        message: {
          type: "tool-calls",
          call,
          toolCallList: [
            {
              id: "bad",
              function: { name: "publish_everything", arguments: { decision: "approved" } },
            },
          ],
        },
      },
      "test-webhook",
    ),
  );
  assert.ok((await response.json()).results[0].error);
  assert.equal(m.calls.length, 0);
  await h.webhook(req({ message: { type: "end-of-call-report", call } }, "test-webhook"));
  assert.equal(JSON.parse(m.calls[0].init.body).p_decision, "cancelled");
});

function voiceHarness(getUserMedia, getSession) {
  const timers = new Map();
  const cleanups = [];
  const states = [];
  const instances = [];
  let networkCalls = 0;
  class SDK {
    listeners = new Map();
    stopped = 0;
    constructor() {
      instances.push(this);
    }
    on(name, callback) {
      this.listeners.set(name, callback);
    }
    removeAllListeners() {
      this.listeners.clear();
    }
    emit(name, value) {
      this.listeners.get(name)?.(value);
    }
    async reconnect() {
      this.emit("call-start");
    }
    async stop() {
      this.stopped++;
    }
    send() {}
    setMuted() {}
  }
  const hookSource = fs
    .readFileSync("src/features/zeroAI/useVapiVoice.ts", "utf8")
    .replace(/^import .*;$/gm, "")
    .replace("export function useVapiVoice", "function useVapiVoice")
    .replace('await import("@vapi-ai/web")', "await loadSDK()");
  const hookJS = ts.transpileModule(hookSource + "\nglobalThis.voice=useVapiVoice();", {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const context = vm.createContext({
    useRef: (current) => ({ current }),
    useState: (initial) => {
      const index = states.push(initial) - 1;
      return [
        initial,
        (next) => {
          states[index] = typeof next === "function" ? next(states[index]) : next;
        },
      ];
    },
    useEffect: (effect) => cleanups.push(effect()),
    navigator: { mediaDevices: { getUserMedia } },
    AbortController,
    Response,
    Error,
    setTimeout: (callback) => {
      const id = timers.size + 1;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    getCachedSession:
      getSession || (async () => ({ data: { session: { access_token: "test-user" } } })),
    fetch: async () => {
      networkCalls++;
      return Response.json({
        publicKey: "test-public",
        call: { id: callId, webCallUrl: "https://vapi.daily.co/test" },
        maxDurationSeconds: 120,
      });
    },
    loadSDK: async () => ({ default: SDK }),
  });
  vm.runInContext(hookJS.replace(/export \{\};?/, ""), context);
  return {
    voice: context.voice,
    states,
    instances,
    timers,
    networkCalls: () => networkCalls,
    cleanup: () => cleanups.forEach((fn) => fn?.()),
  };
}
test("Vapi asks for the microphone only on start and releases all resources on exit", async () => {
  let requested = 0,
    stopped = 0;
  const track = {
    enabled: true,
    stop() {
      stopped++;
    },
  };
  const harness = voiceHarness(async () => {
    requested++;
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  });
  assert.equal(requested, 0);
  assert.equal(harness.networkCalls(), 0);
  await harness.voice.start({ purpose: "verification", verificationId: attemptId });
  assert.equal(requested, 1);
  assert.equal(harness.states[0], "connected");
  const sdk = harness.instances[0];
  sdk.emit("local-volume-level", 0.7);
  sdk.emit("volume-level", 0.3);
  sdk.emit("speech-start");
  assert.equal(harness.states[3], true);
  assert.equal(harness.states[4], 0.7);
  assert.equal(harness.states[5], 0.3);
  harness.cleanup();
  assert.equal(stopped, 1);
  assert.equal(sdk.stopped, 1);
  assert.equal(sdk.listeners.size, 0);
  assert.equal(harness.timers.size, 0);
});
test("Vapi cancellation during microphone permission never creates or joins a call", async () => {
  let grant,
    stopped = 0;
  const harness = voiceHarness(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  const starting = harness.voice.start();
  harness.voice.stop();
  grant({
    getTracks: () => [
      {
        stop() {
          stopped++;
        },
      },
    ],
  });
  await starting;
  assert.equal(stopped, 1);
  assert.equal(harness.networkCalls(), 0);
  assert.equal(harness.instances.length, 0);
});
test("slow authentication times out and releases the microphone before any call is created", async () => {
  let finishAuth,
    stopped = 0;
  const track = {
    enabled: true,
    stop() {
      stopped++;
    },
  };
  const harness = voiceHarness(
    async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }),
    () =>
      new Promise((resolve) => {
        finishAuth = resolve;
      }),
  );
  const starting = harness.voice.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.timers.size, 1);
  [...harness.timers.values()][0]();
  finishAuth({ data: { session: { access_token: "test-user" } } });
  await starting;
  assert.equal(stopped, 1);
  assert.equal(harness.networkCalls(), 0);
  assert.equal(harness.states[0], "idle");
});

test("Vapi microphone denial keeps the project available for text confirmation", async () => {
  const harness = voiceHarness(async () => {
    const error = new Error("Denied");
    error.name = "NotAllowedError";
    throw error;
  });
  await harness.voice.start();
  assert.equal(harness.states[0], "idle");
  assert.match(harness.states[1], /use text/i);
  assert.equal(harness.networkCalls(), 0);
});

test("PostgreSQL enforces immutable, private and single-use project confirmations", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create table profiles(id uuid primary key);
      create table bootcamps(id uuid primary key);
      create table clubs(id uuid primary key,bootcamp_id uuid references bootcamps(id));
      create table enrollments(profile_id uuid,bootcamp_id uuid);
      create table club_members(profile_id uuid,club_id uuid);
      create table posts(id uuid primary key default gen_random_uuid(),author_id uuid references profiles(id) not null,content text not null,media_urls text[] default '{}',is_build_post boolean default false,project_root_id uuid references posts(id),version_label text default '1.0.0',release_notes text,available_for_use boolean default false,license_type text default 'standard',license_price numeric default 0,bootcamp_id uuid references bootcamps(id),audience text default 'everyone',audience_club_id uuid references clubs(id),likes_count integer default 0);
      alter table posts enable row level security;
      create policy post_read on posts for select to authenticated using(true);
      create policy post_insert on posts for insert to authenticated with check(author_id=auth.uid());
      create policy post_update on posts for update to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());
      grant select,insert,update on posts to authenticated;
      insert into profiles values('${owner}'),('${other}');
    `);
    await db.exec(
      fs.readFileSync("supabase/migrations/20261006150000_project_voice_confirmation.sql", "utf8"),
    );
    const asUser = async (id = owner) => {
      await db.exec(
        `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
      );
    };
    const asService = async () => {
      await db.exec(
        "reset role; set role service_role; select set_config('request.jwt.claim.sub','',false);",
      );
    };
    const asAdmin = async () => {
      await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
    };
    const payload = {
      content: "**Project:** Weather app\n\nA weather dashboard.",
      media_urls: [],
      version_label: "1.0.0",
      license_type: "standard",
      license_price: 0,
      available_for_use: false,
      audience: "everyone",
    };
    const prepare = async (target = null) => {
      const r = await db.query("select prepare_project_publication($1::jsonb,$2::uuid) as v", [
        JSON.stringify(payload),
        target,
      ]);
      return r.rows[0].v;
    };
    const rpc = async (name, args, casts) =>
      db.query(
        `select ${name}(${args.map((_, i) => `$${i + 1}::${casts[i]}`).join(",")}) as v`,
        args,
      );
    await asUser();
    let first;
    await t.test("direct project inserts and pending RPC publication are blocked", async () => {
      await assert.rejects(
        db.query(
          "insert into posts(author_id,content,is_build_post) values($1,'skip confirmation',true)",
          [owner],
        ),
        /Confirm this exact project/,
      );
      first = await prepare();
      await assert.rejects(
        rpc("publish_confirmed_project", [first.id], ["uuid"]),
        /not been authorized/,
      );
    });
    await t.test(
      "foreign users cannot read, approve, cancel or publish another attempt",
      async () => {
        await asUser(other);
        assert.equal(
          (await db.query("select id from project_publish_verifications")).rows.length,
          0,
        );
        await assert.rejects(
          rpc(
            "confirm_project_publication_text",
            [first.id, "PUBLISH Weather app"],
            ["uuid", "text"],
          ),
        );
        await assert.rejects(rpc("publish_confirmed_project", [first.id], ["uuid"]));
        await rpc("cancel_project_publication", [first.id], ["uuid"]);
        await assert.rejects(
          db.query("update project_publish_verifications set status='approved'"),
          /permission denied/,
        );
        await assert.rejects(
          rpc("record_project_voice_decision", [callId, "approved"], ["uuid", "text"]),
          /permission denied/,
        );
        await asUser();
        assert.equal(
          (
            await db.query("select status from project_publish_verifications where id=$1", [
              first.id,
            ])
          ).rows[0].status,
          "pending",
        );
      },
    );
    let published;
    await t.test(
      "exact text confirmation publishes once and retries return the original project",
      async () => {
        await assert.rejects(
          rpc("confirm_project_publication_text", [first.id, "yes"], ["uuid", "text"]),
          /exact confirmation/,
        );
        await rpc(
          "confirm_project_publication_text",
          [first.id, "PUBLISH Weather app"],
          ["uuid", "text"],
        );
        published = (await rpc("publish_confirmed_project", [first.id], ["uuid"])).rows[0].v.id;
        assert.ok(published);
        assert.equal(
          (await rpc("publish_confirmed_project", [first.id], ["uuid"])).rows[0].v.id,
          published,
        );
        assert.equal((await db.query("select count(*) as n from posts")).rows[0].n, 1);
        await assert.rejects(
          db.query("update posts set content='changed after approval' where id=$1", [published]),
          /Confirm this exact project/,
        );
        await db.query("update posts set likes_count=1 where id=$1", [published]);
      },
    );
    await t.test("one approval cannot publish different details or a second project", async () => {
      const v = await prepare();
      await rpc(
        "confirm_project_publication_text",
        [v.id, "PUBLISH Weather app"],
        ["uuid", "text"],
      );
      await assert.rejects(
        db.query(
          "insert into posts(author_id,content,is_build_post,shipment_verification_id) values($1,'different details',true,$2)",
          [owner, v.id],
        ),
        /Confirm this exact project/,
      );
      await rpc("publish_confirmed_project", [v.id], ["uuid"]);
      await assert.rejects(
        db.query(
          "insert into posts(author_id,content,is_build_post,shipment_verification_id) values($1,$2,true,$3)",
          [owner, payload.content, v.id],
        ),
        /Confirm this exact project/,
      );
    });
    await t.test("cancelled and expired attempts cannot be approved or published", async () => {
      const v = await prepare();
      await rpc("cancel_project_publication", [v.id], ["uuid"]);
      await assert.rejects(
        rpc("confirm_project_publication_text", [v.id, "PUBLISH Weather app"], ["uuid", "text"]),
      );
      const exp = await prepare();
      await asAdmin();
      await db.query(
        "update project_publish_verifications set expires_at=now()-interval '1 minute' where id=$1",
        [exp.id],
      );
      await asUser();
      await assert.rejects(
        rpc("confirm_project_publication_text", [exp.id, "PUBLISH Weather app"], ["uuid", "text"]),
      );
      await assert.rejects(rpc("publish_confirmed_project", [exp.id], ["uuid"]));
    });
    await t.test(
      "voice decisions are single-use and late end/approval events cannot reverse them",
      async () => {
        const v = await prepare();
        await rpc("reserve_project_voice_confirmation", [v.id], ["uuid"]);
        await assert.rejects(rpc("reserve_project_voice_confirmation", [v.id], ["uuid"]));
        await assert.rejects(
          rpc("confirm_project_publication_text", [v.id, "PUBLISH Weather app"], ["uuid", "text"]),
        );
        await asService();
        await rpc("bind_project_voice_call", [v.id, callId], ["uuid", "uuid"]);
        assert.equal(
          (await rpc("record_project_voice_decision", [callId, "denied"], ["uuid", "text"])).rows[0]
            .v,
          "denied",
        );
        assert.equal(
          (await rpc("record_project_voice_decision", [callId, "approved"], ["uuid", "text"]))
            .rows[0].v,
          "denied",
        );
        await asUser();
        await assert.rejects(rpc("publish_confirmed_project", [v.id], ["uuid"]));
        const next = await prepare();
        await rpc("reserve_project_voice_confirmation", [next.id], ["uuid"]);
        const nextCall = "00000000-0000-0000-0000-000000000005";
        await asService();
        await rpc("bind_project_voice_call", [next.id, nextCall], ["uuid", "uuid"]);
        await rpc("record_project_voice_decision", [nextCall, "approved"], ["uuid", "text"]);
        assert.equal(
          (await rpc("record_project_voice_decision", [nextCall, "cancelled"], ["uuid", "text"]))
            .rows[0].v,
          "approved",
        );
        await asUser();
        assert.ok((await rpc("publish_confirmed_project", [next.id], ["uuid"])).rows[0].v.id);
      },
    );
    await t.test("foreign project edits and versions are denied", async () => {
      await asUser(other);
      await assert.rejects(prepare(published), /own project/);
      await assert.rejects(
        db.query("select prepare_project_publication($1::jsonb,null)", [
          JSON.stringify({ ...payload, project_root_id: published }),
        ]),
        /own project/,
      );
      await asUser();
    });
    await t.test(
      "own project edits require a fresh snapshot and detect concurrent changes",
      async () => {
        const v = await prepare(published);
        await rpc(
          "confirm_project_publication_text",
          [v.id, "PUBLISH Weather app"],
          ["uuid", "text"],
        );
        assert.equal(
          (await rpc("publish_confirmed_project", [v.id], ["uuid"])).rows[0].v.id,
          published,
        );
        const stale = await prepare(published);
        await rpc(
          "confirm_project_publication_text",
          [stale.id, "PUBLISH Weather app"],
          ["uuid", "text"],
        );
        await db.query("update posts set likes_count=likes_count+1 where id=$1", [published]);
        // Social counters do not invalidate consent. A concurrent content edit does.
        const changed = (
          await db.query("select prepare_project_publication($1::jsonb,$2::uuid) as v", [
            JSON.stringify({ ...payload, content: payload.content + "\nUpdated work." }),
            published,
          ])
        ).rows[0].v;
        await rpc(
          "confirm_project_publication_text",
          [changed.id, "PUBLISH Weather app"],
          ["uuid", "text"],
        );
        await rpc("publish_confirmed_project", [changed.id], ["uuid"]);
        await assert.rejects(
          rpc("publish_confirmed_project", [stale.id], ["uuid"]),
          /Project changed/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
