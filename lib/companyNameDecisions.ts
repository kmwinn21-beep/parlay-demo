import type { Client } from '@libsql/client';
import {
  deepNormalizeCompanyName,
  type CompanyNameDecisions,
  NO_DECISIONS,
} from '@/lib/matching';

/**
 * Load the answers people have already given about company names, so an upload
 * doesn't re-ask questions that have been settled.
 *
 * Returns the empty set if the table isn't there yet, which keeps an upload
 * working on a tenant whose migrations haven't caught up.
 */
export async function loadCompanyNameDecisions(db: Client): Promise<CompanyNameDecisions> {
  const res = await db.execute({
    sql: `SELECT normalized_name, company_id, decision FROM company_name_links`,
    args: [],
  }).catch(() => null);
  if (!res) return NO_DECISIONS;

  const confirmed = new Map<string, number>();
  const rejected = new Map<string, Set<number>>();
  for (const row of res.rows) {
    const name = String(row.normalized_name ?? '');
    const companyId = Number(row.company_id);
    if (!name || !companyId) continue;
    if (String(row.decision) === 'confirmed') {
      if (!confirmed.has(name)) confirmed.set(name, companyId);
    } else {
      const set = rejected.get(name) ?? new Set<number>();
      set.add(companyId);
      rejected.set(name, set);
    }
  }
  return { confirmed, rejected };
}

/**
 * Remember what someone decided about one uploaded name.
 *
 * A confirmation replaces any earlier answer for that name — saying "yes, this
 * is the company" after previously saying no is a correction, not a second
 * opinion. A rejection only adds the one candidate to the skip list, since a
 * name can be not-this-company and not-that-company at the same time.
 */
export async function recordCompanyNameDecision(
  db: Client,
  uploadedName: string,
  companyId: number,
  decision: 'confirmed' | 'rejected',
  userId?: number | null,
): Promise<void> {
  const normalized = deepNormalizeCompanyName(uploadedName);
  if (!normalized || !companyId) return;

  if (decision === 'confirmed') {
    await db.execute({
      sql: `DELETE FROM company_name_links WHERE normalized_name = ?`,
      args: [normalized],
    }).catch(() => {});
  }

  await db.execute({
    sql: `INSERT INTO company_name_links (normalized_name, company_id, decision, decided_by_user_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(normalized_name, company_id) DO UPDATE SET
            decision = excluded.decision,
            decided_by_user_id = excluded.decided_by_user_id,
            created_at = datetime('now')`,
    args: [normalized, companyId, decision, userId ?? null],
  }).catch(() => {});
}
