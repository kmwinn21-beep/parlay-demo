/**
 * Admin > Usage has to count single sign-on, not just password logins.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/sso-login-tracking.mjs
 *
 * user_sessions was written in exactly five places, all of them password
 * routes: /api/auth/login, accept-invite, verify-email, setup, trial-signup.
 * Production signs in through Clerk, which reaches none of them — Clerk
 * issues the session on its own domain and the app only ever meets an
 * existing one. So nothing was ever recorded for an SSO account, and the
 * Usage tab read "Never" for people who are in the product every day. The
 * rows that did exist were the one-off invite acceptances, which is why
 * several users showed exactly 1, dated the day they joined.
 *
 * An SSO session therefore has to be recorded where it is SEEN rather than
 * where it is made — which means the same session arrives again on every
 * request, and the count must not grow with traffic. That is what the unique
 * session key is for, and most of this file is about it.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-sso-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
delete process.env.CLERK_SECRET_KEY;
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

const { createClient } = await import('@libsql/client');
const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
const { recordSessionOnce, touchLastSeen } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

const ACCOUNT = 'acct-sso';
const tenantUrl = `file:${join(dir, 'tenant.db')}`;
const tenant = createClient({ url: tenantUrl });
await seedFreshDb(tenant);
await db.execute({
  sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
        VALUES (?, 'SSO Co', 'admin@sso.test', ?, '')`,
  args: [ACCOUNT, tenantUrl],
});

const KEVIN = 1600;   // signs in through SSO, every day
const DANA = 1601;    // accepted an invite once, months ago
await tenant.execute({
  sql: `INSERT INTO users (id, email, password_hash, role, active) VALUES (?, 'kevin@sso.test', 'x', 'administrator', 1)`,
  args: [KEVIN],
});
await tenant.execute({
  sql: `INSERT INTO users (id, email, password_hash, role, active) VALUES (?, 'dana@sso.test', 'x', 'user', 1)`,
  args: [DANA],
});

const sessionsFor = async (id) => Number((await tenant.execute({
  sql: 'SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = ?', args: [id],
})).rows[0].n);
const lastSeen = async (id) => (await tenant.execute({
  sql: 'SELECT last_seen_at FROM users WHERE id = ?', args: [id],
})).rows[0].last_seen_at ?? null;

console.log('\n— one row per session, however many requests it serves —');
{
  eq('nothing recorded to begin with', await sessionsFor(KEVIN), 0);
  eq('  and no activity stamp either', await lastSeen(KEVIN), null);

  const first = await recordSessionOnce(tenant, KEVIN, 'sess_morning', { ip: '203.0.113.9', userAgent: 'Chrome' });
  eq('the first sight of a session writes it', first, true);
  eq('  one row', await sessionsFor(KEVIN), 1);
  eq('  and stamps them as seen', (await lastSeen(KEVIN)) != null, true);

  // The same session, met again on the next request — and the one after that.
  const second = await recordSessionOnce(tenant, KEVIN, 'sess_morning', { ip: '203.0.113.9' });
  const third = await recordSessionOnce(tenant, KEVIN, 'sess_morning', { ip: '203.0.113.9' });
  eq('meeting it again records nothing', [second, third], [false, false]);
  eq('  and the count stays at one', await sessionsFor(KEVIN), 1);

  // A real second sign-in: a new session id.
  eq('a new session is a new login', await recordSessionOnce(tenant, KEVIN, 'sess_tuesday'), true);
  eq('  counted separately', await sessionsFor(KEVIN), 2);

  // What is kept about it.
  const row = (await tenant.execute({
    sql: `SELECT ip_address, user_agent, session_key FROM user_sessions WHERE session_key = 'sess_morning'`,
  })).rows[0];
  eq('the row carries where it came from',
    [row.ip_address, row.user_agent, row.session_key], ['203.0.113.9', 'Chrome', 'sess_morning']);
}

console.log('\n— the unique key is the database\'s own guard —');
{
  /*
   * The in-memory set in lib/clerkAuth.ts stops most repeat writes, but it is
   * per server instance: on another instance the same session looks new. The
   * UNIQUE index is what makes that harmless rather than a second login.
   */
  const idx = (await tenant.execute(`PRAGMA index_list(user_sessions)`)).rows
    .find(r => String(r.name) === 'idx_user_sessions_key');
  eq('the index exists', !!idx, true);
  eq('  and is unique', Number(idx?.unique), 1);

  // Which must not have broken the rows that were already there. SQLite lets
  // a unique index hold any number of NULLs, and every password-login row
  // written before this has one.
  await tenant.execute({ sql: `INSERT INTO user_sessions (user_id) VALUES (?)`, args: [DANA] });
  await tenant.execute({ sql: `INSERT INTO user_sessions (user_id) VALUES (?)`, args: [DANA] });
  eq('two keyless rows coexist', await sessionsFor(DANA), 2);
}

console.log('\n— and it does not depend on that index existing —');
{
  /*
   * Measured, not assumed: a database that reaches the current schema
   * version through the column reconciler gets the column and no index — the
   * reconciler repairs columns only, which is the same gap that once left a
   * table missing entirely. With no index, INSERT OR IGNORE never collides,
   * so a session seen on a second server instance would add a login on every
   * request. Hence the read before the write.
   */
  await tenant.execute('DROP INDEX IF EXISTS idx_user_sessions_key');
  const before = await sessionsFor(KEVIN);
  const again = await recordSessionOnce(tenant, KEVIN, 'sess_morning');
  eq('a known session is still only recorded once', again, false);
  eq('  with no row added', await sessionsFor(KEVIN), before);
  // Put it back for the rest of the file.
  await tenant.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_key ON user_sessions(session_key)');
}

