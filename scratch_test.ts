import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('c:/Users/ukama/Downloads/zero-club-builders-main/.env') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function test() {
  const { data, error } = await supabase.from('note_comments').select('*').limit(1);
  console.log('note_comments', error);

  const { data: cols, error: colsErr } = await supabase.rpc('get_schema');
  console.log('schema error:', colsErr);
}

test();
