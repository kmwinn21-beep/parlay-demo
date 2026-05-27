import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = join(__dirname, '..', '.env.local');
const env = readFileSync(envPath, 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const masterDb = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Find the parlay-infor account
const accounts = await masterDb.execute({
  sql: `SELECT id, company_name, admin_email, turso_db_url, turso_auth_token FROM accounts ORDER BY created_at DESC`,
  args: [],
});

console.log('\n=== All accounts ===');
for (const row of accounts.rows) {
  console.log(`  ${row.id}  |  ${row.company_name}  |  ${row.admin_email}  |  DB: ${row.turso_db_url ? '✓' : '✗'}`);
}

// Find parlay-infor
const target = accounts.rows.find(r =>
  String(r.company_name ?? '').toLowerCase().includes('parlay') ||
  String(r.admin_email ?? '').toLowerCase().includes('parlay') ||
  String(r.turso_db_url ?? '').toLowerCase().includes('parlay-infor')
);

if (!target) {
  console.error('\nCould not find parlay-infor account. Check the list above and re-run with a specific ID.');
  process.exit(1);
}

console.log(`\n=== Repairing: ${target.company_name} (${target.admin_email}) ===`);
console.log(`Tenant DB: ${target.turso_db_url}`);

const tenantDb = createClient({
  url: String(target.turso_db_url),
  authToken: String(target.turso_auth_token),
});

// Dynamically import migrations (TypeScript — need to compile first, so we inline a TS->JS approach)
// Instead, call the compiled Next.js build path or inline migrations by running tsx
console.log('\nLoading migrations...');

// Use tsx to run the actual migrations from the TS source
import { migrations } from '../lib/db-migrations.ts';

let applied = 0, skipped = 0;
const errors = [];

console.log(`Running ${migrations.length} migrations sequentially...`);

for (let i = 0; i < migrations.length; i++) {
  const sql = migrations[i];
  try {
    await tenantDb.execute({ sql, args: [] });
    applied++;
    if (applied % 50 === 0) process.stdout.write(`  ${applied} applied...\n`);
  } catch (err) {
    const msg = err.message ?? String(err);
    if (
      msg.includes('already exists') ||
      msg.includes('duplicate column') ||
      msg.includes('no such column')
    ) {
      skipped++;
    } else {
      errors.push(`[${i}] ${msg.slice(0, 100)}`);
    }
  }
}

console.log(`\n=== Done ===`);
console.log(`  Total migrations : ${migrations.length}`);
console.log(`  Applied (new)    : ${applied}`);
console.log(`  Skipped (exists) : ${skipped}`);
console.log(`  Errors           : ${errors.length}`);
if (errors.length) {
  console.log('\nErrors:');
  errors.forEach(e => console.log('  ' + e));
}
console.log('\nRepair complete. The parlay-infor DB should now have the full schema.');
