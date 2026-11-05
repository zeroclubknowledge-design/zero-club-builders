import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("usage repair preserves access policy, counters, admin access and daily caps", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table profiles(id uuid primary key);
      insert into profiles values('00000000-0000-0000-0000-000000000001');
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create function is_zero_club_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;
      create function can_use_zero_ai() returns boolean language sql as $$select coalesce(current_setting('test.access',true),'false')='true'$$;`);
    const sql = fs.readFileSync(new URL("../supabase/migrations/20261105120000_repair_zero_ai_usage.sql", import.meta.url), "utf8");
    await db.exec(sql);
    const setting = (key, value) => db.query("select set_config($1,$2,false)", [key, value]);
    const claim = async kind => (await db.query("select claim_zero_ai_request($1) as allowed", [kind])).rows[0].allowed;
    await assert.rejects(claim("chat"), /Not authenticated/);
    await setting("test.user", "00000000-0000-0000-0000-000000000001");
    await assert.rejects(claim("chat"), /ZERO_AI_MAX_REQUIRED/);
    await setting("test.access", "true");
    assert.equal(await claim("chat"), true);
    await db.exec(sql);
    for (let i = 1; i < 100; i++) assert.equal(await claim("chat"), true);
    assert.equal(await claim("chat"), false);
    for (let i = 0; i < 5; i++) assert.equal(await claim("voice"), true);
    assert.equal(await claim("verification"), false);
    await setting("test.admin", "true");
    assert.equal(await claim("chat"), true);
    await assert.rejects(claim("invalid"), /Invalid request type/);
    assert.equal((await db.query("select has_table_privilege('authenticated','zero_ai_daily_usage','update') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('anon','claim_zero_ai_request(text)','execute') as allowed")).rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
