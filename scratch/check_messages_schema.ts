import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n');
const supabaseUrl = env.find(l => l.startsWith('VITE_SUPABASE_URL'))?.split('=')[1].trim();
const supabaseKey = env.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY'))?.split('=')[1].trim();

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
  const { data, error } = await supabase.from('messages').select('*').limit(1);
  console.log('Messages:', data, error);
}
run();
