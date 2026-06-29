const { createClient } = require('@supabase/supabase-js');

// mock url and key, we don't need real ones just to check the realtime client object
const supabase = createClient('https://xyz.supabase.co', 'ey...');

const ch1 = supabase.channel('test-room');
const ch2 = supabase.channel('test-room');

console.log(ch1 === ch2); // true

const ch3 = supabase.realtime.channel('test-room');
console.log(ch1 === ch3); // false
