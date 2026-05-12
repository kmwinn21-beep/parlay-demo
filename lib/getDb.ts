import { createClient, type Client } from '@libsql/client';
import { db, dbReady } from '@/lib/db';

const tenantCache = new Map<string, Client>();

export async function getDb(accountId: string | undefined): Promise<Client> {
  if (!accountId) return db;
  const cached = tenantCache.get(accountId);
  if (cached) return cached;
  await dbReady;
  const row = await db.execute({
    sql: `SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
    args: [accountId],
  });
  const r = row.rows[0];
  if (!r?.turso_db_url) return db; // fallback for legacy rows without tenant DB
  const client = createClient({
    url: String(r.turso_db_url),
    authToken: String(r.turso_auth_token),
  });
  tenantCache.set(accountId, client);
  return client;
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
): Promise<{ client: Client; row: Record<string, unknown> } | null> {
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
        return { client: tenantClient, row: result.rows[0] as Record<string, unknown> };
      }
    } catch {
      // Skip unreachable tenant DBs
    }
  }

  return null;
}
