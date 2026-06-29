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

async function check() {
  const res = await supabase.from('clubs').select('*').limit(5);
  console.log("Clubs fetch result:", res);
  
  const creatorClubs = await supabase.from('clubs').select('id, name').eq('creator_id', 'bb779f2a-fd4e-416d-bb44-b9751ea67b1d');
  console.log("Vice's clubs:", creatorClubs.data, "Error:", creatorClubs.error);
  
  if (creatorClubs.data && creatorClubs.data.length > 0) {
     const clubIds = creatorClubs.data.map((c: any) => c.id);
     const members = await supabase.from('club_members').select('id', { count: 'exact', head: true }).in('club_id', clubIds);
     console.log("Club members:", members);
  }
}
check();
