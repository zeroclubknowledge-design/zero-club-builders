import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n');
const supabaseUrl = env.find(l => l.startsWith('VITE_SUPABASE_URL'))?.split('=')[1].trim();
const supabaseKey = env.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY'))?.split('=')[1].trim();

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: `
    CREATE TABLE IF NOT EXISTS message_reactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
      profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
      UNIQUE(message_id, profile_id, emoji)
    );
  ` });
  console.log('Execute SQL:', data, error);
}
run();
