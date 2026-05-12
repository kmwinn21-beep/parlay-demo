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
