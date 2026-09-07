/**
 * Slack is additive. It must never take the other two channels with it.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/slack-delivery.mjs
 *
 * The in-app row and the email are what people actually depend on, and they
 * were only just repaired (TENANT_DB_AUDIT.md, tests/notification-tenant-db.mjs).
 * Slack delivery runs in the same call, last, and every failure mode it has —
 * a Slack outage, a revoked installation, a token that will not decrypt, a rate
 * limit — is asserted here to leave the notification row and the email intact.
 *
 * So most assertions come in pairs: what Slack did, and what the other two
 * channels did in the same call. A test that only checked the first would pass
 * happily while the regression it exists to catch shipped.
 *
 * Two databases, separate files. notification_preferences and users are per
 * TENANT; slack_workspaces and slack_user_links are in MASTER. Both tables
 * exist in both databases — the migrations array is applied to every one — so a
 * reader that took the wrong client would find an empty table and answer
 * "nobody" rather than failing.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-slack-delivery-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.NEXT_PUBLIC_BASE_URL = 'https://parlay.test';
delete process.env.SMTP_HOST;               // email logs instead of sending
delete process.env.NOTIFICATION_EMAIL_DISABLED;
delete process.env.CLERK_SECRET_KEY;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; realLog(`  ok   ${label}`); }
  else { fail++; realLog(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

// ── Observing the two channels we must not break ─────────────────────────────
// With no SMTP_HOST, lib/email.ts logs the message instead of sending it. That
// log line is the only externally visible evidence that the email path ran, so
// console is captured rather than stubbed — stubbing sendNotificationEmail would
// mean testing a double instead of the code under test.
const realLog = console.log.bind(console);
const realError = console.error.bind(console);
let emails = [];
let errors = [];
console.log = (...args) => {
  const line = args.join(' ');
  if (line.includes('📧')) { emails.push(line); return; }
  realLog(...args);
};
console.error = (...args) => { errors.push(args.join(' ')); };

const { createClient } = await import('@libsql/client');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
await dbReady;
await seedFreshDb(db);

const tenant = createClient({ url: `file:${join(dir, 'tenant.db')}` });
await seedFreshDb(tenant);

const { registerTenantClient } = await import('@/lib/getDb');
const store = await import('@/lib/slack/store');
const notifications = await import('@/lib/notifications');

const ACCOUNT = 'acct-delivery';
// A tenant client normally learns its account from getDb. This is the same
// association, made by hand because the harness has no provisioned account.
registerTenantClient(tenant, ACCOUNT);

const LINKED_ON = 1;    // linked, Slack pref on
const LINKED_OFF = 2;   // linked, Slack pref off
const UNLINKED = 3;     // Slack pref on, no link

for (const [id, email] of [[LINKED_ON, 'on@d.test'], [LINKED_OFF, 'off@d.test'], [UNLINKED, 'no@d.test']]) {
  await tenant.execute({
    sql: `INSERT INTO users (id, email, password_hash, role, email_verified) VALUES (?, ?, 'x', 'user', 1)`,
    args: [id, email],
  });
  await tenant.execute({
    sql: `INSERT INTO notification_preferences
            (user_id, company_status_change, follow_up_assigned, note_tagged,
             company_status_change_email, follow_up_assigned_email, note_tagged_email)
          VALUES (?, 1, 1, 1, 1, 1, 1)`,
    args: [id],
  });
}
await tenant.execute(`UPDATE notification_preferences SET note_tagged_slack = 1 WHERE user_id IN (1, 3)`);
await store.saveUserLink({ accountId: ACCOUNT, parlayUserId: LINKED_ON, slackUserId: 'U-ON' });
await store.saveUserLink({ accountId: ACCOUNT, parlayUserId: LINKED_OFF, slackUserId: 'U-OFF' });

async function installWorkspace() {
  await store.saveWorkspace({
    accountId: ACCOUNT, teamId: 'T-D', teamName: 'Delivery Inc',
    botToken: 'fixture-bot-credential-delivery', botUserId: 'U-BOT', installedByUserId: LINKED_ON,
  });
}
await installWorkspace();

// ── Slack, stubbed ───────────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
let posted = [];
/** Set to override what Slack answers: 'ok' | an error string | 'throw' | 'ratelimit' | 'hang'. */
let slackBehaviour = 'ok';
/** When set, only this Slack user's DM fails — the rest of the batch is healthy. */
let failOnlyFor = null;
globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (!target.includes('slack.com')) return realFetch(url, init);
  if (slackBehaviour === 'throw') throw new Error('ECONNRESET talking to Slack');
  if (slackBehaviour === 'ratelimit') {
    return new Response('{}', { status: 429, headers: { 'retry-after': '30', 'Content-Type': 'application/json' } });
  }
  if (target.includes('conversations.open')) {
    const requested = JSON.parse(init.body).users;
    if (failOnlyFor && requested === failOnlyFor) throw new Error(`ECONNRESET opening a DM for ${requested}`);
    if (slackBehaviour !== 'ok') {
      return new Response(JSON.stringify({ ok: false, error: slackBehaviour }), { headers: { 'Content-Type': 'application/json' } });
    }
    const users = JSON.parse(init.body).users;
    return new Response(JSON.stringify({ ok: true, channel: { id: `D-${users}` } }), { headers: { 'Content-Type': 'application/json' } });
  }
  if (target.includes('chat.postMessage')) {
    const body = JSON.parse(init.body);
    posted.push(body);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, init);
};

