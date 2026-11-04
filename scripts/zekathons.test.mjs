import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("Zekathon team releases, feedback and judging retain the submitted version", async () => {
  const db = new PGlite();
  try {
    const profile = n => `00000000-0000-0000-0000-00000000000${n}`;
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create function public.is_zero_club_admin() returns boolean language sql as $$select auth.uid()='${profile(1)}'$$;
      create table profiles(id uuid primary key, username text);
      insert into profiles values ('${profile(1)}','organizer'),('${profile(2)}','owner'),('${profile(3)}','teammate'),('${profile(4)}','tester');`);
    await db.exec(fs.readFileSync(new URL("../supabase/migrations/20261104150000_zekathons.sql", import.meta.url), "utf8"));
    const user = n => db.query("select set_config('test.user',$1,false)", [profile(n)]);
    const act = async (kind, fields) => (await db.query("select zekathon_action($1,$2) as id", [kind, fields])).rows[0].id;
    const event = { title: "Campus sprint", description: "Build for students", deadline: "2099-01-01T00:00:00Z" };
    await user(2);
    await assert.rejects(act("event", event), /Only organizers/);
    await user(1);
    const event_id = await act("event", event);
    await user(2);
    const product_id = await act("product", { event_id, title: "Study rooms", description: "Book a room on campus" });
    await act("invite", { product_id, username: "@teammate", role: "Design" });
    const release = { product_id, version: "Beta", notes: "Booking is ready", demo_url: "https://example.org/demo" };
    await user(3);
    await assert.rejects(act("release", release), /Join the product team first/);
    await act("accept", { product_id });
    await act("release", release);
    const release_id = (await db.query("select id from zekathon_releases where product_id=$1", [product_id])).rows[0].id;
    await assert.rejects(act("submit", { product_id, release_id }), /Only the product owner/);
    await user(4);
    await act("feedback", { product_id, release_id, worked: "Booking works", friction: "Hard to find rooms" });
    await user(2);
    await act("submit", { product_id, release_id });
    await db.query("update zekathons set deadline=now()-interval '1 second' where id=$1", [event_id]);
    await assert.rejects(act("submit", { product_id, release_id }), /closed/);
    await act("release", { ...release, version: "Launch" });
    await user(1);
    await act("judge", { product_id, score: "90", review: "Useful and easy to test" });
    const submission = (await db.query("select release_id,score from zekathon_submissions where product_id=$1", [product_id])).rows[0];
    assert.deepEqual(submission, { release_id, score: 90 });
    assert.equal((await db.query("select has_table_privilege('anon','zekathon_releases','insert') as allowed")).rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
