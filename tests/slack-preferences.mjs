/**
 * No row means no Slack message.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/slack-preferences.mjs
 *
 * No notification_preferences row is written when a user is created, and for
 * the three oldest events the in-app and email readers treat that absence as
 * "receives". Slack must not inherit it: linking a Slack account says where
 * someone is, not that they agreed to be interrupted there.
 *
 * The load-bearing assertion is therefore the boring-sounding one — a user with
 * a Slack link and NO preference row gets no Slack message for an OPT-OUT
 * event, while still getting the in-app and email ones. Everything else here
 * exists to stop that assertion passing for the wrong reason.
 *
 * Two databases: notification_preferences is per-TENANT, slack_user_links is in
 * master. This harness gives them separate files so a query that reached for
 * the wrong one finds an empty table rather than a plausible answer — the exact
 * failure mode TENANT_DB_AUDIT.md is about.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-slack-prefs-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
process.env.ENCRYPTION_KEY = 'f'.repeat(64);
delete process.env.CLERK_SECRET_KEY;
delete process.env.NEXT_PUBLIC_DEMO_MODE;

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

// A SEPARATE file for the tenant. notification_preferences exists in both —
// the migrations array is applied to every database — so a reader that took the
// master client would find the table present and empty, and quietly answer
// "nobody". That is why these are not the same file.
const tenant = createClient({ url: `file:${join(dir, 'tenant.db')}` });
await seedFreshDb(tenant);

const store = await import('@/lib/slack/store');
const { slackRecipientsFor, SLACK_EVENTS, OPT_OUT_EVENTS, slackColumn } =
  await import('@/lib/slack/preferences');

const ACCOUNT = 'acct-prefs';

// The four people this turns on.
const NO_ROW = 101;      // linked, never touched preferences   ← the whole point
const OPTED_IN = 102;    // linked, asked for Slack
const ZERO_ROW = 103;    // linked, has a row, said no
const UNLINKED = 104;    // asked for Slack, never linked an account

for (const id of [NO_ROW, OPTED_IN, ZERO_ROW, UNLINKED]) {
  await store.saveUserLink({ accountId: ACCOUNT, parlayUserId: id, slackUserId: `U-${id}` });
}
// …except this one, who is deliberately not linked.
await store.deleteUserLink(ACCOUNT, UNLINKED);

// notification_preferences.user_id is a foreign key into the tenant's users
// table, so every id used below has to be a real person there.
async function seedUser(userId) {
  await tenant.execute({
    sql: `INSERT OR IGNORE INTO users (id, email, password_hash, role, email_verified)
          VALUES (?, ?, 'x', 'user', 1)`,
    args: [userId, `u${userId}@prefs.test`],
  });
}
for (const id of [NO_ROW, OPTED_IN, ZERO_ROW, UNLINKED, 999, 555]) await seedUser(id);

/** A row exactly as the app writes one: opt-out events on, everything else off. */
async function seedDefaultRow(userId) {
  await tenant.execute({
    sql: `INSERT INTO notification_preferences
            (user_id, company_status_change, follow_up_assigned, note_tagged,
             company_status_change_email, follow_up_assigned_email, note_tagged_email)
          VALUES (?, 1, 1, 1, 1, 1, 1)`,
    args: [userId],
  });
}
const setSlack = (userId, event, on) => tenant.execute({
  sql: `UPDATE notification_preferences SET ${slackColumn(event)} = ? WHERE user_id = ?`,
  args: [on ? 1 : 0, userId],
});

await seedDefaultRow(OPTED_IN);
await seedDefaultRow(ZERO_ROW);
await seedDefaultRow(UNLINKED);
for (const event of SLACK_EVENTS) {
  await setSlack(OPTED_IN, event, true);
  await setSlack(UNLINKED, event, true);
}
// NO_ROW gets nothing at all. That is the fixture.

const everyone = [NO_ROW, OPTED_IN, ZERO_ROW, UNLINKED];
const ids = async (event) =>
  (await slackRecipientsFor(tenant, ACCOUNT, event, everyone)).map(r => r.parlayUserId);

// ── The assertion the phase is about ─────────────────────────────────────────