/** Run one notification and report what each of the three channels did. */
async function notify(userIds = [LINKED_ON, LINKED_OFF, UNLINKED]) {
  posted = []; emails = []; errors = [];
  const before = Number((await tenant.execute('SELECT COUNT(*) AS n FROM notifications')).rows[0].n);
  await notifications.createNotifications(tenant, {
    userIds, type: 'company', recordId: 7, recordName: 'Acme',
    message: 'Dana mentioned you in a note related to Acme',
    changedByEmail: 'dana@d.test', entityType: 'company', entityId: 7,
    prefKey: 'note_tagged',
  });
  const after = Number((await tenant.execute('SELECT COUNT(*) AS n FROM notifications')).rows[0].n);
  return { inApp: after - before, emails: emails.length, slack: posted.length, errors };
}

// ── The ordinary path ────────────────────────────────────────────────────────

realLog('\n— a linked user who asked for Slack —');
{
  const r = await notify();
  eq('gets a DM', r.slack, 1);
  eq('  and only they do — not the one whose pref is off, nor the unlinked one',
    posted.map(p => p.channel), ['D-U-ON']);
  eq('  carrying the same message as the other channels',
    posted[0].text, 'Dana mentioned you in a note related to Acme\nhttps://parlay.test/companies/7');
  eq('  with link previews off', [posted[0].unfurl_links, posted[0].unfurl_media], [false, false]);
  eq('all three still get the in-app row', r.inApp, 3);
  eq('  and the email', r.emails, 3);
  eq('  with nothing logged as an error', r.errors, []);
}

// ── Every way Slack can fail ─────────────────────────────────────────────────
// Each of these asserts the SAME two numbers — 3 in-app rows, 3 emails — as the
// healthy case above. That repetition is the point of the file.

realLog('\n— Slack returns an error —');
{
  slackBehaviour = 'internal_error';
  const r = await notify();
  eq('no DM is sent', r.slack, 0);
  eq('the in-app rows still land', r.inApp, 3);
  eq('the emails still go', r.emails, 3);
  eq('and it is logged, not swallowed', r.errors.some(e => e.includes('internal_error')), true);
  slackBehaviour = 'ok';
}

realLog('\n— Slack is unreachable —');
{
  slackBehaviour = 'throw';
  // The caller of createNotifications is a route in the middle of a real
  // mutation. It must come back normally, not reject — asserted directly rather
  // than inferred from the counts below, because a rejection here would crash
  // the harness instead of failing an expectation.
  let rejected = null;
  await notifications.createNotifications(tenant, {
    userIds: [LINKED_ON], type: 'company', recordId: 7, recordName: 'Acme', message: 'x',
    changedByEmail: 'd@d.test', entityType: 'company', entityId: 7, prefKey: 'note_tagged',
  }).catch(err => { rejected = String(err); });
  eq('createNotifications resolves rather than rejecting', rejected, null);

  const r = await notify();
  eq('no DM is sent', r.slack, 0);
  eq('the in-app rows still land', r.inApp, 3);
  eq('the emails still go', r.emails, 3);
  eq('and the transport failure is logged', r.errors.some(e => e.includes('ECONNRESET')), true);
  slackBehaviour = 'ok';
}

