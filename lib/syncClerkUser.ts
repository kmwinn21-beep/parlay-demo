import { db, dbReady } from '@/lib/db';
import { getDb } from '@/lib/getDb';
import { createClient } from '@libsql/client';

export async function syncClerkUserToTenant(
  clerkId: string,
  email: string,
): Promise<{ success: boolean; accountId?: string; parlayUserId?: number; role?: string }> {
  await dbReady;

  // ── Step 1: find which account this email belongs to ──────────────────────
  // Primary lookup: accounts.admin_email covers trial-signup users (account owners).
  const accountRow = await db.execute({
    sql: `SELECT id, turso_db_url, turso_auth_token FROM accounts WHERE admin_email = ? LIMIT 1`,
    args: [email],
  });

  let accountId: string | null = null;
  let tenantClient;

  if (accountRow.rows[0]?.turso_db_url) {
    accountId = String(accountRow.rows[0].id);
    tenantClient = await getDb(accountId);
  } else {
    // Fallback: invited users won't be in admin_email — scan tenant DBs.
    const allAccounts = await db.execute({
      sql: `SELECT id, turso_db_url, turso_auth_token FROM accounts WHERE turso_db_url IS NOT NULL`,
      args: [],
    });
    for (const row of allAccounts.rows) {
      const candidate = createClient({
        url: String(row.turso_db_url),
        authToken: String(row.turso_auth_token),
      });
      try {
        const check = await candidate.execute({
          sql: `SELECT id FROM users WHERE email = ? LIMIT 1`,
          args: [email],
        });
        if (check.rows[0]) {
          accountId = String(row.id);
          tenantClient = await getDb(accountId);
          break;
        }
      } catch {
        // Skip unreachable tenant DBs
      }
    }
  }

  if (!accountId || !tenantClient) {
    console.warn(`[syncClerkUser] No tenant found for email ${email}`);
    return { success: false };
  }

  // ── Step 2: find the user row in the tenant DB ────────────────────────────
  const userRow = await tenantClient.execute({
    sql: `SELECT id, role FROM users WHERE email = ? LIMIT 1`,
    args: [email],
  });

  if (!userRow.rows[0]) {
    console.warn(`[syncClerkUser] User not found in tenant DB for email ${email}`);
    return { success: false };
  }

  const parlayUserId = Number(userRow.rows[0].id);
  const role = String(userRow.rows[0].role ?? 'user');

  // ── Step 3: write clerk_id onto the user row ──────────────────────────────
  await tenantClient.execute({
    sql: `UPDATE users SET clerk_id = ? WHERE email = ?`,
    args: [clerkId, email],
  });

  return { success: true, accountId, parlayUserId, role };
}
