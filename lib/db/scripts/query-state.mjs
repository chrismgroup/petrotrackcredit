import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const keys = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['pumps', 'pumpInitialMeters', 'pumpLockedMeters', 'pumpDailyReports', 'sales', 'expenses', 'audit'];
const res = await client.query('SELECT key, data FROM app_state WHERE key = ANY($1)', [keys]);

for (const row of res.rows) {
  console.log(`\n=== ${row.key} ===`);
  console.log(JSON.stringify(row.data, null, 2));
}

await client.end();