console.log('\n— a password login still writes the way it did —');
{
  const { recordUserSession } = await import('@/lib/auth');
  const before = await sessionsFor(DANA);
  await recordUserSession(tenant, DANA, new NextRequest('https://parlay.test/api/auth/login', {
    method: 'POST', headers: { 'user-agent': 'Safari' },
  }));
  eq('one more row', await sessionsFor(DANA), before + 1);
  eq('  and it is stamped as seen', (await lastSeen(DANA)) != null, true);
}

console.log('\n— activity is not the same question as signing in —');
{
  /*
   * With SSO a session lasts weeks, so "last signed in" stops meaning "last
   * here". The activity stamp moves on its own; the sessions do not.
   */
  await tenant.execute({ sql: `UPDATE users SET last_seen_at = '2020-01-01 00:00:00' WHERE id = ?`, args: [KEVIN] });
  const sessionsBefore = await sessionsFor(KEVIN);
  await touchLastSeen(tenant, KEVIN);
  eq('a touch moves the stamp', (await lastSeen(KEVIN)).startsWith('2020') === false, true);
  eq('  without inventing a login', await sessionsFor(KEVIN), sessionsBefore);
}

console.log('\n— what the Usage tab is handed —');
{
  const cookie = `auth_token=${await signToken({
    id: KEVIN, email: 'kevin@sso.test', role: 'administrator', emailVerified: true, accountId: ACCOUNT,
  })}`;
  const route = await import('@/app/api/admin/usage/route');
  const body = await (await route.GET(
    new NextRequest('https://parlay.test/api/admin/usage', { headers: { cookie } }),
  )).json();
  const kevin = body.users.find(u => u.email === 'kevin@sso.test');

  eq('the login count is sessions, not requests', kevin.total_logins, 2);
  // The two dates, which is what the column header was promising and the
  // table could not deliver.
  eq('  a last login, taken from the newest session', typeof kevin.last_login_at, 'string');
  eq('  and a last active, taken from the stamp', typeof kevin.last_seen_at, 'string');

  // A user with no session at all is the one case that is genuinely "Never".
  await tenant.execute({
    sql: `INSERT INTO users (id, email, password_hash, role, active) VALUES (1602, 'new@sso.test', 'x', 'user', 1)`,
  });
  const after = await (await route.GET(
    new NextRequest('https://parlay.test/api/admin/usage', { headers: { cookie } }),
  )).json();
  const newcomer = after.users.find(u => u.email === 'new@sso.test');
  eq('somebody who has never signed in has no date', [newcomer.last_login_at, newcomer.total_logins], [null, 0]);
}

// ── Where the recording is wired in ──────────────────────────────────────────

console.log('\n— the one place an SSO session can be caught —');
{
  const clerk = strip('lib/clerkAuth.ts');
  eq('the bridge reads the session id', /const \{ userId, sessionId, sessionClaims \} = await auth\(\);/.test(clerk), true);
  // Both return paths: the happy one, and the fallback that reads live
  // publicMetadata when the JWT template has not filled the claims in.
  eq('  and records on both of its exits',
    (clerk.match(/await noteSession\(/g) ?? []).length, 2);
  eq('  keyed by that session id', /recordSessionOnce\(db, user\.id, sessionId/.test(clerk), true);
  /*
   * Awaited, not fired and forgotten: an un-awaited write races the
   * serverless function freezing after its response, which is how the
   * original notification writes were lost.
   */
  eq('  awaited, so a freezing function cannot drop it', /await noteSession\(sessionUser, sessionId\);\s*return sessionUser;/.test(clerk), true);
  // And it costs nothing on the requests after the first.
  eq('  skipping the database for a session already seen',
    /if \(!fresh && !stale\) return;/.test(clerk), true);
  eq('  with the activity stamp throttled rather than written per request',
    /TOUCH_INTERVAL_MS = 15 \* 60 \* 1000/.test(clerk), true);
  // Nothing here may take a request down with it.
  eq('  and never failing the request it is measuring', /catch \(err\) \{[\s\S]{0,200}could not record the SSO session/.test(clerk), true);
}

console.log('\n— and the table that shows it —');
{
  const admin = strip('app/admin/page.tsx');
  eq('Last Login comes from the sessions', /\{ key: 'last_login_at', label: 'Last Login' \}/.test(admin), true);
  eq('  beside Last Active, which is the stamp', /\{ key: 'last_seen_at', label: 'Last Active' \}/.test(admin), true);
  /*
   * The old cell printed "Never" whenever total_logins was 0 — over whatever
   * date the row actually held. It now says Never only when there is no
   * date to show.
   */
  eq('"Never" now means no session, not a count of zero',
    /\{u\.last_login_at \? fmtDate\(u\.last_login_at\) : <span className="text-gray-300">Never<\/span>\}/.test(admin), true);
  eq('  and the old count-driven cell is gone',
    /u\.total_logins === 0 \? <span className="text-gray-300">Never<\/span>/.test(admin), false);

  // The refresh control, above the table.
  eq('there is a Refresh button', /\{refreshing \? 'Refreshing…' : 'Refresh'\}/.test(admin), true);
  eq('  that re-reads rather than being served the cached answer',
    /fetch\('\/api\/admin\/usage', \{ cache: 'no-store' \}\)/.test(admin), true);
  // A refresh keeps the table on screen; only the first load gets a spinner.
  eq('  keeping the table on screen while it works',
    /if \(opts\.manual\) setRefreshing\(true\); else setLoading\(true\);/.test(admin), true);
  eq('  and saying when the figures were read', /As of \$\{loadedAt\.toLocaleTimeString/.test(admin), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
