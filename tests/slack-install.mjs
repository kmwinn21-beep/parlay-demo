/**
 * A Slack install lands in the session's account, started by the session's user.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/slack-install.mjs
 *
 * This flow exists in the shape it does because its predecessors did not. The
 * deleted Google and Microsoft callbacks put `${user.id}:${user.accountId}` in
 * the state as plain text and authenticated nobody, so a code obtained by one
 * person could be posted back with somebody else's ids and write into that
 * person's tenant. See TENANT_DB_AUDIT.md.
 *
 * So the assertions that matter are not "does it install" but: a forged state
 * is refused, a stale one is refused, a state naming a different user is
 * refused, and a state naming a different ACCOUNT installs nothing there —
 * because the account comes from the session and the state is only ever
 * compared against it.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-slack-install-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
process.env.ENCRYPTION_KEY = 'd'.repeat(64);
process.env.SLACK_CLIENT_ID = 'test-client-id';
process.env.SLACK_CLIENT_SECRET = 'test-client-secret';
process.env.NEXT_PUBLIC_BASE_URL = 'https://parlay.test';
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

const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

const { signSlackState } = await import('@/lib/slack/state');
const store = await import('@/lib/slack/store');
const install = (await import('@/app/api/slack/install/route')).GET;
const callback = (await import('@/app/api/slack/oauth/callback/route')).GET;
const disconnectPOST = (await import('@/app/api/slack/disconnect/route')).POST;

const ACCOUNT = 'acct-installer';
const OTHER_ACCOUNT = 'acct-bystander';
const ADMIN = { id: 501, email: 'admin@installer.test', role: 'administrator', emailVerified: true, accountId: ACCOUNT };
const OTHER_ADMIN = { id: 502, email: 'admin2@installer.test', role: 'administrator', emailVerified: true, accountId: ACCOUNT };
const MEMBER = { id: 503, email: 'member@installer.test', role: 'user', emailVerified: true, accountId: ACCOUNT };
const OUTSIDER = { id: 504, email: 'admin@bystander.test', role: 'administrator', emailVerified: true, accountId: OTHER_ACCOUNT };

// Slack's token exchange, stubbed. The flow under test is ours, not Slack's.
const realFetch = globalThis.fetch;
let exchangeCalls = 0;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('slack.com/api/oauth.v2.access')) {
    exchangeCalls++;
    return new Response(JSON.stringify({
      ok: true,
      access_token: 'fixture-bot-credential-installed-9999',
      bot_user_id: 'U-BOT',
      team: { id: 'T-INSTALLED', name: 'Installer Inc' },
      // Returned whether or not user scopes were asked for — the installer's
      // own Slack id, which the install uses to link them for free.
      authed_user: { id: 'U-ADMIN-SLACK' },
    }), { headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, init);
};

async function request(url, user) {
  const headers = {};
  if (user) headers.cookie = `auth_token=${await signToken(user)}`;
  return new NextRequest(url, { headers });
}

/** Where a route sent the caller — the error/connected param is the observable outcome. */
function outcome(res) {
  const location = res.headers.get('location');
  if (!location) return `status ${res.status}`;
  const params = new URL(location).searchParams;
  return params.get('error') ?? (params.get('connected') ? `connected:${params.get('connected')}` : 'redirect');
}

const callbackUrl = (state, code = 'slack-auth-code') =>
  `https://parlay.test/api/slack/oauth/callback?code=${code}&state=${encodeURIComponent(state ?? '')}`;

// ── Starting the flow ────────────────────────────────────────────────────────

