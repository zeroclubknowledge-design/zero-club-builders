import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(process.cwd(), '.env');
let envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = envContent.split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {} as any);
const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Since Supabase JS client cannot execute raw DDL (ALTER TABLE) without postgres role, we'll try using RPC if a generic 'exec_sql' exists.");
  const { data, error } = await supabase.rpc('exec_sql', { query: 'ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_url TEXT;' });
  console.log("RPC result:", error || data || "Success (if no error)");
}
run();
