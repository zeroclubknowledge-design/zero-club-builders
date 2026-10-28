import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration=fs.readFileSync(new URL('../supabase/migrations/20261028090000_gift_claim_reminders.sql',import.meta.url),'utf8');
const owner='10000000-0000-0000-0000-000000000001',person='20000000-0000-0000-0000-000000000002';
const base='2026-11-01T00:00:00Z';
test('three gift reminders are timely, private, retryable and tied to unused credit',async t=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table gift_cards(id uuid primary key default gen_random_uuid(),code text,parent_gift_id uuid,creator_id uuid,claimed_by uuid,
        claimed_at timestamptz,expires_at timestamptz,claim_deadline_at timestamptz,claim_released_at timestamptz,status text default 'claimed',remaining_amount numeric default 500);
      create table notifications(profile_id uuid,actor_id uuid,type text,content text);
      create schema cron;create table cron.jobs(name text primary key,schedule text,command text);
      create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin
        insert into cron.jobs values($1,$2,$3) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;`);
    await db.exec(migration);
    const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
    const sweep=time=>value('select send_zero_gift_claim_reminders($1) as value',[time]);
    const reset=async(expiry='2026-11-01T06:00:00Z')=>{
      await db.exec('truncate gift_cards cascade;truncate notifications;');
      const parent=crypto.randomUUID(),claim=crypto.randomUUID();
      await db.query('insert into gift_cards(id,code,creator_id,expires_at) values($1,$2,$3,$4)',[parent,'ZC-REMINDER',owner,expiry]);
      await db.query(`insert into gift_cards(id,code,parent_gift_id,creator_id,claimed_by,claimed_at,expires_at,claim_deadline_at)
        values($1,'PRIVATE-RECEIPT',$2,$3,$4,$5,$6,$6)`,[claim,parent,owner,person,base,expiry]);
      return claim;
    };
    const count=()=>value('select count(*)::int as value from notifications');
    await t.test('full window sends exactly three reminders at 3h, 1h and 15m remaining',async()=>{
      await reset();assert.equal(await sweep('2026-11-01T02:59:59Z'),0);
      assert.equal(await sweep('2026-11-01T03:00:00Z'),1);
      assert.equal(await sweep('2026-11-01T03:00:00Z'),0);
      assert.equal(await sweep('2026-11-01T05:00:00Z'),1);
      assert.equal(await sweep('2026-11-01T05:45:00Z'),1);
      assert.equal(await sweep('2026-11-01T05:59:00Z'),0);
      assert.equal(await sweep('2026-11-01T06:00:00Z'),0);
      assert.equal(await count(),3);
      const rows=(await db.query('select * from notifications')).rows;
      assert.ok(rows.every(row=>row.profile_id===person&&row.link==='/app/gifts/ZC-REMINDER'));
      assert.ok(rows[0].content.includes('3 hours'));assert.ok(rows[1].content.includes('1 hour'));assert.ok(rows[2].content.includes('15 minutes'));
    });
    await t.test('shorter general expiry compresses the three reminders inside the actual window',async()=>{
      await reset('2026-11-01T00:30:00Z');
      assert.equal(await sweep('2026-11-01T00:14:59Z'),0);
      assert.equal(await sweep('2026-11-01T00:15:00Z'),1);
      assert.equal(await sweep('2026-11-01T00:20:00Z'),1);
      assert.equal(await sweep('2026-11-01T00:22:30Z'),1);
      assert.equal(await count(),3);
    });
    await t.test('fully used, cancelled, released and expired claims do not receive reminders',async()=>{
      for(const patch of ["remaining_amount=0","status='cancelled'","claim_released_at=now()","expires_at='2026-11-01T02:00:00Z'"]){
        const claim=await reset();await db.query(`update gift_cards set ${patch} where id=$1`,[claim]);
        assert.equal(await sweep('2026-11-01T03:00:00Z'),0);assert.equal(await count(),0);
      }
      const claim=await reset();await sweep('2026-11-01T03:00:00Z');
      await db.query('update gift_cards set remaining_amount=0 where id=$1',[claim]);
      assert.equal(await sweep('2026-11-01T05:45:00Z'),0);assert.equal(await count(),1);
    });
    await t.test('partly spent credit still receives reminders, and catch-up never duplicates them',async()=>{
      const claim=await reset();await db.query('update gift_cards set remaining_amount=100 where id=$1',[claim]);
      assert.equal(await sweep('2026-11-01T05:50:00Z'),3);
      await db.exec(migration);assert.equal(await sweep('2026-11-01T05:51:00Z'),0);assert.equal(await count(),3);
      assert.equal(await value('select count(*)::int as value from cron.jobs'),1);
      assert.equal(await value("select schedule as value from cron.jobs where name='zero-gift-claim-reminders'"),'* * * * *');
    });
    await t.test('shortening a deadline reschedules pending reminders without repeating an earlier one',async()=>{
      const claim=await reset();await sweep('2026-11-01T03:00:00Z');
      await db.query("update gift_cards set expires_at='2026-11-01T03:30:00Z' where id=$1",[claim]);
      assert.equal(await sweep('2026-11-01T03:15:00Z'),2);assert.equal(await count(),3);
      assert.equal(await sweep('2026-11-01T03:30:00Z'),0);
    });
    await t.test('a failed notification rolls back its delivery mark and can be retried',async()=>{
      await reset();await db.exec("alter table notifications add constraint block_test_notifications check(content not like 'Gift reminder%')");
      await assert.rejects(sweep('2026-11-01T03:00:00Z'),/block_test_notifications/);
      assert.equal(await value('select count(*)::int as value from zero_gift_claim_reminders'),0);
      await db.exec('alter table notifications drop constraint block_test_notifications');
      assert.equal(await sweep('2026-11-01T03:00:00Z'),1);
    });
    await t.test('ordinary clients cannot read delivery records or spoof reminder time',async()=>{
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query('select * from zero_gift_claim_reminders'),/permission denied/);
        await assert.rejects(sweep('2026-11-01T05:45:00Z'),/permission denied/);
        await db.exec('reset role');
      }
      await reset();await db.exec('set role service_role');assert.equal(await sweep('2026-11-01T03:00:00Z'),1);await db.exec('reset role');
    });
  } finally {await db.close();}
});
