const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres:OctobeR1997@eima@db.tiyifgfsuzhcvdvntjmp.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
});

async function runMigration() {
  try {
    await client.connect();
    console.log('Connected to DB');
    const sql = fs.readFileSync(path.join(__dirname, 'supabase', 'migrations', '20260710090110_create_store_items.sql'), 'utf8');
    await client.query(sql);
    console.log('Migration executed successfully');
  } catch (err) {
    console.error('Error executing migration', err);
  } finally {
    await client.end();
  }
}

runMigration();