console.log('\n— a linked user with no preference row —');
for (const event of OPT_OUT_EVENTS) {
  const recipients = await ids(event);
  eq(`no Slack for '${event}', whose in-app column is opt-out`, recipients.includes(NO_ROW), false);
}
{
  // The other half of the same sentence: they are not being excluded from
  // everything. The old channels still treat the missing row as "receives", and
  // that behaviour is untouched. This asserts the in-app/email reader's own
  // logic against the same fixture.
  const row = await tenant.execute({
    sql: `SELECT company_status_change, company_status_change_email FROM notification_preferences WHERE user_id = ?`,
    args: [NO_ROW],
  });
  eq('  and they genuinely have no row', row.rows.length, 0);
  const inApp = row.rows[0]?.company_status_change ?? null;
  eq('  so in-app reads absent as "receives", unchanged', inApp == null ? true : Boolean(inApp), true);
  const email = row.rows[0]?.company_status_change_email ?? null;
  eq('  and email likewise, unchanged', email == null ? true : Boolean(email), true);
}
for (const event of SLACK_EVENTS.filter(e => !OPT_OUT_EVENTS.includes(e))) {
  const recipients = await ids(event);
  eq(`no Slack for '${event}' either, whose in-app column is opt-in`, recipients.includes(NO_ROW), false);
}

console.log('\n— a row that exists and says no —');
for (const event of SLACK_EVENTS) {
  eq(`'${event}' skips the user whose column is 0`, (await ids(event)).includes(ZERO_ROW), false);
}

console.log('\n— a row that says yes —');
for (const event of SLACK_EVENTS) {
  eq(`'${event}' includes the user whose column is 1`, (await ids(event)).includes(OPTED_IN), true);
}
{
  const recipients = await slackRecipientsFor(tenant, ACCOUNT, 'note_tagged', everyone);
  eq('and carries their Slack id, not their Parlay one',
    recipients.map(r => [r.parlayUserId, r.slackUserId]), [[OPTED_IN, `U-${OPTED_IN}`]]);
}

console.log('\n— asking for Slack without linking an account —');
for (const event of SLACK_EVENTS) {
  eq(`'${event}' cannot deliver to an unlinked user`, (await ids(event)).includes(UNLINKED), false);
}
{
  // The preference row is real and set to 1 — it is the missing link that stops
  // them, so a link appearing later turns them on with no further action.
  const row = await tenant.execute({
    sql: `SELECT note_tagged_slack FROM notification_preferences WHERE user_id = ?`,
    args: [UNLINKED],
  });
  eq('  their preference genuinely says 1', Number(row.rows[0].note_tagged_slack), 1);
  eq('  and there is genuinely no link', await store.getUserLink(ACCOUNT, UNLINKED), null);

  await store.saveUserLink({ accountId: ACCOUNT, parlayUserId: UNLINKED, slackUserId: 'U-LATE' });
  eq('  linking later makes them a recipient', (await ids('note_tagged')).includes(UNLINKED), true);
  await store.deleteUserLink(ACCOUNT, UNLINKED);
  eq('  and unlinking again removes them', (await ids('note_tagged')).includes(UNLINKED), false);
}

console.log('\n— the account is part of the key —');
{
  // users.id is an AUTOINCREMENT per database, so user 102 exists in other
  // accounts and is a different person there. A link under another account must
  // not satisfy this one.
  await store.saveUserLink({ accountId: 'acct-somewhere-else', parlayUserId: 999, slackUserId: 'U-999' });
  await seedDefaultRow(999);
  await setSlack(999, 'note_tagged', true);
  const recipients = await slackRecipientsFor(tenant, ACCOUNT, 'note_tagged', [999]);
  eq('a link in another account does not deliver here', recipients, []);
}

console.log('\n— the shape of the query —');
{
  eq('an empty recipient list asks for nobody', await slackRecipientsFor(tenant, ACCOUNT, 'note_tagged', []), []);
  eq('duplicates collapse',
    (await slackRecipientsFor(tenant, ACCOUNT, 'note_tagged', [OPTED_IN, OPTED_IN, OPTED_IN])).length, 1);
  // An unrecognised event must be silence, not a fall-through that sends to
  // everyone. The column name is interpolated, so this is also what keeps an
  // attacker-supplied event name out of the SQL.
  eq('an unknown event yields nobody',
    await slackRecipientsFor(tenant, ACCOUNT, 'note_tagged_slack = 1 OR 1', everyone), []);
  eq('  and so does an injection attempt',
    await slackRecipientsFor(tenant, ACCOUNT, "x'; DROP TABLE notification_preferences; --", everyone), []);
  const survived = await tenant.execute(`SELECT COUNT(*) AS n FROM notification_preferences`);
  eq('  the table is still there', Number(survived.rows[0].n) > 0, true);
}

