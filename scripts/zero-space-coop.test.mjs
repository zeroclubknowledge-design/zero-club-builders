import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("two pilots share a score and one can continue after the other finishes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.pilot',true),'')::uuid$$;
      create table profiles(id uuid primary key, username text, full_name text);
      insert into profiles select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'pilot' || n, null
      from generate_series(1,3) n;`);
    const migration = fs.readFileSync(new URL("../supabase/migrations/20261104120000_zero_space_coop.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(fs.readFileSync(new URL("../supabase/migrations/20261104130000_zero_space_reserves.sql", import.meta.url), "utf8"));
    const pilot = n => db.query("select set_config('test.pilot',$1,false)", [`00000000-0000-0000-0000-00000000000${n}`]);
    const action = async (kind, code = null, score = 0, finished = false) =>
      (await db.query("select zero_space_team($1,$2,$3,0.5,0.4,0.5,$4) as room", [kind, code, score, finished])).rows[0].room;
    await pilot(1);
    const lobby = await action("create");
    assert.equal(lobby.status, "waiting");
    await pilot(2);
    assert.equal((await action("join", lobby.code)).status, "playing");
    await pilot(3);
    await assert.rejects(action("join", lobby.code), /two pilots/);
    await assert.rejects(action("sync", lobby.code), /Join the room first/);
    await pilot(1);
    const supplied = await action("reserve", lobby.code);
    assert.equal(supplied.pilots[0].reserveSent, true);
    assert.equal(supplied.pilots[1].reserveReceived, true);
    await assert.rejects(action("reserve", lobby.code), /unavailable/);
    assert.equal((await action("sync", lobby.code, 80, true)).status, "playing");
    assert.equal((await action("sync", lobby.code, 900)).score, 80);
    await pilot(2);
    assert.equal((await action("sync", lobby.code, 20)).score, 100);
    const result = await action("sync", lobby.code, 120, true);
    assert.equal(result.status, "finished");
    assert.equal(result.score, 200);
    assert.equal((await action("sync", lobby.code, 0)).score, 200);
  } finally {
    await db.close();
  }
});
