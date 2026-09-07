import { createClient, type Client } from '@libsql/client';
import { db, ensureDbReady, migrateTenantDb } from '@/lib/db';

export class DatabaseUnavailableError extends Error {
  readonly status = 503;
  constructor(cause: Error) {
    super('database_unavailable');
    this.cause = cause;
  }
}

const tenantCache = new Map<string, Client>();
// Deduplicates concurrent first-access calls — prevents multiple migration runs
const tenantPending = new Map<string, Promise<Client>>();

/**
 * Which account a tenant client belongs to.
 *
 * `Client` carries no identity of its own, and most of this codebase does not
 * need it to: a tenant client IS the account, as far as reading and writing
 * tenant tables goes. Slack delivery is the exception, because a Slack link
 * lives in MASTER and is keyed on (account_id, parlay_user_id) — so a caller
 * holding only a tenant client cannot name the account the recipient is in.
 *
 * Recording it here rather than threading an `accountId` parameter through
 * lib/notifications.ts keeps 61 call sites unchanged. A WeakMap so a client
 * dropped from the cache is not kept alive by this.
 *
 * Master returns undefined, correctly: it is not an account.
 */
const clientAccounts = new WeakMap<Client, string>();

/** The account a client was opened for, or undefined for master and for clients built by hand. */
export function accountIdForClient(client: Client): string | undefined {
  return clientAccounts.get(client);
}

/**
 * Associate a client with an account. Called by `getDb`; exported so tests can
 * stand up a tenant client without provisioning a real account.
 */
export function registerTenantClient(client: Client, accountId: string): void {
  clientAccounts.set(client, accountId);
}

export async function getDb(accountId: string | undefined): Promise<Client> {
  if (!accountId) return db; // ops admin — no tenant, uses master DB directly
  const cached = tenantCache.get(accountId);
  if (cached) return cached;

  // If another call is already initializing this tenant, wait for it
  const pending = tenantPending.get(accountId);
  if (pending) return pending;

  const init = (async () => {
    const initErr = await ensureDbReady();
    if (initErr) throw new DatabaseUnavailableError(initErr);
    const row = await db.execute({
      sql: `SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
      args: [accountId],
    });
    const r = row.rows[0];
    if (!r?.turso_db_url) {
      throw new Error(`[getDb] No turso_db_url found for account ${accountId} — tenant database not provisioned correctly`);
    }
    const client = createClient({
      url: String(r.turso_db_url),
      authToken: String(r.turso_auth_token),
    });
    await migrateTenantDb(client);
    registerTenantClient(client, accountId);
    tenantCache.set(accountId, client);
    return client;
  })().finally(() => {
    // Runs on both success and failure. A transient failure (timeout,
    // migration hiccup, etc.) must not leave a rejected promise cached
    // forever — every subsequent call for this account would otherwise
    // immediately re-reject with the same stale error for the lifetime of
    // this server instance, even after the underlying issue has cleared.
    tenantPending.delete(accountId);
  });

  tenantPending.set(accountId, init);
  return init;
}

/**
 * Searches for a user row by a token column across master DB and all tenant DBs.
 * Returns { client, row } for the first tenant where the token is found, or null.
 * Used by unauthenticated token-based routes (reset-password, verify-email, etc.)
 * that don't have a session to identify the tenant.
 */
export async function findDbByToken(
  tokenColumn: string,
  tokenValue: string,
  selectColumns = 'id'
): Promise<{ client: Client; row: Record<string, unknown>; accountId?: string } | null> {
  const initErr = await ensureDbReady();
  if (initErr) throw new DatabaseUnavailableError(initErr);

  // Try master DB first (covers ops/single-tenant users)
  const masterResult = await db.execute({
    sql: `SELECT ${selectColumns} FROM users WHERE ${tokenColumn} = ?`,
    args: [tokenValue],
  });
  if (masterResult.rows.length > 0) {
    return { client: db, row: masterResult.rows[0] as Record<string, unknown> };
  }

  // Search all tenant DBs
  const accountsResult = await db.execute({
    sql: 'SELECT id, turso_db_url, turso_auth_token FROM accounts WHERE turso_db_url IS NOT NULL',
    args: [],
  });

  for (const account of accountsResult.rows) {
    const accountId = String(account.id);
    let tenantClient = tenantCache.get(accountId);
    if (!tenantClient) {
      tenantClient = createClient({
        url: String(account.turso_db_url),
        authToken: String(account.turso_auth_token),
      });
      tenantCache.set(accountId, tenantClient);
    }
    try {
      const result = await tenantClient.execute({
        sql: `SELECT ${selectColumns} FROM users WHERE ${tokenColumn} = ?`,
        args: [tokenValue],
      });
      if (result.rows.length > 0) {
        return { client: tenantClient, row: result.rows[0] as Record<string, unknown>, accountId };
      }
    } catch {
      // Skip unreachable tenant DBs
    }
  }

  return null;
}
