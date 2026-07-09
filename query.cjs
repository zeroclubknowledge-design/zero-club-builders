const { Client } = require('pg');

const regions = [
  'aws-0-eu-central-1',
  'aws-0-us-east-1',
  'aws-0-us-west-1',
  'aws-0-ap-southeast-1',
  'aws-0-ap-northeast-1',
  'aws-0-eu-west-1',
  'aws-0-eu-west-2',
  'aws-0-sa-east-1',
  'aws-0-ap-south-1'
];

async function run() {
  for (const region of regions) {
    const connectionString = 'postgresql://postgres.tiyifgfsuzhcvdvntjmp:OctobeR1997%40eima@' + region + '.pooler.supabase.com:6543/postgres';
    const client = new Client({ connectionString });
    try {
      console.log('Trying ' + region + '...');
      await client.connect();
      console.log('Connected to ' + region + '!');
      
      const profilesResult = await client.query('SELECT * FROM profiles ORDER BY created_at DESC LIMIT 5;');
      console.log("PROFILES:");
      console.log(profilesResult.rows);

      const usersResult = await client.query('SELECT id, email, raw_user_meta_data FROM auth.users ORDER BY created_at DESC LIMIT 5;');
      console.log("USERS:");
      console.log(usersResult.rows);

      await client.end();
      return;
    } catch (err) {
      // ignore
      await client.end().catch(()=>{}).finally(() => {});
    }
  }
  console.log("Could not connect to any region.");
}

run();
