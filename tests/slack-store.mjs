/**
 * The Slack store keeps one workspace per account, keys users by the pair that
 * identifies them, and never stores a token in plain text.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/slack-store.mjs
 *
 * Two properties are worth more than the CRUD here. `users.id` is an
 * AUTOINCREMENT per database, so user 42 exists in many accounts and means
 * someone different in each — a lookup keyed on the user alone would return
 * another account's link. And the bot token is a credential, so what lands in
 * the column must not be readable from it.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-slack-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.ENCRYPTION_KEY = 'b'.repeat(64);

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};
const rejects = async (label, fn) => {
  try {
    await fn();
    fail++;
    console.log(`  FAIL ${label}\n       did not throw`);
  } catch {
    pass++;
    console.log(`  ok   ${label}`);
  }
};
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const { db, dbReady, seedFreshDb } = await import('@/lib/db');
await dbReady;
// dbReady means "connection verified", not "schema ready" — initDb does not
// await its migrations. Seed through the app's own builder rather than race it.
await seedFreshDb(db);

const store = await import('@/lib/slack/store');

const ACCOUNT_A = 'acct-alpha';
const ACCOUNT_B = 'acct-beta';
// Not Slack-shaped on purpose: a real-looking token trips secret scanning,
// and these only need to be credential-shaped strings.
const TOKEN_PREFIX = 'fixture-bot-credential';
const TOKEN_A = `${TOKEN_PREFIX}-alpha-0000000000-AbCdEfGhIjKlMnOp`;
const TOKEN_B = `${TOKEN_PREFIX}-beta-1111111111-QrStUvWxYzAbCdEf`;

// ── Workspaces ───────────────────────────────────────────────────────────────

console.log('\n— installing a workspace —');
{
  eq('no workspace before one is installed', await store.getWorkspace(ACCOUNT_A), null);
  eq('  and no token', await store.getBotToken(ACCOUNT_A), null);
}
{
  await store.saveWorkspace({
    accountId: ACCOUNT_A, teamId: 'T-ALPHA', teamName: 'Alpha Corp',
    botToken: TOKEN_A, botUserId: 'U-BOT-A', installedByUserId: 7,
  });
  const ws = await store.getWorkspace(ACCOUNT_A);
  eq('the workspace reads back', [ws.accountId, ws.teamId, ws.teamName, ws.botUserId, ws.installedByUserId],
    [ACCOUNT_A, 'T-ALPHA', 'Alpha Corp', 'U-BOT-A', 7]);
  eq('  and records when it was installed', typeof ws.installedAt === 'string' && ws.installedAt.length > 0, true);
  eq('  the token round-trips', await store.getBotToken(ACCOUNT_A), TOKEN_A);
}

console.log('\n— the token is not stored in plain text —');
{
  const row = await db.execute({ sql: `SELECT bot_token FROM slack_workspaces WHERE account_id = ?`, args: [ACCOUNT_A] });
  const stored = String(row.rows[0].bot_token);
  eq('the column does not contain the token', stored.includes(TOKEN_A), false);
  eq('  nor any recognisable part of it', stored.includes(TOKEN_PREFIX), false);
  eq('  and is versioned ciphertext', stored.startsWith('v1.'), true);
}
{
  // The shape a settings screen renders. A decrypted credential must not be on
  // it, or one careless serialisation puts a bot token in a browser.
  const ws = await store.getWorkspace(ACCOUNT_A);
  eq('the workspace shape carries no token at all',
    Object.keys(ws).some(k => /token/i.test(k)), false);
}

console.log('\n— one workspace per account —');
{
  await store.saveWorkspace({
    accountId: ACCOUNT_A, teamId: 'T-ALPHA-2', teamName: 'Alpha Corp (new workspace)',
    botToken: `${TOKEN_PREFIX}-alpha-replaced-2222222222`, botUserId: 'U-BOT-A2', installedByUserId: 9,
  });
  const rows = await db.execute({ sql: `SELECT COUNT(*) AS n FROM slack_workspaces WHERE account_id = ?`, args: [ACCOUNT_A] });
  eq('reconnecting replaces rather than accumulates', Number(rows.rows[0].n), 1);
  const ws = await store.getWorkspace(ACCOUNT_A);
  eq('  with the new team', [ws.teamId, ws.installedByUserId], ['T-ALPHA-2', 9]);
  eq('  and the new token', await store.getBotToken(ACCOUNT_A), `${TOKEN_PREFIX}-alpha-replaced-2222222222`);
}
{
  await store.saveWorkspace({
    accountId: ACCOUNT_B, teamId: 'T-BETA', teamName: 'Beta Ltd',
    botToken: TOKEN_B, botUserId: 'U-BOT-B', installedByUserId: 3,
  });
  eq('a second account gets its own workspace', (await store.getWorkspace(ACCOUNT_B)).teamId, 'T-BETA');
  eq('  and its own token', await store.getBotToken(ACCOUNT_B), TOKEN_B);
  eq('  without disturbing the first', (await store.getWorkspace(ACCOUNT_A)).teamId, 'T-ALPHA-2');
}

// ── User links ───────────────────────────────────────────────────────────────

console.log('\n— a user link is keyed by account AND user —');
{
  // The same user id in two accounts. This is the case that a lookup keyed on
  // parlay_user_id alone would get wrong, and it is not hypothetical: users.id
  // is an AUTOINCREMENT in every database.
  await store.saveUserLink({ accountId: ACCOUNT_A, parlayUserId: 42, slackUserId: 'U-ALPHA-42' });
  await store.saveUserLink({ accountId: ACCOUNT_B, parlayUserId: 42, slackUserId: 'U-BETA-42' });
  eq('user 42 in account A', (await store.getUserLink(ACCOUNT_A, 42)).slackUserId, 'U-ALPHA-42');
  eq('user 42 in account B', (await store.getUserLink(ACCOUNT_B, 42)).slackUserId, 'U-BETA-42');
}
{
  eq('an unlinked user has no link', await store.getUserLink(ACCOUNT_A, 999), null);
  eq('  and neither does a user in an account that has none', await store.getUserLink('acct-nobody', 42), null);
}
{
  await store.saveUserLink({ accountId: ACCOUNT_A, parlayUserId: 42, slackUserId: 'U-ALPHA-42-RECONNECTED' });
  const rows = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM slack_user_links WHERE account_id = ? AND parlay_user_id = ?`,
    args: [ACCOUNT_A, 42],
  });
  eq('relinking replaces rather than accumulates', Number(rows.rows[0].n), 1);
  eq('  with the new Slack user', (await store.getUserLink(ACCOUNT_A, 42)).slackUserId, 'U-ALPHA-42-RECONNECTED');
}
{
  await store.saveUserLink({ accountId: ACCOUNT_A, parlayUserId: 43, slackUserId: 'U-ALPHA-43' });
  eq('listing an account returns only its own links',
    (await store.listUserLinks(ACCOUNT_A)).map(l => l.parlayUserId).sort(), [42, 43]);
  eq('  and the other account keeps its own', (await store.listUserLinks(ACCOUNT_B)).length, 1);
}

console.log('\n— unlinking —');
{
  await store.deleteUserLink(ACCOUNT_A, 43);
  eq('removes that user', await store.getUserLink(ACCOUNT_A, 43), null);
  eq('  and leaves the others', (await store.listUserLinks(ACCOUNT_A)).length, 1);
  eq('  and the other account entirely', (await store.listUserLinks(ACCOUNT_B)).length, 1);
}

console.log('\n— disconnecting a workspace takes its links with it —');
{
  await store.deleteWorkspace(ACCOUNT_A);
  eq('the workspace is gone', await store.getWorkspace(ACCOUNT_A), null);
  eq('  and so are its links', (await store.listUserLinks(ACCOUNT_A)).length, 0);
  eq('  while the other account is untouched', (await store.getWorkspace(ACCOUNT_B)).teamId, 'T-BETA');
  eq('  including its links', (await store.listUserLinks(ACCOUNT_B)).length, 1);
}

// ── A key that no longer decrypts ────────────────────────────────────────────

console.log('\n— a token that cannot be decrypted is loud, not empty —');
{
  const previous = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = 'c'.repeat(64);
  await rejects('getBotToken throws rather than reporting "not connected"',
    () => store.getBotToken(ACCOUNT_B));
  // getWorkspace does not touch the token, so installation state still renders.
  eq('  but the workspace still reads', (await store.getWorkspace(ACCOUNT_B)).teamId, 'T-BETA');
  process.env.ENCRYPTION_KEY = previous;
  eq('  and the right key still works', await store.getBotToken(ACCOUNT_B), TOKEN_B);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
