import type { Client } from '@libsql/client';

/**
 * The logged-in user as a follow-up's assigned_rep.
 *
 * follow_ups.assigned_rep holds config_options ids as a comma-separated
 * string — that's what parseRepIds reads and what the rep pills resolve
 * against. A display name stored there parses to nothing and the follow-up
 * shows as unassigned, which is what the No-Show trigger used to do.
 *
 * Returns null when the user has no config_options row, which leaves the
 * follow-up unassigned rather than storing something the UI can't resolve.
 */
export async function getCurrentRepConfigId(db: Client, userId: number | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const res = await db.execute({
    sql: `SELECT config_id FROM users WHERE id = ? AND config_id IS NOT NULL LIMIT 1`,
    args: [userId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const configId = res.rows[0]?.config_id;
  return configId != null ? String(configId) : null;
}