realLog('\n— Slack rate limits us —');
{
  slackBehaviour = 'ratelimit';
  const r = await notify();
  eq('no DM is sent', r.slack, 0);
  eq('the in-app rows still land', r.inApp, 3);
  eq('the emails still go', r.emails, 3);
  eq('the log says how long Slack asked for', r.errors.some(e => e.includes('retry after 30s')), true);
  eq('  and says the other channels already delivered',
    r.errors.some(e => e.includes('already delivered')), true);
  slackBehaviour = 'ok';
}

realLog('\n— the linked Slack user has left the workspace —');
{
  slackBehaviour = 'user_not_found';
  const r = await notify();
  eq('no DM is sent', r.slack, 0);
  eq('the in-app rows still land', r.inApp, 3);
  eq('the emails still go', r.emails, 3);
  eq('it is logged against that person', r.errors.some(e => e.includes('user 1') && e.includes('U-ON')), true);
  // Deliberately not deleted: user_not_found is also what a transient blip
  // looks like, and unlinking on one bad response costs a real reconnect.
  eq('  and their link is left in place',
    (await store.getUserLink(ACCOUNT, LINKED_ON)).slackUserId, 'U-ON');
  eq('  and the workspace is not marked revoked',
    (await store.getWorkspace(ACCOUNT)).revokedAt, null);
  slackBehaviour = 'ok';
}

realLog('\n— the workspace uninstalled Parlay from the Slack side —');
{
  slackBehaviour = 'token_revoked';
  const r = await notify();
  eq('no DM is sent', r.slack, 0);
  eq('the in-app rows still land', r.inApp, 3);
  eq('the emails still go', r.emails, 3);
  const workspace = await store.getWorkspace(ACCOUNT);
  eq('the workspace is marked revoked', workspace.revokedAt != null, true);
  eq('  but not deleted — the team is still recorded', workspace.teamId, 'T-D');
  eq('  and the user links survive, so a reinstall restores everyone',
    (await store.listUserLinks(ACCOUNT)).length, 2);
  eq('  with the reason logged', r.errors.some(e => e.includes('token_revoked')), true);

  slackBehaviour = 'ok';
  // Reconnecting is the cure, and it clears the mark.
  await installWorkspace();
  eq('reinstalling clears the mark', (await store.getWorkspace(ACCOUNT)).revokedAt, null);
  const back = await notify();
  eq('  and delivery resumes', back.slack, 1);
}

realLog('\n— the bot token will not decrypt —');
{
  const saved = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = 'b'.repeat(64);   // a rotated key
  const r = await notify();
  eq('no DM is sent', r.slack, 0);
  eq('the in-app rows still land', r.inApp, 3);
  eq('the emails still go', r.emails, 3);
  eq('and the log names ENCRYPTION_KEY, which is the actual fix',
    r.errors.some(e => e.includes('ENCRYPTION_KEY')), true);
  process.env.ENCRYPTION_KEY = saved;
}

realLog('\n— no workspace installed —');
{
  await store.deleteWorkspace(ACCOUNT);
  const r = await notify();
  eq('no DM is sent', r.slack, 0);
  eq('the in-app rows still land', r.inApp, 3);
  eq('the emails still go', r.emails, 3);
  // The overwhelmingly common state. It is not a failure and must not read as
  // one in the logs, or a real problem will be invisible among the noise.
  eq('and NOTHING is logged — this is the ordinary case, not an error', r.errors, []);

  await installWorkspace();
  await store.saveUserLink({ accountId: ACCOUNT, parlayUserId: LINKED_ON, slackUserId: 'U-ON' });
  await store.saveUserLink({ accountId: ACCOUNT, parlayUserId: LINKED_OFF, slackUserId: 'U-OFF' });
}

realLog('\n— a user with no Slack link —');
{
  const r = await notify([UNLINKED]);
  eq('gets no DM', r.slack, 0);
  eq('  but still gets the in-app row', r.inApp, 1);
  eq('  and still gets the email', r.emails, 1);
  eq('  quietly', r.errors, []);
}

realLog('\n— a linked user whose Slack preference is off —');
{
  const r = await notify([LINKED_OFF]);
  eq('gets no DM', r.slack, 0);
  eq('  but still gets the in-app row', r.inApp, 1);
  eq('  and still gets the email', r.emails, 1);
  eq('  quietly', r.errors, []);
}

