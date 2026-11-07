import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("ordinary bootcamp-tagged posts publish while real project writes still require confirmation", async () => {
  const db=new PGlite();
  const author="00000000-0000-0000-0000-000000000001", bootcamp="00000000-0000-0000-0000-000000000002";
  const legacy="00000000-0000-0000-0000-000000000003";
  try {
    await db.exec(`create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${author}'::uuid$$;
      create table posts(id uuid primary key,author_id uuid,content text,is_build_post boolean,bootcamp_id uuid,shipment_verification_id uuid,audience text,audience_club_id uuid);
      create table project_publish_verifications(id uuid primary key,profile_id uuid,status text,expires_at timestamptz,payload jsonb,target_id uuid,target_revision text);
      create function project_publish_snapshot(p posts) returns jsonb language sql as $$select jsonb_build_object('content',p.content)$$;
      create table enrollments(bootcamp_id uuid,profile_id uuid);
      create table club_members(club_id uuid,profile_id uuid);
      create table clubs(id uuid,bootcamp_id uuid);
      insert into posts(id,author_id,content,is_build_post) values('${legacy}','${author}','Existing project',true);`);
    const migration=fs.readFileSync('supabase/migrations/20261006150000_project_voice_confirmation.sql','utf8');
    const start=migration.indexOf('create function public.guard_confirmed_project_write()');
    const end=migration.indexOf('-- Store the resulting project',start);
    await db.exec(migration.slice(start,end));
    const id="00000000-0000-0000-0000-000000000004";
    await db.query("insert into posts(id,author_id,content,is_build_post,bootcamp_id) values($1,$2,'Join this bootcamp',false,$3)",[id,author,bootcamp]);
    const saved=(await db.query('select bootcamp_id,is_build_post from posts where id=$1',[id])).rows[0];
    assert.equal(saved.bootcamp_id,bootcamp); assert.equal(saved.is_build_post,false);
    await assert.rejects(db.query("insert into posts(id,author_id,content,is_build_post,bootcamp_id) values('00000000-0000-0000-0000-000000000005',$1,'A project',true,$2)",[author,bootcamp]),/Confirm this exact project/);
    await assert.rejects(db.query('update posts set is_build_post=false where id=$1',[legacy]),/cannot be bypassed/);
    await db.query('update posts set bootcamp_id=null where id=$1',[id]);
    assert.equal((await db.query('select bootcamp_id from posts where id=$1',[id])).rows[0].bootcamp_id,null);
  } finally { await db.close(); }
});
