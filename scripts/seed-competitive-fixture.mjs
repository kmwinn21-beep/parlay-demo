/**
 * Competitors and relationships to see the competitive view against.
 *
 *   node scripts/seed-competitive-fixture.mjs [file:/path/to.db]
 *
 * WHY THIS EXISTS AT ALL: the dev database has no company typed Competitor and
 * no rows in vendor_relationships, so the competitive grid renders empty — and
 * an empty grid looks EXACTLY the same whether the resolution rule is right or
 * wrong. Every end is placed correctly and every end is placed backwards produce
 * the same blank canvas. So there is nothing to look at and nothing to catch a
 * regression in until something is in there, which is what this puts there.
 *
 * The rows are chosen to exercise each branch of lib/competitiveResolution.ts,
 * including the ones that must produce NOTHING:
 *
 *   an account current with one competitor and evaluating another  → a pair
 *   the same pair logged from both sides                           → one entry
 *   a status stored counterpart-side ("Customer" on the competitor) → normalised
 *   a symmetric status                                             → placed by type
 *   a status with no action_key                                    → unclassified
 *   a relationship to a non-competitor                             → excluded
 *   a status naming a non-competitor while the other end is one    → excluded
 *
 * Idempotent: fixed ids, and every write is INSERT OR REPLACE, so running it
 * twice leaves the same rows and running it after a schema migration refreshes
 * them. It only ever touches its own ids — the companies numbered from
 * FIRST_COMPANY_ID up and the relationships from FIRST_REL_ID up — so it cannot
 * disturb anything else in the database it is pointed at.
 *
 * Defaults to TURSO_DATABASE_URL from the environment. Pass a url to seed a
 * scratch copy instead, which is the safer habit.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { createClient } = require('@libsql/client');

/** Ids this script owns. Nothing outside these ranges is written or deleted. */
const FIRST_COMPANY_ID = 20;
const FIRST_REL_ID = 1000;

const COMPANIES = [
  // id, name, company_type (comma-separated, as the column stores it)
  [20, 'Teton Systems', 'Competitor'],
  // Two types, so the competitor test has to tolerate a list.
  [21, 'Vireo Software', 'Vendor,Competitor'],
  [22, 'Halden Care', 'Competitor'],
  // Not a competitor. Here so an excluded row has somewhere to point.
  [23, 'Northwind Capital', 'Capital'],
];

/**
 * relId, company_id, related_company_id, status, days since the status changed.
 *
 * company_id is whoever's page it was logged on, and the status is written from
 * THAT side — which is the whole point of the rows logged from 20/21/22.
 */
const RELATIONSHIPS = [
  // An account buying from one competitor while trying another: the pair.
  [1000, 1, 20, 'Current Vendor', 400],
  [1001, 1, 21, 'Evaluating', 12],
  // Stored counterpart-side, on the competitor's own page. Must normalise to
  // account 2 / competitor 22, not the other way round.
  [1002, 22, 2, 'Customer', 30],
  // The same pair, logged from the account's side too. Collapses into 1002,
  // which keeps the known change date.
  [1003, 2, 22, 'Current Vendor', null],
  // Former, inside the window and outside it.
  [1004, 3, 20, 'Former Vendor', 20],
  [1005, 4, 20, 'Former Vendor', 300],
  // Symmetric: the words point nowhere, so the types place it.
  [1006, 5, 21, 'Preferred Partner', 5],
  // No action_key. Counted as unclassified, given no cell.
  [1007, 6, 20, 'Other', 3],
  // Neither end a competitor. Not this view's business.
  [1008, 7, 23, 'Current Vendor', 9],
  // The status names company 7 as the vendor, and 7 is not a competitor. The
  // other end IS one, and must NOT be flipped in to make the row fit.
  [1009, 7, 20, 'Customer', 9],
];

