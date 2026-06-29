import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(process.cwd(), '.env');
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf-8');
} catch (e) {
  console.error("No .env file found");
  process.exit(1);
}

const envVars = envContent.split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim();
  return acc;
}, {} as any);

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_ANON_KEY);

async function check() {
  const allPosts = await supabase
      .from('posts')
      .select('id, author_id, created_at, is_build_post')
      .eq('author_id', 'bb779f2a-fd4e-416d-bb44-b9751ea67b1d')
      .order('created_at', { ascending: false })
      .limit(1);

  console.log("Vice's recent post:", allPosts.data);
}
check();