console.log('\n— who may start an install —');
{
  const res = await install(await request('https://parlay.test/api/slack/install', ADMIN));
  const location = res.headers.get('location') ?? '';
  eq('an admin is redirected to Slack', location.startsWith('https://slack.com/oauth/v2/authorize'), true);
  const params = new URL(location).searchParams;
  eq('  with the bot scopes and no channel-creation scope',
    params.get('scope'), 'chat:write,chat:write.public,channels:read,im:write');
  eq('  and a state', (params.get('state') ?? '').length > 20, true);
}
{
  const res = await install(await request('https://parlay.test/api/slack/install', MEMBER));
  eq('a non-admin cannot', outcome(res), 'slack_forbidden');
}
{
  const res = await install(await request('https://parlay.test/api/slack/install', null));
  eq('an anonymous caller cannot', outcome(res), 'slack_unauthorized');
}
{
  process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
  const res = await install(await request('https://parlay.test/api/slack/install', MEMBER));
  eq('demo mode does not promote a member into an installer', outcome(res), 'slack_forbidden');
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
}

// ── Finishing it ─────────────────────────────────────────────────────────────

console.log('\n— a state that is not ours is refused —');
{
  const res = await callback(await request(callbackUrl('not-a-real-state'), ADMIN));
  eq('an unsigned state is refused', outcome(res), 'slack_invalid_state');
}
{
  const res = await callback(await request(callbackUrl(null), ADMIN));
  eq('a missing state is refused', outcome(res), 'slack_invalid_state');
}
{
  // Correctly signed — with the wrong secret.
  const { SignJWT } = await import('jose');
  const forged = await new SignJWT({ accountId: ACCOUNT })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(String(ADMIN.id))
    .setAudience('slack-oauth-state').setIssuedAt().setExpirationTime('10m')
    .sign(new TextEncoder().encode('an-attacker-secret-of-adequate-length!!'));
  const res = await callback(await request(callbackUrl(forged), ADMIN));
  eq('a state signed with another secret is refused', outcome(res), 'slack_invalid_state');
}
{
  // Our secret, our shape — but issued for something else. Without an audience
  // check a session cookie would be a usable state.
  const sessionCookie = await signToken(ADMIN);
  const res = await callback(await request(callbackUrl(sessionCookie), ADMIN));
  eq('a session token replayed as a state is refused', outcome(res), 'slack_invalid_state');
}
{
  const { SignJWT } = await import('jose');
  const stale = await new SignJWT({ accountId: ACCOUNT })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(String(ADMIN.id))
    .setAudience('slack-oauth-state')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  const res = await callback(await request(callbackUrl(stale), ADMIN));
  eq('an expired state is refused', outcome(res), 'slack_invalid_state');
}

console.log('\n— the session must be the person who started it —');
{
  const state = await signSlackState({ accountId: ACCOUNT, userId: ADMIN.id });
  const res = await callback(await request(callbackUrl(state), OTHER_ADMIN));
  eq('another admin of the same account cannot finish it', outcome(res), 'slack_state_mismatch');
}
{
  const state = await signSlackState({ accountId: ACCOUNT, userId: ADMIN.id });
  const res = await callback(await request(callbackUrl(state), null));
  eq('an anonymous caller cannot finish it', outcome(res), 'slack_unauthorized');
}
{
  const state = await signSlackState({ accountId: ACCOUNT, userId: MEMBER.id });
  const res = await callback(await request(callbackUrl(state), MEMBER));
  eq('a member cannot finish one even with a state naming them', outcome(res), 'slack_forbidden');
}

console.log('\n— the account comes from the session, not the state —');
{
  // A genuinely signed state naming someone else's account, presented by an
  // admin of that account. Every signature checks out; the ids simply do not
  // agree, and that is what stops it.
  const state = await signSlackState({ accountId: ACCOUNT, userId: OUTSIDER.id });
  const before = await store.getWorkspace(ACCOUNT);
  const res = await callback(await request(callbackUrl(state), OUTSIDER));
  eq('a state naming another account is refused', outcome(res), 'slack_state_mismatch');
  eq('  and installs nothing there', await store.getWorkspace(ACCOUNT), before);
  eq('  nor in the caller\'s own account', await store.getWorkspace(OTHER_ACCOUNT), null);
}

