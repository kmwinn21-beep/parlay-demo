/**
 * Notifications must reach a user who exists only in a tenant database.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/notification-tenant-db.mjs
 *
 * Accounts each have their own libSQL database. A tenant's users, companies and
 * notification preferences live there and NOT in the master database — that is
 * what `findDbByToken` is searching for when it walks every account looking for
 * a login. So a notification helper that reaches for the `db` singleton
 * exported by lib/db.ts is reading and writing the wrong database for every
 * tenant user: it finds no preferences row, resolves no recipients, and returns
 * having done nothing. Silently, because the whole path swallows its errors.
 *
 * This stands up a real master and a real tenant database, puts the user in the
 * tenant one exactly as production does, and asserts that each entry point
 * actually delivers. It is written against the API where the caller passes the
 * client it wants written to, as a required first argument — a required field
 * in an options bag is type-safe but reads as optional at the call site, which
 * is the ergonomic that produced this bug in the first place.
 *
 * Slow by the standards of the other tests here — it runs the real migrations
 * against two SQLite files — because the alternative is a hand-written schema
 * that drifts from the one the app actually uses, and a test that then proves
 * nothing about production.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';

// ── Two databases, wired together the way an account is ──────────────────────

const dir = mkdtempSync(join(tmpdir(), 'parlay-notif-'));
const MASTER_URL = `file:${join(dir, 'master.db')}`;
const TENANT_URL = `file:${join(dir, 'tenant.db')}`;

// Set before lib/db.ts is imported: it binds its singleton to this at module
// load, which is the very thing under test.
process.env.TURSO_DATABASE_URL = MASTER_URL;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET ??= 'test-secret-at-least-thirty-two-characters-long';
// Keeps lib/email.ts in its log-only mode; nothing here should send mail.
delete process.env.SMTP_HOST;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

/**
 * Runs a call that is supposed to work, turning a throw into a recorded
 * failure. `resolveUserIds` is called directly rather than through a wrapper,
 * so on a build where the client is not threaded through it throws on the
 * argument it was not expecting — and a stack trace there would hide the three
 * delivery paths behind it, which are the point of this file.
 */
async function attempt(label, fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    fail++;
    console.log(`  FAIL ${label}\n       threw ${err?.message ?? err}`);
    return { ok: false };
  }
}

const cleanup = () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };
process.on('exit', cleanup);

const { dbReady, seedFreshDb } = await import('@/lib/db');
await dbReady;

const master = createClient({ url: MASTER_URL });
const tenant = createClient({ url: TENANT_URL });
// The same call that builds a real tenant database: full schema plus the
// default config data. `migrateTenantDb` only applies increments on top of a
// schema that already exists.
await seedFreshDb(tenant);

