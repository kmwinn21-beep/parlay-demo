import { createClient } from '@libsql/client';

const dbUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
  process.exit(1);
}

async function main() {
  const url = dbUrl as string;
  const token = authToken as string;
  const db = createClient({ url, authToken: token });
  const columns: Array<[string, string]> = [
    ['color', 'ALTER TABLE config_options ADD COLUMN color TEXT'],
    ['action_key', 'ALTER TABLE config_options ADD COLUMN action_key TEXT'],
    ['status_key', 'ALTER TABLE config_options ADD COLUMN status_key TEXT'],
    ['scope', "ALTER TABLE config_options ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'"],
    ['auto_follow_up', 'ALTER TABLE config_options ADD COLUMN auto_follow_up INTEGER NOT NULL DEFAULT 1'],
    ['is_system', 'ALTER TABLE config_options ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0'],
    ['is_primary', 'ALTER TABLE config_options ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0'],
  ];

  const info = await db.execute({ sql: 'PRAGMA table_info(config_options)', args: [] });
  const names = new Set(info.rows.map((r) => String(r.name)));

  for (const [name, sql] of columns) {
    if (names.has(name)) continue;
    await db.execute({ sql, args: [] }).catch(() => {});
    console.log(`Added missing config_options.${name}`);
  }

  console.log('Repair complete.');
}

main().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