const url = process.argv[2]
  ?? (() => {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const m = env.match(/^TURSO_DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : process.env.TURSO_DATABASE_URL;
  })();

if (!url) {
  console.error('No database url. Pass one, or set TURSO_DATABASE_URL.');
  process.exit(1);
}

const stamp = (days) => days == null
  ? null
  : new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19);

const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

// The seeded statuses have to be classified, or every row lands unclassified and
// the fixture proves nothing. Checked rather than written: the migration owns
// these, and a second writer would be a second source of truth.
const classes = await db.execute(
  `SELECT value, action_key, inverse_value FROM config_options
   WHERE category = 'other_relationship_status'`,
);
const missing = classes.rows.filter(r => !r.action_key && String(r.value) !== 'Other');
if (classes.rows.length === 0) {
  console.error('No relationship statuses configured. Run the migrations first.');
  process.exit(1);
}
if (missing.length > 0) {
  console.error(`Statuses with no action_key: ${missing.map(r => r.value).join(', ')}.`);
  console.error('The migrations seed these. Run them, or the grid will read everything as unclassified.');
  process.exit(1);
}
const competitorType = await db.execute(
  `SELECT value FROM config_options WHERE category = 'company_type' AND action_key = 'competitor'`,
);
if (competitorType.rows.length === 0) {
  console.error('No company_type carries the competitor action_key. Run the migrations first.');
  process.exit(1);
}

for (const [id, name, type] of COMPANIES) {
  await db.execute({
    sql: `INSERT OR REPLACE INTO companies (id, name, company_type) VALUES (?, ?, ?)`,
    args: [id, name, type],
  });
}

// The accounts the relationships point at have to exist. Seeded only when they
// do not, so a real dev database keeps its own companies and their data.
const accountIds = Array.from(new Set(RELATIONSHIPS.flatMap(([, a, z]) => [a, z])))
  .filter(id => id < FIRST_COMPANY_ID);
for (const id of accountIds) {
  await db.execute({
    sql: `INSERT OR IGNORE INTO companies (id, name, company_type) VALUES (?, ?, ?)`,
    args: [id, `Fixture Operator ${id}`, 'Operator'],
  });
}

let stamped = 0;
for (const [id, a, z, status, days] of RELATIONSHIPS) {
  const changed = stamp(days);
  if (changed) stamped++;
  await db.execute({
    sql: `INSERT OR REPLACE INTO vendor_relationships
            (id, company_id, related_company_id, relationship_status, status_changed_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, a, z, status, changed],
    // status_changed_at arrived with the competitive view. Without it the
    // Recent Change signal is blank, which is worth saying rather than failing.
  }).catch(async (err) => {
    if (!/status_changed_at/.test(String(err))) throw err;
    console.warn('No status_changed_at column — seeding without it. Run the migrations for the Recent Change signal.');
    await db.execute({
      sql: `INSERT OR REPLACE INTO vendor_relationships
              (id, company_id, related_company_id, relationship_status)
            VALUES (?, ?, ?, ?)`,
      args: [id, a, z, status],
    });
  });
}

// One internal relationship, so the Int. Relationship pill has something to
// light. On account 1, which also carries the evaluating-alternatives pair, so
// two pills land on one card.
await db.execute({
  sql: `INSERT OR REPLACE INTO internal_relationships
          (id, company_id, rep_ids, contact_ids, relationship_status, description)
        VALUES (?, ?, ?, ?, ?, ?)`,
  args: [FIRST_REL_ID, 1, '', '', 'Warm', 'Fixture: somebody here knows somebody there'],
}).catch(() => {
  console.warn('Could not seed an internal relationship — the Int. Relationship pill will read 0.');
});

console.log(`Seeded ${COMPANIES.length} companies and ${RELATIONSHIPS.length} relationships`);
console.log(`  ${stamped} carry a status_changed_at; ids ${FIRST_COMPANY_ID}+ and ${FIRST_REL_ID}+`);
console.log(`  into ${url}`);
console.log('Expect: 3 competitor columns, 6 cells, 1 unclassified, 2 excluded, 1 collapsed.');
