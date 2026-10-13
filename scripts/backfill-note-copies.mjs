/**
 * Fill in the note copies that were never written.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        scripts/backfill-note-copies.mjs [options]
 *
 *   --write              actually insert. Without it this only reports.
 *   --account <id>       one account. Default: every account with a database.
 *   --since <YYYY-MM-DD> only notes written on or after this date.
 *   --limit <n>          stop after n copies per account.
 *
 * A note is stored three times — against the attendee, the company and the
 * conference — which is what lets it be read from any of them. The notes
 * popover on a row could not do that: it is handed an attendee id and a
 * conference name, and has no company at all, so its notes landed on the
 * attendee alone. That is fixed in POST /api/notes; this is for the rows
 * already written.
 *
 * REPORTS BY DEFAULT. It prints what it would write, per account, with the
 * oldest and newest note it would touch, and does nothing until --write. Run
 * it once without the flag and read the dates before deciding: an account that
 * predates the fan-out convention could have a great many of these, and
 * filling them all in would put years of old notes on companies that have
 * never shown them.
 *
 * Safe to run twice. A copy is written with its ORIGINAL's timestamp, which is
 * what lib/notes/copies matches on, so a second run finds nothing to do.
 */
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMissingNoteCopies, writeMissingNoteCopies } from '../lib/notes/backfillCopies.ts';

const here = dirname(fileURLToPath(import.meta.url));

// Same .env.local read the other repair scripts do.
try {
  const env = readFileSync(join(here, '..', '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch { /* the variables may already be in the environment */ }

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const WRITE = flag('write');
const ONLY = value('account');
const SINCE = value('since');
const LIMIT = value('limit') ? Number(value('limit')) : null;

if (!process.env.TURSO_DATABASE_URL) {
  console.error('TURSO_DATABASE_URL is not set, and .env.local did not supply it.');
  process.exit(1);
}

const master = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const accounts = await master.execute({
  sql: `SELECT id, company_name, turso_db_url, turso_auth_token
        FROM accounts WHERE turso_db_url IS NOT NULL AND turso_db_url != ''
        ORDER BY company_name`,
  args: [],
});

const rows = accounts.rows.filter(a => !ONLY || String(a.id) === ONLY);
if (rows.length === 0) {
  console.error(ONLY ? `No account ${ONLY} with a database.` : 'No accounts with a database.');
  process.exit(1);
}

console.log(WRITE ? '\nWRITING\n' : '\nDRY RUN — nothing will be written. Add --write to apply.\n');
if (SINCE) console.log(`Only notes from ${SINCE} onwards.`);
if (LIMIT) console.log(`At most ${LIMIT} copies per account.`);

let grandTotal = 0;
let grandWritten = 0;

for (const account of rows) {
  const name = String(account.company_name ?? account.id);
  let db;
  try {
    db = createClient({
      url: String(account.turso_db_url),
      authToken: account.turso_auth_token ? String(account.turso_auth_token) : undefined,
    });
  } catch (err) {
    console.log(`  ${name}: could not open — ${err instanceof Error ? err.message : err}`);
    continue;
  }

  let missing;
  try {
    missing = await findMissingNoteCopies(db, { since: SINCE, limit: LIMIT });
  } catch (err) {
    // An account whose schema predates a column this reads is a thing to
    // report, not a reason to stop the run for everybody else.
    console.log(`  ${name}: could not read — ${err instanceof Error ? err.message : err}`);
    continue;
  }

  if (missing.length === 0) { console.log(`  ${name}: nothing missing`); continue; }

  const byType = missing.reduce((acc, m) => ({ ...acc, [m.entityType]: (acc[m.entityType] ?? 0) + 1 }), {});
  const dates = missing.map(m => m.createdAt).sort();
  const notes = new Set(missing.map(m => m.sourceId)).size;
  grandTotal += missing.length;

  console.log(`  ${name}: ${missing.length} copies for ${notes} notes` +
    ` (company ${byType.company ?? 0}, conference ${byType.conference ?? 0})` +
    `  ${dates[0]?.slice(0, 10)} → ${dates[dates.length - 1]?.slice(0, 10)}`);

  if (WRITE) {
    const wrote = await writeMissingNoteCopies(db, missing);
    grandWritten += wrote;
    console.log(`    wrote ${wrote}`);
  }
}

console.log(WRITE
  ? `\nDone. ${grandWritten} copies written.\n`
  : `\n${grandTotal} copies would be written. Re-run with --write to apply.\n`);
