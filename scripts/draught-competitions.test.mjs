import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const read = (p) => fs.readFileSync(p, "utf8");
test("Draught competitions seed even brackets, use authoritative winners and settle escrow once", async (t) => {
  const db = new PGlite();
  let request = 0;
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   create table profiles(id uuid primary key,username text,full_name text,avatar_url text,account_status text default 'active',coins numeric default 1000);
   create table notifications(id uuid default gen_random_uuid(),recipient_id uuid,actor_id uuid,type text,content text,entity_id uuid);
   create table wallet_transactions(profile_id uuid,direction text,amount numeric,balance_after numeric,source text,description text,reference text unique,metadata jsonb,created_at timestamptz default now());
   create table platform_revenue(source text,buyer_id uuid,gross_amount numeric,fee_amount numeric,payment_reference text unique);
   create table zero_game_wallet_transactions(id uuid primary key default gen_random_uuid(),profile_id uuid,competition_id uuid,amount bigint,direction text,kind text,created_at timestamptz default now());
   insert into profiles(id,username) select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'Player '||i from generate_series(1,130)i;
   insert into profiles(id,username) values('${id(900)}','Host');`);
    const wallet = read("supabase/migrations/20260806120000_wallet_reliability.sql");
    const begin = wallet.indexOf("create or replace function public.wallet_apply(");
    await db.exec(
      wallet.slice(begin, wallet.indexOf("revoke all on function public.wallet_apply", begin)),
    );
    await db.exec(read("supabase/migrations/20261019170000_zero_draught.sql"));
    const migration = read("supabase/migrations/20261107140000_draught_competitions.sql");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(read("supabase/migrations/20260813140000_withdrawable_balance.sql"));
    await db.exec(
      "create or replace function earning_wallet_sources() returns text[] language sql immutable as $$select array['referral','gig_payment']::text[]$$",
    );
    const withdrawal = read("supabase/migrations/20261107150000_withdrawable_game_winnings.sql");
    await db.exec(withdrawal);
    await db.exec(withdrawal);
    const as = (who) => db.query("select set_config('test.uid',$1,false)", [who ? id(who) : ""]);
    const rpc = async (who, action, competition = null, payload = {}) => {
      await as(who);
      return (
        await db.query("select zero_draught_competition($1,$2,$3) result", [
          action,
          competition,
          JSON.stringify(payload),
        ])
      ).rows[0].result;
    };
    const create = async (capacity, fee = 0, pool = 0) =>
      rpc(900, "create", null, {
        title: "Test " + capacity,
        capacity,
        entry_fee: fee,
        host_pool: pool,
        request_id: id(1000 + ++request),
      });
    const resign = async (room) => {
      const r = (await db.query("select * from zero_draught_rooms where id=$1", [room])).rows[0];
      await as(Number(r.black_id.slice(-12)));
      await db.query("select zero_draught_action($1,'resign','{}',$2)", [
        room,
        id(2000 + ++request),
      ]);
    };
    const playAll = async (competition) => {
      for (let i = 0; i < 20; i++) {
        const snapshot = await rpc(1, "detail", competition);
        if (snapshot.competition.status === "finished") return snapshot;
        for (const fixture of snapshot.fixtures.filter((f) => !f.winner && f.room_id))
          await resign(fixture.room_id);
      }
      throw Error("Bracket did not complete");
    };
    await t.test("odd/too-small limits and unauthenticated requests are rejected", async () => {
      await assert.rejects(create(5), /even number/);
      await assert.rejects(create(2), /even number/);
      await assert.rejects(rpc(null, "list"), /Sign in/);
    });
    await t.test(
      "six entrants get byes, three distinct podium winners and exactly funded prizes",
      async () => {
        const payload = {
          title: "Funded six",
          capacity: 6,
          entry_fee: 10,
          host_pool: 100,
          prize_splits: [60, 25, 15],
          request_id: id(1100),
        };
        const competition = (await rpc(900, "create", null, payload)).id;
        assert.equal((await rpc(900, "create", null, payload)).id, competition);
        assert.equal(
          Number(
            (await db.query("select coins from profiles where id=$1", [id(900)])).rows[0].coins,
          ),
          900,
        );
        await assert.rejects(rpc(900, "join", competition), /Hosts cannot/);
        for (let who = 1; who <= 6; who++) await rpc(who, "join", competition);
        const joined = await rpc(1, "join", competition);
        assert.equal(joined.players.length, 6);
        assert.equal(joined.competition.prize_pool, 160);
        assert.equal(joined.fixtures.filter((f) => !f.black_id).length, 2);
        const finished = await playAll(competition);
        assert.deepEqual(
          finished.awards.map((a) => a.place),
          [1, 2, 3],
        );
        assert.equal(new Set(finished.awards.map((a) => a.profile_id)).size, 3);
        assert.deepEqual(
          finished.awards.map((a) => a.amount),
          [86, 35, 21],
        );
        assert.equal(finished.competition.fee_amount, 18);
        assert.equal(Number(finished.competition.host_fee_share), 9);
        assert.equal(finished.competition.net_prize_pool, 142);
        assert.equal(
          Number(
            (
              await db.query("select fee_amount from platform_revenue where payment_reference=$1", [
                "dc_platform_" + competition,
              ])
            ).rows[0].fee_amount,
          ),
          9,
        );
        await as(900);
        assert.equal(
          Number(
            (await db.query("select get_withdrawable_balance() result")).rows[0].result
              .withdrawable,
          ),
          9,
        );
        const credits = (
          await db.query("select count(*) n from wallet_transactions where reference like $1", [
            "dc_prize_" + competition + "_%",
          ])
        ).rows[0].n;
        await rpc(1, "detail", competition);
        await db.exec("select tick_zero_draught_competitions()");
        assert.equal(
          (
            await db.query("select count(*) n from wallet_transactions where reference like $1", [
              "dc_prize_" + competition + "_%",
            ])
          ).rows[0].n,
          credits,
        );
        assert.equal(
          Number(
            (
              await db.query("select sum(coins) total from profiles where id=any($1)", [
                [id(900), ...Array.from({ length: 6 }, (_, i) => id(i + 1))],
              ])
            ).rows[0].total,
          ),
          6991,
        );
      },
    );
    await t.test("four, eight and ten players finish with a played bronze match", async () => {
      for (const n of [4, 8, 10]) {
        const competition = (await create(n)).id;
        for (let who = 1; who <= n; who++) await rpc(who, "join", competition);
        const done = await playAll(competition);
        assert.equal(done.awards.length, 3);
        assert.ok(done.fixtures.find((f) => f.kind === "bronze")?.winner);
      }
    });
    await t.test("cancellation and expired registration refund every reserved amount", async () => {
      for (const expire of [false, true]) {
        const competition = (await create(6, 20, 50)).id;
        const before = Number(
          (await db.query("select coins from profiles where id=$1", [id(20)])).rows[0].coins,
        );
        await rpc(20, "join", competition);
        await assert.rejects(rpc(20, "cancel", competition), /Only the host/);
        if (expire) {
          await db.query(
            "update zero_draught_competitions set registration_ends_at=now()-interval '1 hour' where id=$1",
            [competition],
          );
          await rpc(20, "detail", competition);
        } else await rpc(900, "cancel", competition);
        assert.equal(
          Number(
            (await db.query("select coins from profiles where id=$1", [id(20)])).rows[0].coins,
          ),
          before,
        );
        assert.equal((await rpc(20, "detail", competition)).competition.status, "cancelled");
      }
    });
    await t.test(
      "draws replay with swapped colours then use the disclosed draw-odds tiebreak",
      async () => {
        const competition = (await create(4)).id;
        for (let who = 30; who < 34; who++) await rpc(who, "join", competition);
        let fixture = (await rpc(30, "detail", competition)).fixtures[0];
        let previousRed = fixture.red_id;
        for (let attempt = 1; attempt <= 3; attempt++) {
          const room = (
            await db.query("select * from zero_draught_rooms where id=$1", [fixture.room_id])
          ).rows[0];
          await as(Number(room.red_id.slice(-12)));
          await db.query("select zero_draught_action($1,'offer_draw','{}',$2)", [
            room.id,
            id(3000 + ++request),
          ]);
          await as(Number(room.black_id.slice(-12)));
          await db.query("select zero_draught_action($1,'accept_draw','{}',$2)", [
            room.id,
            id(3000 + ++request),
          ]);
          fixture = (await rpc(30, "detail", competition)).fixtures.find(
            (f) => f.id === fixture.id,
          );
          if (attempt < 3) {
            assert.notEqual(fixture.red_id, previousRed);
            previousRed = fixture.red_id;
          } else assert.equal(fixture.winner, room.black_id);
        }
      },
    );
    await t.test(
      "insufficient funds roll back registration and timed-out matches advance without reported scores",
      async () => {
        const competition = (await create(4, 10, 0)).id;
        await db.query("update profiles set coins=0 where id=$1", [id(100)]);
        await assert.rejects(rpc(100, "join", competition), /Insufficient wallet/);
        assert.equal((await rpc(100, "detail", competition)).players.length, 0);
        for (let who = 101; who <= 104; who++) await rpc(who, "join", competition);
        let fixture = (await rpc(101, "detail", competition)).fixtures[0];
        await db.query(
          "update zero_draught_rooms set moved_at=clock_timestamp()-interval '20 minutes' where id=$1",
          [fixture.room_id],
        );
        const state = await rpc(101, "sync", competition);
        const result = state.fixtures.find((f) => f.id === fixture.id);
        assert.equal(result.winner, fixture.black_id);
        assert.equal(state.awards.length, 0);
      },
    );
    await t.test("fee thresholds and creator percentages cannot be spoofed or reused", async () => {
      for (const n of [98, 100, 102]) {
        const result = await create(n, 10, 0);
        const snapshot = await rpc(1, "detail", result.id);
        assert.equal(snapshot.competition.fee_percent, n < 100 ? 30 : 20);
      }
      for (const prize_splits of [
        [100, 0, 0],
        [40, 30, 20],
        [50, 30, 20, 1],
        [-1, 51, 50],
      ]) {
        await assert.rejects(
          rpc(900, "create", null, {
            title: "Bad split",
            capacity: 4,
            entry_fee: 10,
            host_pool: 0,
            request_id: id(9000 + ++request),
            prize_splits,
          }),
          /percentages/,
        );
      }
    });
    await t.test(
      "cash awards are withdrawable but refunds and converted points are not",
      async () => {
        await as(125);
        const start = Number(
          (await db.query("select coins from profiles where id=$1", [id(125)])).rows[0].coins,
        );
        await db.query("select wallet_apply($1,'credit',40,'game','Space prize',$2,'{}')", [
          id(125),
          "zt_prize_" + id(555) + "_1",
        ]);
        await db.query("select wallet_apply($1,'credit',30,'game','Refund',$2,'{}')", [
          id(125),
          "zt_refund_" + id(555),
        ]);
        await db.query("select wallet_apply($1,'credit',20,'zp','Converted points',$2,'{}')", [
          id(125),
          "zp_" + id(555),
        ]);
        assert.equal(
          Number(
            (await db.query("select get_withdrawable_balance() result")).rows[0].result
              .withdrawable,
          ),
          40,
        );
        await db.query("update profiles set coins=coins+25 where id=$1", [id(125)]);
        await db.query(
          "insert into zero_game_wallet_transactions(profile_id,competition_id,amount,direction,kind) values($1,$2,25,'credit','payout')",
          [id(125), id(556)],
        );
        assert.equal(
          Number(
            (await db.query("select coins from profiles where id=$1", [id(125)])).rows[0].coins,
          ),
          start + 115,
        );
        assert.equal(
          Number(
            (await db.query("select get_withdrawable_balance() result")).rows[0].result
              .withdrawable,
          ),
          65,
        );
        await db.exec(withdrawal);
        assert.equal(
          Number(
            (await db.query("select get_withdrawable_balance() result")).rows[0].result
              .withdrawable,
          ),
          65,
        );
        assert.ok(
          (await db.query("select earning_wallet_sources() sources")).rows[0].sources.includes(
            "gig_payment",
          ),
        );
      },
    );
    await t.test("clients cannot forge fixtures, payouts or call private advancement", async () => {
      await as(1);
      await db.exec("set role authenticated");
      await assert.rejects(
        db.exec("update zero_draught_fixtures set winner=red_id"),
        /permission denied/,
      );
      await assert.rejects(
        db.exec("delete from zero_draught_competition_awards"),
        /permission denied/,
      );
      await assert.rejects(db.query("select dc_progress($1)", [id(1)]), /permission denied/);
      await db.exec("reset role;set role anon");
      await assert.rejects(
        db.query("select zero_draught_competition('list')"),
        /permission denied/,
      );
      await db.exec("reset role");
    });
  } finally {
    await db.close();
  }
});
