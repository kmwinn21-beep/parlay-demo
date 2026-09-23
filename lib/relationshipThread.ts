import type { getDb } from '@/lib/getDb';

/** One entry in a relationship's thread, as the card renders it. */
export interface RelationshipUpdate {
  id: number;
  body: string;
  status_before: string[];
  status_after: string[];
  marked_stale: boolean;
  author_name: string;
  created_at: string;
}

type Db = Awaited<ReturnType<typeof getDb>>;

function splitList(raw: unknown): string[] {
  if (!raw) return [];
  return String(raw).split(',').map(v => v.trim()).filter(Boolean);
}

/**
 * The SELECT list for the two staleness columns, with a fallback.
 *
 * A tenant whose table predates them would otherwise fail the whole query and
 * show no relationships at all, which is a far worse outcome than showing them
 * all as never-flagged. Callers try the first, then the second.
 */
export const STALENESS_COLUMNS = [
  'vr.status_as_of AS vr_status_as_of, vr.stale AS vr_stale',
  `NULL AS vr_status_as_of, 0 AS vr_stale`,
] as const;

/**
 * Every relationship's thread, in one query.
 *
 * Shared by the company record and the pre-conference views because the card
 * is shared: a surface that loads relationships without their thread renders
 * the same component showing an empty history and a confirmation date that
 * never moves, which reads as a bug rather than as missing data.
 *
 * Joined to users for the author's name. users has display_name and email and
 * no name column, so the COALESCE is load-bearing — getting it wrong returns
 * an empty thread rather than an error, via the catch below.
 */
export async function loadRelationshipThreads(
  db: Db,
  relationshipIds: number[],
): Promise<Map<number, RelationshipUpdate[]>> {
  const threads = new Map<number, RelationshipUpdate[]>();
  const ids = relationshipIds.filter(Boolean);
  if (ids.length === 0) return threads;

  const res = await db.execute({
    sql: `SELECT ru.id, ru.relationship_id, ru.body, ru.status_before, ru.status_after,
                 ru.marked_stale, ru.created_at,
                 COALESCE(NULLIF(u.display_name, ''), u.email) AS author_name
          FROM relationship_updates ru
          LEFT JOIN users u ON u.id = ru.author_user_id
          WHERE ru.relationship_id IN (${ids.map(() => '?').join(',')})
          ORDER BY ru.created_at DESC, ru.id DESC`,
    args: ids,
    // A tenant that has not run the migration has no table yet. An empty
    // thread is the right answer there, not a 500 that hides the cards.
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  for (const u of res.rows) {
    const key = Number(u.relationship_id);
    const list = threads.get(key) ?? [];
    list.push({
      id: Number(u.id),
      body: String(u.body ?? ''),
      status_before: splitList(u.status_before),
      status_after: splitList(u.status_after),
      marked_stale: Number(u.marked_stale ?? 0) === 1,
      author_name: u.author_name ? String(u.author_name) : '',
      created_at: String(u.created_at ?? ''),
    });
    threads.set(key, list);
  }
  return threads;
}

/**
 * The vendor / other relationships for one or more companies.
 *
 * Shared by the company record and the pre-conference views. They had the same
 * query written out twice, which is how the pre-conference copy came to be
 * missing the staleness columns while its own comment claimed the two matched.
 *
 * The parent/child exclusion is part of the shape: a company nested inside
 * this one belongs to Related Entities, and listing it here as well showed the
 * same company twice on the page.
 *
 * Tries each staleness variant in turn, and each stamp variant within it, so a
 * tenant whose table predates any of these columns loses that column rather
 * than the whole list.
 */
export async function vendorRelsQuery(
  db: Db,
  companyIds: number[],
): Promise<{ rows: Record<string, unknown>[] }> {
  if (companyIds.length === 0) return { rows: [] };
  const placeholders = companyIds.map(() => '?').join(',');

  const select = (stamps: string, staleness: string) => `
    SELECT vr.id, vr.company_id, vr.related_company_id, vr.rep_id,
           vr.relationship_status, vr.strength, vr.vendor_type, vr.notes,
           ${stamps}, ${staleness},
           c.name AS related_company_name, c.company_type AS related_company_type
    FROM vendor_relationships vr
    LEFT JOIN companies c ON c.id = vr.related_company_id
    WHERE vr.company_id IN (${placeholders})
      AND NOT EXISTS (
        SELECT 1 FROM companies me
        WHERE me.id = vr.company_id AND me.parent_company_id = vr.related_company_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM companies kid
        WHERE kid.id = vr.related_company_id AND kid.parent_company_id = vr.company_id
      )
    ORDER BY c.name`;

  // Timestamps aliased rather than left to vr.*: companies carries created_at
  // and updated_at too, and which one a wildcard yields in a join is the
  // driver's business, not something worth depending on.
  const STAMPS = [
    'vr.created_at AS vr_created_at, vr.updated_at AS vr_updated_at',
    // updated_at is the newer of the two, so try created_at alone before
    // giving up on a stamp entirely.
    'vr.created_at AS vr_created_at, vr.created_at AS vr_updated_at',
    `'' AS vr_created_at, '' AS vr_updated_at`,
  ];

  for (const staleness of STALENESS_COLUMNS) {
    for (const stamps of STAMPS) {
      const res = await db.execute({ sql: select(stamps, staleness), args: companyIds })
        .catch(() => null);
      if (res) return res as { rows: Record<string, unknown>[] };
    }
  }
  // Every combination failed, which means something other than a missing
  // column. An empty list keeps the rest of the page alive.
  return { rows: [] };
}
