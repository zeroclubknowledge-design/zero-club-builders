const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tiyifgfsuzhcvdvntjmp.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeWlmZ2ZzdXpoY3Zkdm50am1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzMyMzYsImV4cCI6MjA5NDMwOTIzNn0.Gb2AcxgfArsdEOrnkHyfwRhJpyn44W0WrM3PW6TC69M');

async function run() {
  const { data, error } = await supabase.from('quests').select('*');
  console.log('Quests:', data);
  if (error) console.error('Error:', error);
}

run();
