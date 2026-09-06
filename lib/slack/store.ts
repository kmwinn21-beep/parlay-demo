/**
 * The only place `slack_workspaces` and `slack_user_links` are read or written.
 *
 * ── Why these use the master client on purpose ───────────────────────────────
 *
 * TENANT_DB_AUDIT.md is a record of helpers that reached for the `db` singleton
 * when they should have taken a client, and the rule that came out of it is
 * that anything touching tenant tables takes a REQUIRED client parameter. These
 * functions do the opposite, and deliberately:
 *
 *   - A Slack workspace install is one row per ACCOUNT. Accounts live in
 *     master, alongside `accounts` itself.
 *   - The bot token is a credential. Revoking or rotating one is a cross-tenant
 *     operation, and fanning that out across every tenant database turns a
 *     single update into a loop that can half-finish.
 *
 * So there is no client parameter to get wrong, and each query below says at
 * its site that master is the intent rather than an oversight. Note that the
 * migrations array is applied to every database, so these tables also exist,
 * empty, in each tenant — which is exactly the condition that made the audit's
 * findings silent. Nothing here should ever be handed a tenant client.
 *
 * ── Why the account id is always part of the key ─────────────────────────────
 *
 * `users.id` is an AUTOINCREMENT in each database, so user 42 exists in many
 * accounts and means someone different in each. `parlay_user_id` alone
 * identifies nobody; every lookup here is by (account_id, parlay_user_id).
 */

import { db, dbReady } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/encryption';

export interface SlackWorkspace {
  accountId: string;
  teamId: string;
  teamName: string | null;
  botUserId: string | null;
  installedByUserId: number | null;
  installedAt: string | null;
}

export interface SlackUserLink {
  accountId: string;
  parlayUserId: number;
  slackUserId: string;
  linkedAt: string | null;
}

function toWorkspace(row: Record<string, unknown>): SlackWorkspace {
  return {
    accountId: String(row.account_id),
    teamId: String(row.team_id),
    teamName: row.team_name != null ? String(row.team_name) : null,
    botUserId: row.bot_user_id != null ? String(row.bot_user_id) : null,
    installedByUserId: row.installed_by_user_id != null ? Number(row.installed_by_user_id) : null,
    installedAt: row.installed_at != null ? String(row.installed_at) : null,
  };
}

// ─── Workspaces ──────────────────────────────────────────────────────────────

/**
 * The workspace installed for an account, without its token.
 *
 * The token is deliberately not on `SlackWorkspace`: everything that renders
 * installation state wants the team name and who installed it, and a shape that
 * carries a decrypted credential into a settings screen is one refactor away
 * from serialising it to a browser. Callers that need to call Slack ask for it
 * explicitly through `getBotToken`.
 */
export async function getWorkspace(accountId: string): Promise<SlackWorkspace | null> {
  await dbReady;
  // Master by intent — see this module's header.
  const result = await db.execute({
    sql: `SELECT account_id, team_id, team_name, bot_user_id, installed_by_user_id, installed_at
          FROM slack_workspaces WHERE account_id = ?`,
    args: [accountId],
  });
  return result.rows[0] ? toWorkspace(result.rows[0] as Record<string, unknown>) : null;
}

/**
 * The decrypted bot token for an account, or null when no workspace is
 * installed.
 *
 * Throws if the stored value cannot be decrypted — a wrong or rotated
 * ENCRYPTION_KEY, or a modified row. That is louder than returning null, and
 * deliberately so: null reads as "not connected", which would send a caller
 * down the reinstall path when the truth is that the key changed.
 */
