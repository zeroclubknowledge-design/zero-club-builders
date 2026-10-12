import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("membership gifts enforce server authorization, expiry, and real premium activation", async t => {
  const db = new PGlite();
  const admin = "00000000-0000-0000-0000-000000000001";
  const learner = "00000000-0000-0000-0000-000000000002";
  const other = "00000000-0000-0000-0000-000000000003";
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table profiles(id uuid primary key, username text, account_type text default 'Learner', account_status text default 'active', tutor_enabled boolean default false, is_admin boolean default false, tier text default 'Basic', coins integer default 100);
    create function is_zero_club_admin() returns boolean language sql stable security definer as $$select coalesce((select is_admin from profiles where id=auth.uid()),false)$$;
    create table subscription_plans(key text primary key, name text, active boolean default true, audience text, price_amount numeric, billing_interval text default 'month', currency text default 'NGN');
    create table subscriptions(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles, plan_key text references subscription_plans, status text default 'active', current_period_start timestamptz, current_period_end timestamptz, renewal_date timestamptz, grace_period_end timestamptz, auto_renew boolean default false, amount_paid numeric default 0, currency text, metadata jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
    create unique index subscriptions_one_current_idx on subscriptions(profile_id) where status in ('active','past_due','grace_period');
    create table notifications(id uuid default gen_random_uuid(), recipient_id uuid references profiles, actor_id uuid references profiles, type text, entity_id uuid, content text);
    create table admin_audit_logs(admin_id uuid, action text, target_type text, target_id uuid, details jsonb);
    create function refresh_owned_club_continuity(uuid) returns void language sql as $$select$$;
    insert into profiles(id,username,is_admin) values ('${admin}','admin',true),('${learner}','alice',false),('${other}','bob',false);
    insert into subscription_plans(key,name,audience,price_amount) values ('learner_premium','Learner Premium','learner',3000),('creator','Creator','creator',7000),('tutor_premium','Tutor Premium','tutor',5000),('tutor_premium_plus','Tutor Premium+','tutor',12000),('institution_small','Institution Small','institution',150000);
  `);
  await db.exec(await fs.readFile(new URL("../supabase/migrations/20261012170000_admin_membership_gifts.sql", import.meta.url), "utf8"));
  // Exercise the actual plan resolver used by backend feature gates.
  const modes = await fs.readFile(new URL("../supabase/migrations/20260927090000_modes_and_onboarding.sql", import.meta.url), "utf8");
  await db.exec(modes.slice(modes.indexOf("create or replace function public.zero_club_plan_key")));
  const user = async id => { await db.exec(`reset role; select set_config('test.uid','${id}',false); set role authenticated;`); };
  const rpc = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
  const gift = async (name = "alice", plan = "learner_premium", days = 30) => {
    await user(admin);
    return rpc("select admin_gift_membership($1,$2,$3,now()+interval '7 days') as result", [name, plan, days]);
  };
  const claim = id => rpc("select claim_membership_gift($1) as result", [id]);
  try {
    await t.test("only platform admins may send; validates username, plan, and dates", async () => {
      await user(other);
      await assert.rejects(rpc("select admin_gift_membership('alice','learner_premium',30,now()+interval '7 days') as result"), /Only Zero Club admins/);
      await assert.rejects(gift("missing"), /No user/);
      await assert.rejects(gift("alice", "learner_premium", 0), /length/);
      await assert.rejects(gift("alice", "institution_small"), /does not match/);
      await assert.rejects(rpc("select admin_gift_membership('alice','learner_premium',30,now()) as result"), /future/);
    });
    const first = await gift(" @ALICE ");
    await t.test("gifts are visible only to recipient or admin; clients cannot forge updates", async () => {
      await user(other);
      assert.equal((await db.query("select * from membership_gifts")).rows.length, 0);
      await assert.rejects(claim(first.id), /not found/);
      await user(learner);
      assert.equal((await db.query("select * from membership_gifts")).rows.length, 1);
      await assert.rejects(db.query("update membership_gifts set status='claimed'"), /permission denied/);
    });
    await t.test("claim creates subscription, unlocks premium gates, and never debits wallet", async () => {
      const result = await claim(first.id);
      assert.equal(result.status, "claimed");
      assert.equal(result.subscription.plan_key, "learner_premium");
      assert.equal(result.subscription.auto_renew, false);
      assert.equal(Number(result.subscription.amount_paid), 0);
      assert.equal(await rpc("select zero_club_plan_key(auth.uid()) as result"), "learner_premium");
      await db.exec("reset role");
      const profile = (await db.query("select tier,coins from profiles where id=$1", [learner])).rows[0];
      assert.equal(profile.tier, "Premium"); assert.equal(profile.coins, 100);
      assert.equal((await db.query("select count(*)::int n from notifications where membership_gift_id=$1", [first.id])).rows[0].n, 1);
      await user(learner);
      assert.equal((await claim(first.id)).status, "already_claimed");
    });
    await t.test("same plan extends duration exactly once; different active plan is protected", async () => {
      const second = await gift(); await user(learner);
      const result = await claim(second.id);
      assert.equal(new Date(result.subscription.current_period_end) - new Date((await db.query("select claimed_at from membership_gifts where id=$1", [first.id])).rows[0].claimed_at), 60 * 86400000);
      const end = result.subscription.current_period_end;
      await claim(second.id);
      await db.exec("reset role");
      assert.equal(new Date((await db.query("select current_period_end from subscriptions where profile_id=$1", [learner])).rows[0].current_period_end).getTime(), new Date(end).getTime());
      const upgrade = await gift("alice", "creator"); await user(learner);
      await assert.rejects(claim(upgrade.id), /different active plan/);
      assert.equal((await db.query("select status from membership_gifts where id=$1", [upgrade.id])).rows[0].status, "pending");
    });
    await t.test("expired gifts cannot activate benefits even when client displays a claim button", async () => {
      const expired = await gift("bob");
      await db.exec("reset role");
      await db.query("update membership_gifts set claim_deadline=now()-interval '1 second' where id=$1", [expired.id]);
      await user(other);
      assert.equal((await claim(expired.id)).status, "expired");
      assert.equal((await db.query("select status from membership_gifts where id=$1", [expired.id])).rows[0].status, "expired");
      assert.equal(await rpc("select zero_club_plan_key(auth.uid()) as result"), "learner_basic");
    });
    await t.test("gifts remain addressed to the user after a username change; tutor plans unlock tutor gates", async () => {
      await db.exec("reset role");
      await db.query("update profiles set account_type='Tutor',tutor_enabled=true where id=$1", [other]);
      const tutorGift = await gift("bob", "tutor_premium_plus");
      await db.exec("reset role"); await db.query("update profiles set username='newbob' where id=$1", [other]);
      await user(other); assert.equal((await claim(tutorGift.id)).status, "claimed");
      assert.equal(await rpc("select zero_club_plan_key(auth.uid()) as result"), "tutor_premium_plus");
    });
  } finally { await db.close(); }
});
