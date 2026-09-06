/**
 * An impersonation session scopes a request only for the admin it belongs to.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/impersonation-scope.mjs
 *
 * `requireAuth` reads `x-ops-impersonation-id` and, when it names a live row in
 * `impersonation_sessions`, replaces the caller's `accountId` with that
 * session's. Every route then hands that to `getDb(...)`, so the header selects
 * the tenant database for the rest of the request.
 *
 * Middleware sets that header from the `ops_impersonation` cookie — but it
 * strips no inbound copy, so a client can supply its own. And the lookup asks
 * only whether the session is live: not whether it belongs to the caller, and
 * not whether the caller is an ops admin at all. `admin_user_id` is stored on
 * the row and read nowhere.
 *
 * So the tests below hand `requireAuth` a header naming a session the caller
 * does not own, and assert the caller stays in their own account.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-imp-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
// Demo mode elevates every caller to administrator; not what is under test.
delete process.env.NEXT_PUBLIC_DEMO_MODE;
// Clerk would take over session resolution and ignore the signed cookie.
delete process.env.CLERK_SECRET_KEY;
// The env allow-list is a separate route into ops admin; exercised on its own.
delete process.env.OPS_ADMIN_EMAILS;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken, requireAuth } = await import('@/lib/auth');
await dbReady;
// The master bootstrap is lock-guarded and geared to a long-lived process;
// seeding through the app's own schema builder gives this file the same tables
// production has, without depending on that path.
await seedFreshDb(db);

// ── Cast ─────────────────────────────────────────────────────────────────────
// Ops admins live in the master database; is_admin is what grants ops access.
const ADMIN = { id: 8001, email: 'ops@parlay.test', role: 'administrator', emailVerified: true, accountId: undefined };
const OTHER_ADMIN = { id: 8002, email: 'ops2@parlay.test', role: 'administrator', emailVerified: true, accountId: undefined };
const TENANT_USER = { id: 8003, email: 'rando@tenant.test', role: 'user', emailVerified: true, accountId: 'acct-attacker' };
const DEMOTED = { id: 8004, email: 'former@parlay.test', role: 'administrator', emailVerified: true, accountId: undefined };

const VICTIM_ACCOUNT = 'acct-victim';

for (const [u, isAdmin] of [[ADMIN, 1], [OTHER_ADMIN, 1], [TENANT_USER, 0], [DEMOTED, 0]]) {
  await db.execute({
    sql: `INSERT INTO users (id, email, password_hash, role, active, is_admin) VALUES (?, ?, 'x', ?, 1, ?)`,
    args: [u.id, u.email, u.role, isAdmin],
  });
}

const SESSION_ID = '11111111-2222-3333-4444-555555555555';
await db.execute({
  sql: `INSERT INTO impersonation_sessions (id, admin_user_id, account_id) VALUES (?, ?, ?)`,
  args: [SESSION_ID, ADMIN.id, VICTIM_ACCOUNT],
});
// A session belonging to someone whose ops access has since been revoked.
const DEMOTED_SESSION_ID = '99999999-8888-7777-6666-555555555555';
await db.execute({
  sql: `INSERT INTO impersonation_sessions (id, admin_user_id, account_id) VALUES (?, ?, ?)`,
  args: [DEMOTED_SESSION_ID, DEMOTED.id, VICTIM_ACCOUNT],
});

/** A request carrying `user`'s signed session cookie, plus any headers. */
async function requestAs(user, headers = {}) {
  const token = await signToken(user);
  return new NextRequest('https://parlay.test/api/companies', {
    headers: { ...headers, cookie: `auth_token=${token}` },
  });
}

/** The accountId requireAuth resolves, or the HTTP status if it refused. */
async function scopeOf(request) {
  const result = await requireAuth(request);
  if (result && typeof result.status === 'number') return `HTTP ${result.status}`;
  return result.accountId ?? null;
}

// ── The exploit ──────────────────────────────────────────────────────────────

