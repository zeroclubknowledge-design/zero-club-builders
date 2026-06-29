import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Read .env
const env = fs.readFileSync('.env', 'utf-8').split('\n');
const supabaseUrl = env.find(l => l.startsWith('VITE_SUPABASE_URL'))?.split('=')[1].trim();
const supabaseKey = env.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY'))?.split('=')[1].trim();

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
  const { data: d1, error: e1 } = await supabase.from('club_message_reactions').select('*').limit(1);
  console.log('club_message_reactions:', d1, e1?.message);
  
  const { data: d2, error: e2 } = await supabase.from('message_reactions').select('*').limit(1);
  console.log('message_reactions:', d2, e2?.message);
}

run();
