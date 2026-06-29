import fs from 'fs';

const env = fs.readFileSync('c:/Users/ukama/Downloads/zero-club-builders-main/.env', 'utf-8');
const supabaseUrl = env.split('\n').find(l => l.startsWith('VITE_SUPABASE_URL'))?.split('=')[1];
const supabaseKey = env.split('\n').find(l => l.startsWith('VITE_SUPABASE_ANON_KEY'))?.split('=')[1];

async function test() {
  const noteId = "22222222-2222-2222-2222-222222222222"; // fake uuid
  
  const res = await fetch(`${supabaseUrl}/rest/v1/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      id: noteId,
      author_id: noteId, // will fail FK on profiles
      content: 'test'
    })
  });
  const data = await res.json();
  console.log(data);
}

test();
