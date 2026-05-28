import { createClient, type Client } from '@libsql/client';
import { db, dbReady, migrateTenantDb } from '@/lib/db';

const tenantCache = new Map<string, Client>();
// Deduplicates concurrent first-access calls — prevents multiple migration runs
const tenantPending = new Map<string, Promise<Client>>();

export async function getDb(accountId: string | undefined): Promise<Client> {
  if (!accountId) return db; // ops admin — no tenant, uses master DB directly
  const cached = tenantCache.get(accountId);
  if (cached) return cached;

  // If another call is already initializing this tenant, wait for it
  const pending = tenantPending.get(accountId);
  if (pending) return pending;

  const init = (async () => {
    await dbReady;
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
    tenantCache.set(accountId, client);
    tenantPending.delete(accountId);
    return client;
  })();

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
  await dbReady;

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
