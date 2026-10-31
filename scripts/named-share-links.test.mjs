import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('named links preserve destinations, remain stable, and disambiguate titles', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select '10000000-0000-0000-0000-000000000001'::uuid$$;
      create table profiles(id uuid primary key,username text);
      insert into profiles values('10000000-0000-0000-0000-000000000001','victor');
      create table posts(id uuid primary key,content text);
      insert into posts values('20000000-0000-0000-0000-000000000001','My first build');`);
    const migration = fs.readFileSync(new URL('../supabase/migrations/20261031200000_named_share_links.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const make = async (destination, title) => (await db.query('select create_named_share($1,$2) as path', [destination,title])).rows[0].path;
    const destination = '/app/post/20000000-0000-0000-0000-000000000001?ref=ABC&preview=5';
    const path = await make(destination, 'My first build');
    assert.equal(path, '/share/post/my-first-build/victor');
    assert.equal(await make(destination, 'Changed title'), path);
    assert.equal((await db.query('select resolve_named_share($1) as destination',[path])).rows[0].destination, destination);
    assert.equal(await make('/app/post/other', 'My first build'), '/share/post/my-first-build-2/victor');
    await db.exec("update profiles set username='newname'");
    assert.equal(await make(destination, 'Renamed'), path);
    for (const invalid of ['//evil.example', '/settings/security', '/app/post/id\\evil']) {
      await assert.rejects(make(invalid, 'bad'));
    }
    assert.equal((await db.query("select has_table_privilege('anon','named_share_links','select') as allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
