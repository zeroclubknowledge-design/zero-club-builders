import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("club AI storage enforces member-only reads, server-only writes and per-member quota", async () => {
  const db=new PGlite();
  const owner="00000000-0000-0000-0000-000000000001", member="00000000-0000-0000-0000-000000000002", outsider="00000000-0000-0000-0000-000000000003";
  const club="00000000-0000-0000-0000-000000000010", message="00000000-0000-0000-0000-000000000020";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table profiles(id uuid primary key);
      create table clubs(id uuid primary key,creator_id uuid);
      create table club_members(club_id uuid,profile_id uuid);
      create table club_messages(id uuid primary key);
      grant select on clubs,club_members to authenticated;
      insert into profiles values('${owner}'),('${member}'),('${outsider}');
      insert into clubs values('${club}','${owner}');
      insert into club_members values('${club}','${member}');
      insert into club_messages values('${message}');`);
    const sql=fs.readFileSync("supabase/migrations/20261105140000_club_zero_ai_replies.sql","utf8");
    await db.exec(sql); await db.exec(sql);
    const user=id=>db.query("select set_config('test.user',$1,false)",[id]);
    const claim=async()=> (await db.query("select claim_club_zero_ai_request($1) as ok",[club])).rows[0].ok;
    await assert.rejects(claim(),/Not authenticated/);
    await user(outsider); await assert.rejects(claim(),/ZERO_AI_CLUB_MEMBERS_ONLY/);
    await user(member);
    for(let i=0;i<30;i++) assert.equal(await claim(),true);
    assert.equal(await claim(),false);
    await user(owner); assert.equal(await claim(),true);
    await db.query("insert into club_ai_replies(message_id,club_id,content) values($1,$2,'Answer')",[message,club]);
    await db.exec("set role authenticated");
    for(const id of [owner,member,outsider]) {
      await user(id);
      assert.equal((await db.query("select * from club_ai_replies")).rows.length,id===outsider?0:1);
    }
    await assert.rejects(db.query("update club_ai_replies set content='Fake bot'"),/permission denied/);
    await assert.rejects(db.query("delete from club_ai_replies"),/permission denied/);
    assert.equal((await db.query("select has_table_privilege('authenticated','club_ai_replies','insert') as allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('anon','claim_club_zero_ai_request(uuid)','execute') as allowed")).rows[0].allowed,false);
    await db.exec("reset role; delete from club_messages;");
    assert.equal((await db.query("select * from club_ai_replies")).rows.length,0);
  } finally { await db.close(); }
});
