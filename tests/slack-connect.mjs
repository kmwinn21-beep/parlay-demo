/**
 * One person links their own Slack account — to the workspace their account
 * installed, and to no other.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/slack-connect.mjs
 *
 * This flow inherits the four checks the install callback runs (tests/slack-
 * install.mjs, TENANT_DB_AUDIT.md) and adds two surfaces of its own:
 *
 *   THE AUDIENCE SEPARATION. The install state and the connect state are signed
 *   with the same secret and have the same shape. Only `aud` distinguishes
 *   them. If it did not, any member could take the connect state they are
 *   entitled to and present it where a workspace gets installed. Both
 *   directions are asserted.
 *
 *   THE TEAM CHECK. Slack will issue a perfectly valid Sign in with Slack token
 *   for a user in a workspace that has nothing to do with this account. A link
 *   naming them would read as connected and be undeliverable forever, because
 *   the bot that sends lives in the other workspace.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-slack-connect-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
process.env.ENCRYPTION_KEY = 'e'.repeat(64);
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
const { SignJWT } = await import('jose');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

const { signSlackState, signSlackConnectState } = await import('@/lib/slack/state');
const store = await import('@/lib/slack/store');
const connect = (await import('@/app/api/slack/connect/route')).GET;
const connectCallback = (await import('@/app/api/slack/connect/callback/route')).GET;
const disconnectMe = (await import('@/app/api/slack/disconnect/me/route')).POST;
const installCallback = (await import('@/app/api/slack/oauth/callback/route')).GET;
const slackStatus = (await import('@/app/api/slack/status/route')).GET;

const ACCOUNT = 'acct-home';
const OTHER_ACCOUNT = 'acct-elsewhere';
const BARE_ACCOUNT = 'acct-uninstalled';

const MEMBER = { id: 601, email: 'member@home.test', role: 'user', emailVerified: true, accountId: ACCOUNT };
const COLLEAGUE = { id: 602, email: 'colleague@home.test', role: 'user', emailVerified: true, accountId: ACCOUNT };
const ADMIN = { id: 603, email: 'admin@home.test', role: 'administrator', emailVerified: true, accountId: ACCOUNT };
const OUTSIDER = { id: 604, email: 'member@elsewhere.test', role: 'user', emailVerified: true, accountId: OTHER_ACCOUNT };
const UNINSTALLED = { id: 605, email: 'member@uninstalled.test', role: 'user', emailVerified: true, accountId: BARE_ACCOUNT };

await store.saveWorkspace({
  accountId: ACCOUNT, teamId: 'T-HOME', teamName: 'Home Inc',
  botToken: 'fixture-bot-credential-home', botUserId: 'U-BOT-HOME', installedByUserId: ADMIN.id,
});
await store.saveWorkspace({
  accountId: OTHER_ACCOUNT, teamId: 'T-ELSEWHERE', teamName: 'Elsewhere Ltd',
  botToken: 'fixture-bot-credential-elsewhere', botUserId: 'U-BOT-ELSE', installedByUserId: OUTSIDER.id,
});
// BARE_ACCOUNT deliberately has none.

// ── Slack's OpenID token endpoint, stubbed ───────────────────────────────────
// The id_token is a real JWT because the route decodes one; its signature is
// never checked (OIDC Core §3.1.3.7 — it arrives over our own TLS POST), so the
// key here is arbitrary. `aud` is not arbitrary: the route checks it.
let idToken = { sub: 'U-MEMBER-SLACK', teamId: 'T-HOME', aud: 'test-client-id' };
let tokenResponse = null; // set to override the whole body

async function makeIdToken() {
  return new SignJWT({ 'https://slack.com/team_id': idToken.teamId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(idToken.sub)
    .setAudience(idToken.aud)
    .setIssuer('https://slack.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode('slack-signing-key-not-checked-by-us!!'));
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (target.includes('slack.com/api/openid.connect.token')) {
    const body = tokenResponse ?? { ok: true, access_token: 'fixture-user-credential', id_token: await makeIdToken() };
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  }
  if (target.includes('slack.com/api/oauth.v2.access')) {
    return new Response(JSON.stringify({
      ok: true, access_token: 'fixture-bot-credential-home', bot_user_id: 'U-BOT-HOME',
      team: { id: 'T-HOME', name: 'Home Inc' },
    }), { headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, init);
};

async function request(url, user) {
  const headers = {};
  if (user) headers.cookie = `auth_token=${await signToken(user)}`;
  return new NextRequest(url, { headers });
}

function outcome(res) {
  const location = res.headers.get('location');
  if (!location) return `status ${res.status}`;
  const params = new URL(location).searchParams;
  return params.get('error') ?? (params.get('connected') ? `connected:${params.get('connected')}` : 'redirect');
}

const cbUrl = (state, code = 'slack-user-code') =>
  `https://parlay.test/api/slack/connect/callback?code=${code}&state=${encodeURIComponent(state ?? '')}`;

// ── Starting ─────────────────────────────────────────────────────────────────

console.log('\n— who may connect —');
{
  const res = await connect(await request('https://parlay.test/api/slack/connect', MEMBER));
  const location = res.headers.get('location') ?? '';
  eq('an ordinary member may — no role check', location.startsWith('https://slack.com/openid/connect/authorize'), true);
  const params = new URL(location).searchParams;
  eq('  asking only for sign-in scopes', params.get('scope'), 'openid profile email');
  eq('  as an authorization code request', params.get('response_type'), 'code');
  eq('  with its own redirect uri', params.get('redirect_uri'), 'https://parlay.test/api/slack/connect/callback');
  eq('  and a state', (params.get('state') ?? '').length > 20, true);
}
{
  const res = await connect(await request('https://parlay.test/api/slack/connect', null));
  eq('an anonymous caller may not', outcome(res), 'slack_unauthorized');
}
{
  // The whole point of guarding here: this is refused BEFORE Slack is involved,
  // so the user is told their account has no workspace rather than bouncing off
  // a consent screen into an opaque failure.
  const res = await connect(await request('https://parlay.test/api/slack/connect', UNINSTALLED));
  eq('with no workspace installed the flow does not start', outcome(res), 'slack_no_workspace');
  eq('  and Slack is never reached', res.headers.get('location').includes('slack.com'), false);
}

// ── The two audiences ────────────────────────────────────────────────────────

console.log('\n— an install state and a connect state are not interchangeable —');
{
  // Signed by us, unexpired, naming the right person — and for the other flow.
  const installState = await signSlackState({ accountId: ACCOUNT, userId: ADMIN.id });
  const res = await connectCallback(await request(cbUrl(installState), ADMIN));
  eq('an install state is refused at the connect callback', outcome(res), 'slack_invalid_state');
}
{
  // The direction that matters more: a member holds a connect state legitimately.
  const connectState = await signSlackConnectState({ accountId: ACCOUNT, userId: ADMIN.id });
  const url = `https://parlay.test/api/slack/oauth/callback?code=c&state=${encodeURIComponent(connectState)}`;
  const before = await store.getWorkspace(ACCOUNT);
  const res = await installCallback(await request(url, ADMIN));
  eq('a connect state is refused at the install callback', outcome(res), 'slack_invalid_state');
  eq('  and installs nothing', await store.getWorkspace(ACCOUNT), before);

  // Defence in depth: were the audiences ever merged, the admin check would
  // still stand between a member and an install. This asserts the second layer
  // rather than the audience, and stays green under the audience mutations.
  const memberState = await signSlackConnectState({ accountId: ACCOUNT, userId: MEMBER.id });
  const memberUrl = `https://parlay.test/api/slack/oauth/callback?code=c&state=${encodeURIComponent(memberState)}`;
  const memberRes = await installCallback(await request(memberUrl, MEMBER));
  eq('  and a member is stopped twice over', ['slack_invalid_state', 'slack_forbidden'].includes(outcome(memberRes)), true);
}

{
  // The other direction, which the audience does NOT cover: verifyToken calls
  // jwtVerify with no audience option, so a state's `aud` does not bother it.
  // What refuses it is that a state carries no email and no role, both of which
  // verifyToken requires. Pinned here because that makes adding either claim to
  // a state a silent way to mint a seven-day session cookie.
  const { verifyToken } = await import('@/lib/auth');
  const installState = await signSlackState({ accountId: ACCOUNT, userId: ADMIN.id });
  const connectState = await signSlackConnectState({ accountId: ACCOUNT, userId: MEMBER.id });
  eq('neither state is usable as a session cookie',
    [await verifyToken(installState), await verifyToken(connectState)], [null, null]);
}

console.log('\n— a state that is not ours is refused —');
{
  const res = await connectCallback(await request(cbUrl('not-a-real-state'), MEMBER));
  eq('an unsigned state is refused', outcome(res), 'slack_invalid_state');
}
{
  const res = await connectCallback(await request(cbUrl(null), MEMBER));
  eq('a missing state is refused', outcome(res), 'slack_invalid_state');
}
{
  const forged = await new SignJWT({ accountId: ACCOUNT })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(String(MEMBER.id))
    .setAudience('slack-user-connect').setIssuedAt().setExpirationTime('10m')
    .sign(new TextEncoder().encode('an-attacker-secret-of-adequate-length!!'));
  const res = await connectCallback(await request(cbUrl(forged), MEMBER));
  eq('a state signed with another secret is refused', outcome(res), 'slack_invalid_state');
}
{
  const stale = await new SignJWT({ accountId: ACCOUNT })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(String(MEMBER.id))
    .setAudience('slack-user-connect')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  const res = await connectCallback(await request(cbUrl(stale), MEMBER));
  eq('an expired state is refused', outcome(res), 'slack_invalid_state');
}
{
  const sessionCookie = await signToken(MEMBER);
  const res = await connectCallback(await request(cbUrl(sessionCookie), MEMBER));
  eq('a session token replayed as a state is refused', outcome(res), 'slack_invalid_state');
}

console.log('\n— the session is the authority on who and where —');
{
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: MEMBER.id });
  const res = await connectCallback(await request(cbUrl(state), COLLEAGUE));
  eq('a state naming someone else is refused', outcome(res), 'slack_state_mismatch');
  eq('  and links neither of them',
    [await store.getUserLink(ACCOUNT, MEMBER.id), await store.getUserLink(ACCOUNT, COLLEAGUE.id)], [null, null]);
}
{
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: OUTSIDER.id });
  const res = await connectCallback(await request(cbUrl(state), OUTSIDER));
  eq('a state naming another account is refused', outcome(res), 'slack_state_mismatch');
  eq('  and links nothing there', await store.getUserLink(ACCOUNT, OUTSIDER.id), null);
  eq('  nor in the caller\'s own account', await store.getUserLink(OTHER_ACCOUNT, OUTSIDER.id), null);
}
{
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: MEMBER.id });
  const res = await connectCallback(await request(cbUrl(state), null));
  eq('an anonymous caller cannot finish it', outcome(res), 'slack_unauthorized');
}

// ── The team check ───────────────────────────────────────────────────────────

console.log('\n— the Slack user must be in the account\'s workspace —');
{
  idToken = { sub: 'U-STRANGER', teamId: 'T-SOMEWHERE-ELSE', aud: 'test-client-id' };
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: MEMBER.id });
  const res = await connectCallback(await request(cbUrl(state), MEMBER));
  eq('a user from another workspace is refused', outcome(res), 'slack_wrong_workspace');
  eq('  and no link is written', await store.getUserLink(ACCOUNT, MEMBER.id), null);
}
{
  // Not a different workspace but a different Slack APP: a token minted for
  // someone else's client id, which TLS to slack.com says nothing about.
  idToken = { sub: 'U-MEMBER-SLACK', teamId: 'T-HOME', aud: 'someone-elses-client-id' };
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: MEMBER.id });
  const res = await connectCallback(await request(cbUrl(state), MEMBER));
  eq('an id_token for another Slack app is refused', outcome(res), 'slack_exchange_failed');
  eq('  and no link is written', await store.getUserLink(ACCOUNT, MEMBER.id), null);
  idToken = { sub: 'U-MEMBER-SLACK', teamId: 'T-HOME', aud: 'test-client-id' };
}

// ── The legitimate flow ──────────────────────────────────────────────────────

console.log('\n— connecting —');
{
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: MEMBER.id });
  const res = await connectCallback(await request(cbUrl(state), MEMBER));
  eq('links', outcome(res), 'connected:slack');
  const link = await store.getUserLink(ACCOUNT, MEMBER.id);
  eq('  under (account_id, parlay_user_id)',
    [link.accountId, link.parlayUserId, link.slackUserId], [ACCOUNT, MEMBER.id, 'U-MEMBER-SLACK']);
  eq('  exactly one row', (await store.listUserLinks(ACCOUNT)).length, 1);
  // users.id is an AUTOINCREMENT per database, so 601 exists in other accounts
  // and is someone else there. The link must not be visible from one of them.
  eq('  and nothing under the same user id elsewhere', await store.getUserLink(OTHER_ACCOUNT, MEMBER.id), null);
}
{
  idToken = { sub: 'U-MEMBER-SLACK-NEW', teamId: 'T-HOME', aud: 'test-client-id' };
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: MEMBER.id });
  await connectCallback(await request(cbUrl(state), MEMBER));
  const rows = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM slack_user_links WHERE account_id = ? AND parlay_user_id = ?`,
    args: [ACCOUNT, MEMBER.id],
  });
  eq('relinking replaces rather than duplicating', Number(rows.rows[0].n), 1);
  eq('  with the newer Slack id', (await store.getUserLink(ACCOUNT, MEMBER.id)).slackUserId, 'U-MEMBER-SLACK-NEW');
}
{
  tokenResponse = { ok: false, error: 'invalid_code' };
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: COLLEAGUE.id });
  const res = await connectCallback(await request(cbUrl(state), COLLEAGUE));
  eq('Slack refusing the exchange is an error param, not a 500', outcome(res), 'slack_exchange_failed');
  eq('  and links nothing', await store.getUserLink(ACCOUNT, COLLEAGUE.id), null);
  tokenResponse = null;
}
{
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: COLLEAGUE.id });
  const res = await connectCallback(await request(
    `https://parlay.test/api/slack/connect/callback?error=access_denied&state=${encodeURIComponent(state)}`, COLLEAGUE));
  eq('a declined consent screen is an error param too', outcome(res), 'slack_denied');
}

// ── Disconnecting yourself ───────────────────────────────────────────────────

console.log('\n— disconnecting yourself —');
{
  const state = await signSlackConnectState({ accountId: ACCOUNT, userId: COLLEAGUE.id });
  idToken = { sub: 'U-COLLEAGUE-SLACK', teamId: 'T-HOME', aud: 'test-client-id' };
  await connectCallback(await request(cbUrl(state), COLLEAGUE));
  eq('two colleagues are linked', (await store.listUserLinks(ACCOUNT)).length, 2);

  const res = await disconnectMe(await request('https://parlay.test/api/slack/disconnect/me', COLLEAGUE));
  eq('one may unlink themselves', res.status, 200);
  eq('  their link is gone', await store.getUserLink(ACCOUNT, COLLEAGUE.id), null);
  eq('  their colleague\'s is not', (await store.getUserLink(ACCOUNT, MEMBER.id)).slackUserId, 'U-MEMBER-SLACK-NEW');
  eq('  and the workspace is untouched', (await store.getWorkspace(ACCOUNT)).teamId, 'T-HOME');
}
{
  const res = await disconnectMe(await request('https://parlay.test/api/slack/disconnect/me', null));
  eq('an anonymous caller cannot', res.status, 401);
}
{
  // Nothing in the request names a user, so there is no id to substitute. The
  // outsider unlinks in their own account or not at all.
  const res = await disconnectMe(await request('https://parlay.test/api/slack/disconnect/me', OUTSIDER));
  eq('an outsider unlinking touches only their own account', res.status, 200);
  eq('  leaving this account alone', (await store.listUserLinks(ACCOUNT)).length, 1);
}

// ── What the settings screens read ───────────────────────────────────────────

console.log('\n— the status the screens render —');
{
  const status = await (await slackStatus(await request('https://parlay.test/api/slack/status', MEMBER))).json();
  eq('reports the installed workspace', [status.workspace.teamId, status.workspace.teamName], ['T-HOME', 'Home Inc']);
  eq('  and the caller\'s own link', status.link.slackUserId, 'U-MEMBER-SLACK-NEW');
  eq('  with ENCRYPTION_KEY present', status.encryptionConfigured, true);
  // The bot token must not reach a browser under any key. SlackWorkspace does
  // not carry one, and this asserts that stays true of the wire format.
  eq('  and no credential anywhere in the payload',
    /token|xox|v1\.[0-9a-f]/i.test(JSON.stringify(status)), false);
  // The installer's name lives in the TENANT database, which this harness has
  // no provisioned copy of — so resolving it throws, and the logged error above
  // is expected. What matters is that it degrades to a missing name rather than
  // to a screen reporting Slack as disconnected.
  eq('  and an unresolvable installer name does not hide the connection',
    [status.workspace.teamId, status.workspace.installedBy], ['T-HOME', null]);
}
{
  // There is no user parameter to substitute, so a caller can only ever read
  // their own link — including a caller whose id exists in another account.
  const status = await (await slackStatus(await request('https://parlay.test/api/slack/status', COLLEAGUE))).json();
  eq('a colleague sees the same workspace', status.workspace.teamId, 'T-HOME');
  eq('  and their own absent link, not their colleague\'s', status.link, null);
}
{
  const status = await (await slackStatus(await request('https://parlay.test/api/slack/status', UNINSTALLED))).json();
  eq('an account with no workspace reports null', status.workspace, null);
  eq('  which is what hides the connect control', status.link, null);
}
{
  const res = await slackStatus(await request('https://parlay.test/api/slack/status', null));
  eq('an anonymous caller reads nothing', res.status, 401);
}
{
  const saved = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  const status = await (await slackStatus(await request('https://parlay.test/api/slack/status', MEMBER))).json();
  eq('a missing ENCRYPTION_KEY is reported, not discovered at the last step',
    status.encryptionConfigured, false);
  process.env.ENCRYPTION_KEY = saved;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