export async function getBotToken(accountId: string): Promise<string | null> {
  await dbReady;
  // Master by intent — see this module's header.
  const result = await db.execute({
    sql: `SELECT bot_token FROM slack_workspaces WHERE account_id = ?`,
    args: [accountId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return decrypt(String(row.bot_token));
}

/**
 * Record an install, replacing any workspace the account already had.
 *
 * One workspace per account is a product decision, so reconnecting to a
 * different Slack workspace replaces rather than accumulates. The token is
 * encrypted here rather than by the caller, so there is no path that stores it
 * in plain text by forgetting.
 */
export async function saveWorkspace(input: {
  accountId: string;
  teamId: string;
  teamName: string | null;
  botToken: string;
  botUserId: string | null;
  installedByUserId: number;
}): Promise<void> {
  await dbReady;
  const encrypted = encrypt(input.botToken);
  // Master by intent — see this module's header.
  await db.execute({
    sql: `INSERT INTO slack_workspaces
            (account_id, team_id, team_name, bot_token, bot_user_id, installed_by_user_id, installed_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(account_id) DO UPDATE SET
            team_id = excluded.team_id,
            team_name = excluded.team_name,
            bot_token = excluded.bot_token,
            bot_user_id = excluded.bot_user_id,
            installed_by_user_id = excluded.installed_by_user_id,
            installed_at = excluded.installed_at`,
    args: [
      input.accountId, input.teamId, input.teamName,
      encrypted, input.botUserId, input.installedByUserId,
    ],
  });
}

/**
 * Remove an account's workspace and every user link under it.
 *
 * The links go too. A link pointing at a workspace the account can no longer
 * reach is worse than no link: it reads as connected and delivers nothing.
 */
export async function deleteWorkspace(accountId: string): Promise<void> {
  await dbReady;
  // Master by intent — see this module's header.
  await db.execute({ sql: `DELETE FROM slack_user_links WHERE account_id = ?`, args: [accountId] });
  await db.execute({ sql: `DELETE FROM slack_workspaces WHERE account_id = ?`, args: [accountId] });
}

// ─── User links ──────────────────────────────────────────────────────────────

/** One user's link, by the only key that identifies them. */
export async function getUserLink(accountId: string, parlayUserId: number): Promise<SlackUserLink | null> {
  await dbReady;
  // Master by intent — see this module's header.
  const result = await db.execute({
    sql: `SELECT account_id, parlay_user_id, slack_user_id, linked_at
          FROM slack_user_links WHERE account_id = ? AND parlay_user_id = ?`,
    args: [accountId, parlayUserId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    accountId: String(row.account_id),
    parlayUserId: Number(row.parlay_user_id),
    slackUserId: String(row.slack_user_id),
    linkedAt: row.linked_at != null ? String(row.linked_at) : null,
  };
}

/** Link a Parlay user to a Slack user, replacing any earlier link of theirs. */
export async function saveUserLink(input: {
  accountId: string;
  parlayUserId: number;
  slackUserId: string;
}): Promise<void> {
  await dbReady;
  // Master by intent — see this module's header.
  await db.execute({
    sql: `INSERT INTO slack_user_links (account_id, parlay_user_id, slack_user_id, linked_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(account_id, parlay_user_id) DO UPDATE SET
            slack_user_id = excluded.slack_user_id,
            linked_at = excluded.linked_at`,
    args: [input.accountId, input.parlayUserId, input.slackUserId],
  });
}

/** Unlink one user. Leaves the workspace and everybody else's links alone. */
export async function deleteUserLink(accountId: string, parlayUserId: number): Promise<void> {
  await dbReady;
  // Master by intent — see this module's header.
  await db.execute({
    sql: `DELETE FROM slack_user_links WHERE account_id = ? AND parlay_user_id = ?`,
    args: [accountId, parlayUserId],
  });
}

/**
 * Every linked user in an account.
 *
 * For a future sender that needs to turn a set of Parlay recipients into Slack
 * ids in one query rather than one per person.
 */
export async function listUserLinks(accountId: string): Promise<SlackUserLink[]> {
  await dbReady;
  // Master by intent — see this module's header.
  const result = await db.execute({
    sql: `SELECT account_id, parlay_user_id, slack_user_id, linked_at
          FROM slack_user_links WHERE account_id = ? ORDER BY linked_at`,
    args: [accountId],
  });
  return result.rows.map(row => ({
    accountId: String(row.account_id),
    parlayUserId: Number(row.parlay_user_id),
    slackUserId: String(row.slack_user_id),
    linkedAt: row.linked_at != null ? String(row.linked_at) : null,
  }));
}
