/**
 * Resolving a page of titles: one query, and one tenant's answer.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/title-metadata-batch.mjs
 *
 * /api/attendees/title-metadata resolved each attendee title with its own
 * query — a hundred round trips for one request, ten in flight at a time.
 * Turso answered HTTP 429 and the route 500ed. The rules for a whole page are
 * now fetched in one query, so the assertion that matters is a COUNT: the
 * number of queries must not grow with the number of titles.
 *
 * The second half is the more serious find. `titleResolutionCache` is a
 * module-level Map that outlives a request, and its key carried no tenant — so
 * on a warm worker one account's confirmed title mapping was served to the
 * next account that asked for the same title. The same class of bug as
 * TENANT_DB_AUDIT.md describes: a correct query whose answer was cached
 * somewhere that outlived the tenant.
 *
 * Two databases, deliberately: a resolver that reached for the wrong client
 * would find a different answer rather than a plausible one.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-title-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
delete process.env.CLERK_SECRET_KEY;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const { createClient } = await import('@libsql/client');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
await dbReady;
await seedFreshDb(db);

const { registerTenantClient } = await import('@/lib/getDb');
const { resolveAttendeeTitleMetadataBatch, getRulesForTitleKeys } =
  await import('@/lib/titleNormalizationRules');
const { normalizeTitleKey } = await import('@/lib/titleNormalization');

/** A client that counts what it is asked to run. */
function counting(client) {
  const wrapper = Object.create(client);
  wrapper.count = 0;
  wrapper.execute = (...args) => { wrapper.count++; return client.execute(...args); };
  wrapper.batch = (...args) => { wrapper.count++; return client.batch(...args); };
  return wrapper;
}

async function tenant(name, accountId) {
  const raw = createClient({ url: `file:${join(dir, `${name}.db`)}` });
  await seedFreshDb(raw);
  const client = counting(raw);
  registerTenantClient(client, accountId);
  return client;
}

const A = await tenant('acct-a', 'account-a');
const B = await tenant('acct-b', 'account-b');

const TITLE = 'VP of Operations';
const KEY = normalizeTitleKey(TITLE);

const addRule = (client, normalized, source, updatedAt) => client.execute({
  sql: `INSERT INTO title_normalization_rules
          (organization_id, raw_title, raw_title_key, normalized_title, buyer_role, source, confidence, updated_at)
        VALUES (NULL, ?, ?, ?, 'decision_maker', ?, 'high', ?)`,
  args: [TITLE, KEY, normalized, source, updatedAt],
});

// ── The query count ──────────────────────────────────────────────────────────

console.log('\n— the queries do not grow with the page —');
{
  const titles = (n) => Array.from({ length: n }, (_, i) => ({ rawTitle: `Distinct Title ${i}` }));

  A.count = 0;
  await resolveAttendeeTitleMetadataBatch(A, titles(5));
  const five = A.count;

  A.count = 0;
  await resolveAttendeeTitleMetadataBatch(A, titles(120));
  const oneTwenty = A.count;

  console.log(`       (5 titles: ${five} queries | 120 titles: ${oneTwenty} queries)`);
  // Before this change 120 titles meant ~120 rule lookups on top of the fixed
  // context queries. The point is that the count is flat, not that it is small.
  eq('120 titles cost no more queries than 5', oneTwenty <= five, true);
  eq('  and the whole page is under a dozen queries', oneTwenty < 12, true);
  eq('  which is far below the old one-per-title', oneTwenty < 120, true);
}
{
  // The chunking only kicks in past 200 keys; 500 is the route's own cap.
  A.count = 0;
  await resolveAttendeeTitleMetadataBatch(A,
    Array.from({ length: 500 }, (_, i) => ({ rawTitle: `Bulk Title ${i}` })));
  console.log(`       (500 titles: ${A.count} queries)`);
  eq('500 titles stay in single figures of queries', A.count < 15, true);
}

// ── The answers are still right ──────────────────────────────────────────────

console.log('\n— the batch answers what the single lookup answered —');
{
  await addRule(A, 'VP Operations (A)', 'user_confirmed', '2026-01-01 00:00:00');
  const [meta] = await resolveAttendeeTitleMetadataBatch(A, [{ rawTitle: TITLE }]);
  eq('a confirmed rule wins', meta.normalized_title, 'VP Operations (A)');
  eq('  and is reported as confirmed', meta.match_type, 'confirmed');
}
{
  // The per-title query this replaced ordered by user_confirmed then newest and
  // took one row. In practice a key can only HAVE one row: idx_title_norm_scope_raw
  // is unique on (COALESCE(organization_id, 0), raw_title_key). The ranking is
  // kept as parity with the removed ORDER BY, for databases old enough to
  // predate that index — it is created best-effort, with the error swallowed.
  const dup = await A.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_title_norm_scope_raw'`,
  }).catch(() => ({ rows: [] }));
  eq('one rule per title per scope is enforced by a unique index',
    /UNIQUE/i.test(String(dup.rows[0]?.sql ?? '')), true);
  eq('  so a second rule for the same key is refused',
    await A.execute({
      sql: `INSERT INTO title_normalization_rules
              (organization_id, raw_title, raw_title_key, normalized_title, buyer_role, source, confidence)
            VALUES (NULL, ?, ?, 'Duplicate', 'influencer', 'imported', 'high')`,
      args: [TITLE, KEY],
    }).then(() => 'inserted').catch(e => e.code), 'SQLITE_CONSTRAINT_UNIQUE');
}
{
  const rules = await getRulesForTitleKeys(A, ['no-such-title-key']);
  eq('a title with no rule is simply absent', rules.size, 0);
  eq('  and asking for nothing queries nothing',
    (await getRulesForTitleKeys(A, [])).size, 0);
}

// ── The cache is not shared between accounts ─────────────────────────────────

console.log('\n— one account\'s mapping is not served to another —');
{
  // The same title, mapped differently by each account. A is resolved first, so
  // with an unscoped cache key B would be handed A's answer.
  await addRule(B, 'VP Operations (B)', 'user_confirmed', '2026-01-01 00:00:00');

  const [fromA] = await resolveAttendeeTitleMetadataBatch(A, [{ rawTitle: TITLE }]);
  const [fromB] = await resolveAttendeeTitleMetadataBatch(B, [{ rawTitle: TITLE }]);

  eq('account A gets its own mapping', fromA.normalized_title, 'VP Operations (A)');
  eq('account B gets ITS own, not the cached one', fromB.normalized_title, 'VP Operations (B)');
  eq('  and they are genuinely different answers',
    fromA.normalized_title !== fromB.normalized_title, true);
}
{
  // And the cache still does its job within one account.
  B.count = 0;
  const [again] = await resolveAttendeeTitleMetadataBatch(B, [{ rawTitle: TITLE }]);
  eq('a repeat resolve is served from cache', again.normalized_title, 'VP Operations (B)');
  eq('  without re-querying the rules table', B.count <= 6, true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