console.log('\n— the legitimate flow —');
{
  const state = await signSlackState({ accountId: ACCOUNT, userId: ADMIN.id });
  const res = await callback(await request(callbackUrl(state), ADMIN));
  eq('installs', outcome(res), 'connected:slack');
  const ws = await store.getWorkspace(ACCOUNT);
  eq('  the workspace, attributed to the installer',
    [ws.teamId, ws.teamName, ws.botUserId, ws.installedByUserId],
    ['T-INSTALLED', 'Installer Inc', 'U-BOT', ADMIN.id]);
  eq('  with a usable token', await store.getBotToken(ACCOUNT), 'fixture-bot-credential-installed-9999');
  const row = await db.execute({ sql: `SELECT bot_token FROM slack_workspaces WHERE account_id = ?`, args: [ACCOUNT] });
  eq('  stored encrypted', String(row.rows[0].bot_token).startsWith('v1.'), true);
  eq('  and only in that account', await store.getWorkspace(OTHER_ACCOUNT), null);
  const link = await store.getUserLink(ACCOUNT, ADMIN.id);
  eq('  and links the installer, who Slack already identified',
    [link.parlayUserId, link.slackUserId], [ADMIN.id, 'U-ADMIN-SLACK']);
  eq('  and nobody else', (await store.listUserLinks(ACCOUNT)).length, 1);
}
{
  // A state is a bearer value for one install; nothing here makes it single-use,
  // so this documents what is true rather than implying more.
  const state = await signSlackState({ accountId: ACCOUNT, userId: ADMIN.id });
  await callback(await request(callbackUrl(state), ADMIN));
  const rows = await db.execute({ sql: `SELECT COUNT(*) AS n FROM slack_workspaces WHERE account_id = ?`, args: [ACCOUNT] });
  eq('reinstalling replaces rather than accumulating', Number(rows.rows[0].n), 1);
}

console.log('\n— Slack refusing the exchange —');
{
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'invalid_code' }),
    { headers: { 'Content-Type': 'application/json' } });
  const state = await signSlackState({ accountId: OTHER_ACCOUNT, userId: OUTSIDER.id });
  const res = await callback(await request(callbackUrl(state), OUTSIDER));
  eq('is an error param, not a 500', outcome(res), 'slack_exchange_failed');
  eq('  and installs nothing', await store.getWorkspace(OTHER_ACCOUNT), null);
  globalThis.fetch = previous;
}
{
  const state = await signSlackState({ accountId: ACCOUNT, userId: ADMIN.id });
  const res = await callback(await request(
    'https://parlay.test/api/slack/oauth/callback?error=access_denied&state=' + encodeURIComponent(state), ADMIN));
  eq('a declined consent screen is an error param too', outcome(res), 'slack_denied');
}

// ── Disconnect ───────────────────────────────────────────────────────────────

console.log('\n— disconnecting —');
{
  await store.saveUserLink({ accountId: ACCOUNT, parlayUserId: ADMIN.id, slackUserId: 'U-ADMIN' });
  const res = await disconnectPOST(await request('https://parlay.test/api/slack/disconnect', MEMBER));
  eq('a member cannot disconnect', res.status, 403);
  eq('  and the workspace survives', (await store.getWorkspace(ACCOUNT)).teamId, 'T-INSTALLED');
}
{
  const res = await disconnectPOST(await request('https://parlay.test/api/slack/disconnect', null));
  eq('an anonymous caller cannot', res.status, 401);
}
{
  const res = await disconnectPOST(await request('https://parlay.test/api/slack/disconnect', ADMIN));
  eq('an admin can', res.status, 200);
  eq('  the workspace is gone', await store.getWorkspace(ACCOUNT), null);
  eq('  and its user links with it', (await store.listUserLinks(ACCOUNT)).length, 0);
}

console.log(`\n${pass} passed, ${fail} failed  (Slack exchanges: ${exchangeCalls})\n`);
process.exit(fail === 0 ? 0 : 1);
