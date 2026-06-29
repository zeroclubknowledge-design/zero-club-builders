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

async function main() {
  const { data, error } = await supabase.rpc('execute_sql', { 
    sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hide_clubs_unless_following BOOLEAN DEFAULT false;' 
  });
  console.log('Error:', error);
  console.log('Data:', data);
}

main();