console.log('\n— a forged header must not move the caller between accounts —');
{
  const req = await requestAs(TENANT_USER, { 'x-ops-impersonation-id': SESSION_ID });
  eq('a tenant user naming an admin\'s live session stays in their own account',
    await scopeOf(req), 'acct-attacker');
}
{
  const req = await requestAs(OTHER_ADMIN, { 'x-ops-impersonation-id': SESSION_ID });
  eq('an ops admin cannot borrow another admin\'s session',
    await scopeOf(req), null);
}
{
  // Ops access revoked since the session was opened. The row is still live.
  const req = await requestAs(DEMOTED, { 'x-ops-impersonation-id': DEMOTED_SESSION_ID });
  eq('a user who is no longer an ops admin cannot use their own session',
    await scopeOf(req), null);
}

console.log('\n— the legitimate flow still works —');
{
  // Middleware sets this header from the ops_impersonation cookie, so for
  // requireAuth the legitimate path and the forged one look identical. What
  // separates them is whose session it is.
  const req = await requestAs(ADMIN, { 'x-ops-impersonation-id': SESSION_ID });
  eq('the admin who opened the session is scoped to it', await scopeOf(req), VICTIM_ACCOUNT);
}
{
  const req = await requestAs(ADMIN);
  eq('and is unscoped without the header', await scopeOf(req), null);
}

console.log('\n— sessions that are no longer usable —');
{
  await db.execute({ sql: `UPDATE impersonation_sessions SET ended_at = datetime('now') WHERE id = ?`, args: [SESSION_ID] });
  const req = await requestAs(ADMIN, { 'x-ops-impersonation-id': SESSION_ID });
  eq('an ended session no longer scopes anything', await scopeOf(req), null);
  await db.execute({ sql: `UPDATE impersonation_sessions SET ended_at = NULL WHERE id = ?`, args: [SESSION_ID] });
}
{
  await db.execute({
    sql: `UPDATE impersonation_sessions SET last_active_at = datetime('now', '-61 minutes') WHERE id = ?`,
    args: [SESSION_ID],
  });
  const req = await requestAs(ADMIN, { 'x-ops-impersonation-id': SESSION_ID });
  eq('a session idle past its window no longer scopes anything', await scopeOf(req), null);
  await db.execute({ sql: `UPDATE impersonation_sessions SET last_active_at = datetime('now') WHERE id = ?`, args: [SESSION_ID] });
}
{
  const req = await requestAs(ADMIN, { 'x-ops-impersonation-id': 'not-a-real-session' });
  eq('an unknown session id scopes nothing', await scopeOf(req), null);
}

// ── The second lock: headers a client must not be able to supply ────────────
// requireAuth now refuses a session that is not the caller's. The other half is
// that a client-supplied header never reaches a handler at all, so the only
// header a handler ever sees is one middleware set from the cookie.
//
// The helper is tested rather than middleware itself: middleware.ts imports
// @clerk/nextjs/server at load, which does not resolve outside the bundler.

const { sanitizeForwardedHeaders, STRIPPED_REQUEST_HEADERS } = await import('@/lib/requestHeaders');

console.log('\n— a client-supplied header is stripped before forwarding —');
{
  const h = sanitizeForwardedHeaders(new Headers({ 'x-ops-impersonation-id': SESSION_ID }));
  eq('a forged header does not reach the handler', h.get('x-ops-impersonation-id'), null);
}
{
  const h = sanitizeForwardedHeaders(new Headers(), { 'x-ops-impersonation-id': SESSION_ID });
  eq('middleware\'s own value is still set', h.get('x-ops-impersonation-id'), SESSION_ID);
}
{
  // Both present: the trusted value wins, because stripping happens first.
  const h = sanitizeForwardedHeaders(
    new Headers({ 'x-ops-impersonation-id': 'forged-by-the-client' }),
    { 'x-ops-impersonation-id': SESSION_ID },
  );
  eq('  and overrides a forged one rather than colliding with it',
    h.get('x-ops-impersonation-id'), SESSION_ID);
}
{
  const h = sanitizeForwardedHeaders(new Headers({ 'x-forwarded-for': '203.0.113.9', cookie: 'a=b' }));
  eq('headers it does not own are left alone',
    [h.get('x-forwarded-for'), h.get('cookie')], ['203.0.113.9', 'a=b']);
}
{
  eq('the strip-list names the header requireAuth trusts',
    STRIPPED_REQUEST_HEADERS.includes('x-ops-impersonation-id'), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
