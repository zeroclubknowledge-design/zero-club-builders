import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261019120000_zero_space_market.sql', import.meta.url), 'utf8');
const alice = '00000000-0000-0000-0000-000000000001';
const bob = '00000000-0000-0000-0000-000000000002';
const admin = '00000000-0000-0000-0000-000000000003';
const request = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const catalog = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/features/games/v2/spaceSupplies.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: catalog });

test('fuel enhancers last the run, reduce consumption and preserve level difficulty', () => {
  for (const multiplier of [1,2,3,5]) {
    assert.equal(catalog.spaceFuelDrain(8*multiplier,0,multiplier),8);
    assert.equal(catalog.spaceFuelDrain(1,100,multiplier),1.7/multiplier);
  }
});

test('Space marketplace enforces spending, inventory isolation and safe retries in PostgreSQL', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated, anon;
      create table public.profiles(id uuid primary key, zp integer, is_admin boolean default false, account_status text default 'active');
      insert into profiles(id,zp,is_admin) values ('${alice}',1000,false),('${bob}',0,false),('${admin}',0,true);`);
    await db.exec(migration);
    // Applying the same migration again must not break an existing installation.
    await db.exec(migration);
    const enhancerMigration = fs.readFileSync(new URL('../supabase/migrations/20261019160000_space_fuel_enhancers.sql', import.meta.url), 'utf8');
    await db.exec(enhancerMigration);
    await db.exec(enhancerMigration);
    const as = async id => { await db.query("select set_config('test.uid',$1,false)", [id || '']); };
    const market = async () => (await db.query('select zero_space_market() as result')).rows[0].result;
    const transact = async (item, action, id) => (await db.query('select zero_space_supply($1,$2,$3) as result', [item, action, request(id)])).rows[0].result;

    await t.test('catalog prices deduct real ZP and persist stock', async () => {
      await as(alice);
      for (const [index, item] of catalog.SPACE_SUPPLIES.entries()) {
        const before = (await market()).balance;
        const after = await transact(item.id, 'buy', index + 100);
        assert.equal(before - after.balance, item.price, `${item.name}: advertised price matches server charge`);
      }
      const state = await market();
      assert.equal(state.balance, 695);
      assert.deepEqual(state.inventory, { shield: 1, focus: 1, magnet: 1, fuel: 1, enhancer2: 1, enhancer3: 1, enhancer5: 1 });
      assert.equal(state.administrator, false);
    });
    await t.test('lost responses and simultaneous duplicate requests charge once', async () => {
      await Promise.all([transact('shield', 'buy', 5), transact('shield', 'buy', 5)]);
      await transact('shield', 'buy', 5);
      assert.equal((await market()).balance, 665);
      assert.equal((await market()).inventory.shield, 2);
      await assert.rejects(transact('fuel', 'buy', 5), /already used/);
      await assert.rejects(transact('shield', 'use', 5), /already used/);
    });
    await t.test('consumption is idempotent and cannot take inventory below zero', async () => {
      await transact('focus', 'use', 6);
      await transact('focus', 'use', 6);
      assert.equal((await market()).inventory.focus, 0);
      await assert.rejects(transact('focus', 'use', 7), /No supplies left/);
      assert.equal((await market()).balance, 665);
    });
    await t.test('invalid items and actions cannot mint supplies', async () => {
      for (const [item, action] of [['fake', 'buy'], ['shield', 'refund'], [null, 'buy'], ['shield', null]]) {
        await assert.rejects(transact(item, action, 8), /valid supply action/);
      }
      await assert.rejects(db.query("select zero_space_supply('shield','buy',null)"), /valid supply action/);
    });
    await t.test('insufficient funds leave stock and balance intact', async () => {
      await as(bob);
      await assert.rejects(transact('shield', 'buy', 9), /Not enough Zero Points/);
      assert.equal((await market()).inventory.shield, 0);
      assert.equal((await market()).balance, 0);
      await assert.rejects(transact('shield', 'use', 10), /No supplies left/);
    });
    await t.test('platform admins have complimentary supplies', async () => {
      await as(admin);
      const state = await transact('shield', 'buy', 11);
      assert.equal(state.balance, 0);
      assert.equal(state.inventory.shield, 1);
      assert.equal(state.administrator, true);
    });
    await t.test('unauthenticated and suspended accounts cannot spend', async () => {
      await as(null);
      await assert.rejects(market(), /Sign in/);
      await assert.rejects(transact('shield', 'buy', 12), /Sign in/);
      await as(bob);
      await db.exec(`update profiles set account_status='suspended', zp=100 where id='${bob}'`);
      await assert.rejects(transact('shield', 'buy', 12), /cannot use the marketplace/);
    });
    await t.test('RLS exposes only own stock and denies direct writes and anonymous RPCs', async () => {
      await as(alice);
      await db.exec('set role authenticated');
      const stock = await db.query('select * from zero_space_inventory');
      assert.ok(stock.rows.length > 0);
      assert.ok(stock.rows.every(row => row.profile_id === alice));
      // The authenticated API works without direct access to profile balances.
      await transact('fuel', 'buy', 13);
      await assert.rejects(db.exec('update zero_space_inventory set quantity=999'), /permission denied/);
      await assert.rejects(db.exec('delete from zero_space_supply_events'), /permission denied/);
      await db.exec('reset role; set role anon');
      await assert.rejects(market(), /permission denied/);
      await assert.rejects(transact('shield', 'buy', 14), /permission denied/);
      await db.exec('reset role');
    });
    await t.test('stock cap prevents accidental excess spending', async () => {
      await as(alice);
      await db.exec(`update zero_space_inventory set quantity=999 where profile_id='${alice}' and item='shield'`);
      const before = (await market()).balance;
      await assert.rejects(transact('shield', 'buy', 15), /maximum/);
      assert.equal((await market()).balance, before);
    });
  } finally { await db.close(); }
});