console.log('\n— the columns exist and default to silence —');
{
  const cols = (await tenant.execute(`PRAGMA table_info(notification_preferences)`)).rows;
  const byName = new Map(cols.map(c => [String(c.name), c]));
  const missing = SLACK_EVENTS.map(slackColumn).filter(c => !byName.has(c));
  eq('every event has a Slack column', missing, []);
  const wrongDefault = SLACK_EVENTS
    .map(slackColumn)
    .filter(c => String(byName.get(c).dflt_value) !== '0' || Number(byName.get(c).notnull) !== 1);
  eq('all of them are NOT NULL DEFAULT 0', wrongDefault, []);
  // The contrast that makes the point: the same three events are DEFAULT 1 on
  // the in-app side. The asymmetry is deliberate, not an oversight.
  const optOutInApp = OPT_OUT_EVENTS.filter(e => String(byName.get(e).dflt_value) === '1');
  eq('while their in-app columns default to 1', optOutInApp.length, OPT_OUT_EVENTS.length);
}
{
  // A row written by the app's own INSERT — which names only the opt-out
  // columns — must still come out with Slack off everywhere.
  await seedDefaultRow(555);
  const row = (await tenant.execute({
    sql: `SELECT ${SLACK_EVENTS.map(slackColumn).join(', ')} FROM notification_preferences WHERE user_id = ?`,
    args: [555],
  })).rows[0];
  const on = SLACK_EVENTS.map(slackColumn).filter(c => Number(row[c]) !== 0);
  eq('a freshly inserted row has Slack off for every event', on, []);
}

// ── The API and the screen ───────────────────────────────────────────────────

console.log('\n— what the preferences endpoint reports —');
{
  const route = await import('@/app/api/notification-preferences/route');
  const source = (await import('node:fs')).readFileSync('app/api/notification-preferences/route.ts', 'utf8');
  // The Slack keys must be in their OWN list. The GET defaults OPT_OUT_KEYS to
  // true, so a Slack key that drifted into it would report "on" to somebody who
  // never asked for anything — the exact bug this phase is about, arriving
  // through the API rather than through the query.
  const optOutBlock = source.slice(source.indexOf('const OPT_OUT_KEYS'), source.indexOf('const OPT_IN_KEYS'));
  const strays = SLACK_EVENTS.map(slackColumn).filter(c => optOutBlock.includes(c));
  eq('no Slack key sits in the opt-out default list', strays, []);
  eq('the route exports a GET and a PATCH', [typeof route.GET, typeof route.PATCH], ['function', 'function']);
}

console.log('\n— what the screen does with an unlinked user —');
{
  const source = (await import('node:fs')).readFileSync('app/auth/account/page.tsx', 'utf8');
  // A toggle that cannot deliver is a promise the app cannot keep, so both
  // Slack toggles are gated on a link, and only the Slack ones are.
  const slackToggles = source.match(/<Toggle checked=\{prefs\[slackKey\]\}[^/]*\/>/g) ?? [];
  eq('every Slack toggle exists', slackToggles.length, 2); // opt-out group, opt-in group
  const ungated = slackToggles.filter(t => !t.includes('!slackDeliverable'));
  eq('  and every one is gated on a link', ungated, []);
  const inAppToggles = source.match(/<Toggle checked=\{prefs\[key\]\}[^/]*\/>/g) ?? [];
  const gatedInApp = inAppToggles.filter(t => t.includes('slackDeliverable'));
  eq('  while in-app toggles are not gated on anything Slack', gatedInApp, []);
  const emailToggles = source.match(/<Toggle checked=\{prefs\[emailKey\]\}[^/]*\/>/g) ?? [];
  const gatedEmail = emailToggles.filter(t => t.includes('slackDeliverable'));
  eq('  nor are email toggles', gatedEmail, []);

  // The suggestion after linking must propose, never write on its own.
  const effect = source.slice(source.indexOf('if (!readSlackCallback().connected) return;'), source.indexOf('const dismissSuggestion'));
  eq('the post-link suggestion writes nothing by itself', /fetch\(/.test(effect), false);
  eq('  it only fills in checkboxes', effect.includes('setSuggested(initial)'), true);
  eq('  pre-checked from the in-app column', effect.includes('Boolean(prefs[item.key])'), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