realLog('\n— a user with no preference row at all —');
{
  await tenant.execute({
    sql: `INSERT INTO users (id, email, password_hash, role, email_verified) VALUES (4, 'fresh@d.test', 'x', 'user', 1)`,
    args: [],
  });
  await store.saveUserLink({ accountId: ACCOUNT, parlayUserId: 4, slackUserId: 'U-FRESH' });
  const r = await notify([4]);
  // The whole constraint, arriving through the real dispatcher rather than
  // through slackRecipientsFor directly.
  eq('gets no DM, though note_tagged is opt-out for the other channels', r.slack, 0);
  eq('  and does get the in-app row, unchanged', r.inApp, 1);
  eq('  and the email, unchanged', r.emails, 1);
}

// ── The opt-in engine ────────────────────────────────────────────────────────

realLog('\n— the opt-in path delivers to Slack too —');
{
  await tenant.execute(`UPDATE notification_preferences SET note_comment_received = 1,
    note_comment_received_email = 1, note_comment_received_slack = 1 WHERE user_id = 1`);
  posted = []; emails = []; errors = [];
  const before = Number((await tenant.execute('SELECT COUNT(*) AS n FROM notifications')).rows[0].n);
  await notifications.notifyNoteComment(tenant, {
    noteId: 5, noteAuthorUserId: LINKED_ON, commenterUserId: 99, commenterName: 'Dana',
    commenterEmail: 'dana@d.test', commenterConfigId: null, previousCommenterUserIds: [],
    recordName: 'Acme', entityType: 'company', entityId: 7,
  });
  // notifyNoteComment calls createOptInNotifications WITHOUT awaiting it —
  // pre-existing, and true of the email path too. The in-app insert usually
  // wins the race; the email and the DM land after the caller has returned. So
  // this waits for the work to settle rather than pretending it is synchronous.
  for (let i = 0; i < 50 && posted.length === 0; i++) await new Promise(r => setTimeout(r, 20));
  const after = Number((await tenant.execute('SELECT COUNT(*) AS n FROM notifications')).rows[0].n);
  eq('the opted-in user gets a DM', posted.length, 1);
  eq('  and the in-app row', after - before, 1);
  eq('  and the email', emails.length, 1);
  eq('  and it carries the opt-in message and link',
    posted[0].text, 'Dana commented on your note about Acme\nhttps://parlay.test/companies/7');
}

// ── The account boundary ─────────────────────────────────────────────────────

realLog('\n— one recipient failing does not abandon the others —');
{
  // Two people have both asked for this event and linked their accounts. If the
  // first one's DM fails, the second must still get theirs: a per-recipient
  // problem — a departed user, a blip on one call — is not a reason to drop
  // everybody else's notification.
  await store.saveUserLink({ accountId: ACCOUNT, parlayUserId: UNLINKED, slackUserId: 'U-THIRD' });
  failOnlyFor = 'U-ON';
  const r = await notify();
  eq('the healthy recipient is still delivered to', posted.map(p => p.channel), ['D-U-THIRD']);
  eq('  the failure is logged against the right person',
    r.errors.some(e => e.includes('U-ON') && e.includes('ECONNRESET')), true);
  eq('  and nothing is logged against the healthy one',
    r.errors.some(e => e.includes('U-THIRD')), false);
  eq('  while the in-app rows still land', r.inApp, 3);
  eq('  and the emails still go', r.emails, 3);
  failOnlyFor = null;
  await store.deleteUserLink(ACCOUNT, UNLINKED);
}

realLog('\n— a client with no account —');
{
  // Master, or a client built by hand. users.id is an AUTOINCREMENT per
  // database, so without an account there is no way to say which person a link
  // belongs to — and guessing would deliver someone else's notification.
  const orphan = createClient({ url: `file:${join(dir, 'orphan.db')}` });
  await seedFreshDb(orphan);
  await orphan.execute(`INSERT INTO users (id, email, password_hash, role, email_verified) VALUES (1, 'o@d.test', 'x', 'user', 1)`);
  posted = []; errors = [];
  await notifications.createNotifications(orphan, {
    userIds: [1], type: 'company', recordId: 7, recordName: 'Acme', message: 'hi',
    changedByEmail: 'd@d.test', entityType: 'company', entityId: 7, prefKey: 'note_tagged',
  });
  eq('sends no Slack message', posted.length, 0);
  eq('  and logs nothing — an unregistered client is ordinary, not broken', errors, []);
  const rows = await orphan.execute('SELECT COUNT(*) AS n FROM notifications');
  eq('  while the in-app row still lands', Number(rows.rows[0].n), 1);
}

console.log = realLog;
console.error = realError;
realLog(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