const ACCOUNT_ID = 'acct-test';
await master.execute({
  sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
        VALUES (?, 'Tenant Co', 'admin@tenant.test', ?, '')`,
  args: [ACCOUNT_ID, TENANT_URL],
});

// The recipient. In the tenant database only — master never learns of them,
// which is the shape every provisioned account has.
const REP_CONFIG_ID = 5001;   // config_options row: how reps are named on records
const REP_USER_ID = 9001;     // users row: who a notification is addressed to
const ACTOR_CONFIG_ID = 5002;
const COMPANY_ID = 4242;
const NOTE_ID = 77;

await tenant.execute({
  sql: `INSERT INTO config_options (id, category, value, sort_order) VALUES (?, 'user', 'Dana Reyes', 1)`,
  args: [REP_CONFIG_ID],
});
await tenant.execute({
  sql: `INSERT INTO users (id, email, password_hash, config_id) VALUES (?, 'dana@tenant.test', 'x', ?)`,
  args: [REP_USER_ID, REP_CONFIG_ID],
});
await tenant.execute({
  sql: `INSERT INTO companies (id, name, assigned_user) VALUES (?, 'MorningStar Senior Living', ?)`,
  args: [COMPANY_ID, String(REP_CONFIG_ID)],
});
// Dana has turned the note-engagement notifications ON. They are opt-in, so
// this row is what makes them eligible — and it is a row master cannot see.
await tenant.execute({
  sql: `INSERT INTO notification_preferences
          (user_id, note_comment_received, note_comment_received_email)
        VALUES (?, 1, 1)`,
  args: [REP_USER_ID],
});

const masterUsers = await master.execute('SELECT COUNT(*) AS n FROM users');
eq('the recipient exists in the tenant database only', Number(masterUsers.rows[0].n), 0);

/** Notification rows in each database, so a misfiled write is visible too. */
async function counts() {
  const t = await tenant.execute({ sql: 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', args: [REP_USER_ID] });
  const m = await master.execute({ sql: 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', args: [REP_USER_ID] });
  return { tenant: Number(t.rows[0].n), master: Number(m.rows[0].n) };
}
async function reset() {
  await tenant.execute('DELETE FROM notifications');
  await master.execute('DELETE FROM notifications');
}
/** The note-engagement wrappers do not await their own writes. */
const settle = () => new Promise(r => setTimeout(r, 400));

const {
  resolveUserIds,
  notifyMentionedUsers,
  notifyCompanyAssignees,
  notifyNoteComment,
} = await import('@/lib/notifications');

// ── resolveUserIds ───────────────────────────────────────────────────────────
// Every wrapper below computes its recipients through this, so it fails first
// and takes the rest with it.

console.log('\n— resolveUserIds —');
{
  const label = 'resolves a tenant config id to its tenant user';
  const r = await attempt(label, () => resolveUserIds(tenant, String(REP_CONFIG_ID), null));
  if (r.ok) eq(label, r.value, [REP_USER_ID]);
}
{
  const label = '  and still excludes the actor';
  const r = await attempt(label, () => resolveUserIds(tenant, String(REP_CONFIG_ID), REP_CONFIG_ID));
  if (r.ok) eq(label, r.value, []);
}

// ── The wrappers ─────────────────────────────────────────────────────────────

console.log('\n— notifyMentionedUsers —');
{
  await reset();
  await notifyMentionedUsers(tenant, {
    taggedConfigIds: [REP_CONFIG_ID],
    mentionerName: 'Sam Patel',
    mentionerEmail: 'sam@tenant.test',
    mentionerConfigId: ACTOR_CONFIG_ID,
    entityName: 'MorningStar Senior Living',
    entityType: 'company',
    entityId: COMPANY_ID,
  });
  await settle();
  eq('an @mention reaches a tenant user', await counts(), { tenant: 1, master: 0 });
}

console.log('\n— notifyCompanyAssignees —');
{
  await reset();
  await notifyCompanyAssignees(tenant, {
    companyId: COMPANY_ID,
    companyName: 'MorningStar Senior Living',
    message: 'New note added: "site visit booked"',
    changedByEmail: 'sam@tenant.test',
    changedByConfigId: ACTOR_CONFIG_ID,
  });
  await settle();
  eq('a company assignee notification reaches a tenant user', await counts(), { tenant: 1, master: 0 });
}

console.log('\n— notifyNoteComment (opt-in) —');
{
  await reset();
  await notifyNoteComment(tenant, {
    noteId: NOTE_ID,
    noteAuthorUserId: REP_USER_ID,
    commenterUserId: 9002,
    commenterName: 'Sam Patel',
    commenterEmail: 'sam@tenant.test',
    commenterConfigId: ACTOR_CONFIG_ID,
    previousCommenterUserIds: [],
    recordName: 'MorningStar Senior Living',
    entityType: 'company',
    entityId: COMPANY_ID,
  });
  await settle();
  eq('a comment on a tenant user\'s note reaches them', await counts(), { tenant: 1, master: 0 });
}
{
  // The opt-in preference lives in the tenant database. Read against master it
  // is simply absent, and absent reads as "not opted in" — so a user who turned
  // the notification ON gets nothing, which is the worst version of this bug.
  await reset();
  await tenant.execute({ sql: 'UPDATE notification_preferences SET note_comment_received = 0 WHERE user_id = ?', args: [REP_USER_ID] });
  await notifyNoteComment(tenant, {
    noteId: NOTE_ID,
    noteAuthorUserId: REP_USER_ID,
    commenterUserId: 9002,
    commenterName: 'Sam Patel',
    commenterEmail: 'sam@tenant.test',
    commenterConfigId: ACTOR_CONFIG_ID,
    previousCommenterUserIds: [],
    recordName: 'MorningStar Senior Living',
    entityType: 'company',
    entityId: COMPANY_ID,
  });
  await settle();
  eq('  and respects the tenant preference when it is off', await counts(), { tenant: 0, master: 0 });
  await tenant.execute({ sql: 'UPDATE notification_preferences SET note_comment_received = 1 WHERE user_id = ?', args: [REP_USER_ID] });
}

// ── Master-scoped accounts still work ────────────────────────────────────────
// An account with no turso_db_url resolves to the master database today, and
// must keep doing so. Here the caller passes master, which is what getDb hands
// back for those accounts.

console.log('\n— unprovisioned accounts still resolve against master —');
{
  await master.execute({
    sql: `INSERT INTO config_options (id, category, value, sort_order) VALUES (?, 'user', 'Ops Admin', 1)`,
    args: [6001],
  });
  await master.execute({
    sql: `INSERT INTO users (id, email, password_hash, config_id) VALUES (?, 'ops@parlay.test', 'x', ?)`,
    args: [9500, 6001],
  });
  const label = 'a master user resolves when master is the client';
  const r = await attempt(label, () => resolveUserIds(master, '6001', null));
  if (r.ok) eq(label, r.value, [9500]);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
