import { db, dbReady } from '@/lib/db';

export async function trackEvent(
  accountId: string | null | undefined,
  eventType: string,
  userId?: number | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!accountId) return;
  try {
    await dbReady;
    await db.execute({
      sql: `INSERT INTO account_events (account_id, event_type, user_id, metadata) VALUES (?, ?, ?, ?)`,
      args: [accountId, eventType, userId ?? null, metadata ? JSON.stringify(metadata) : null],
    });
  } catch { /* fire-and-forget */ }
}

export async function trackFeature(
  accountId: string | null | undefined,
  featureKey: string,
  userId?: number | null,
): Promise<void> {
  if (!accountId) return;
  const uid = userId ?? -1;
  try {
    await dbReady;
    await db.execute({
      sql: `INSERT INTO account_feature_usage (account_id, user_id, feature_key, last_used_at, use_count)
            VALUES (?, ?, ?, datetime('now'), 1)
            ON CONFLICT(account_id, user_id, feature_key) DO UPDATE SET
              last_used_at = excluded.last_used_at,
              use_count = use_count + 1`,
      args: [accountId, uid, featureKey],
    });
  } catch { /* fire-and-forget */ }
}

export async function trackSession(
  accountId: string | null | undefined,
  userId?: number | null,
  ipAddress?: string | null,
): Promise<void> {
  if (!accountId) return;
  try {
    await dbReady;
    await db.execute({
      sql: `INSERT INTO account_sessions (account_id, user_id, ip_address) VALUES (?, ?, ?)`,
      args: [accountId, userId ?? null, ipAddress ?? null],
    });
  } catch { /* fire-and-forget */ }
}
