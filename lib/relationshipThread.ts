import type { getDb } from '@/lib/getDb';
import { collapsePairs, statusesFor } from '@/lib/relationshipDirection';
import { buildCounterpartMap } from '@/lib/relationshipStatusOptions';

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
 * The vendor / other relationships for one or more companies, both ways round.
 *
 * The table is directional — company_id is the record somebody was on when
 * they logged it, related_company_id the company they picked — and every read
 * used to filter on company_id alone. related_company_id was written, returned
 * as an output column, and never once appeared in a WHERE clause. So a
 * relationship logged on Abshire's page existed on Abshire's page and nowhere
 * else: Abbott asked "where am I the company_id?", got nothing, and said it
 * had no related companies.
 *
 * One row, two readings. Mirroring the row on write would double every write,
 * every edit, every delete and every thread entry, and the pair would drift
 * with no way to tell which half was the real one.
 *
 * Each row comes back with the company it is being read FOR (subject_id), the
 * company at the other end (related_company_id, rewritten when the row is
 * inbound) and a direction, so the caller can render an inbound row in the
 * words that belong to that side rather than in the subject's.
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

  // Written as two halves rather than one OR, because each half needs the
  // opposite end of the row: outbound rows describe related_company_id,
  // inbound rows describe company_id. A single branch with CASE expressions
  // over six columns reads far worse than saying it twice.
  //
  // subject_id is which of the asked-for companies this row is being read for.
  // A row between two companies that were BOTH asked for comes back twice,
  // once per side, which is what a caller rendering both their pages needs.
  const half = (
    subject: string, other: string, direction: string, stamps: string, staleness: string,
  ) => `
    SELECT vr.id, ${subject} AS subject_id, ${other} AS related_company_id, vr.rep_id,
           vr.relationship_status, vr.strength, vr.vendor_type, vr.notes,
           '${direction}' AS direction, vr.company_id AS logged_on_company_id,
           ${stamps}, ${staleness},
           c.name AS related_company_name, c.company_type AS related_company_type
    FROM vendor_relationships vr
    LEFT JOIN companies c ON c.id = ${other}
    WHERE ${subject} IN (${placeholders})
      AND NOT EXISTS (
        SELECT 1 FROM companies me
        WHERE me.id = vr.company_id AND me.parent_company_id = vr.related_company_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM companies kid
        WHERE kid.id = vr.related_company_id AND kid.parent_company_id = vr.company_id
      )`;

  const select = (stamps: string, staleness: string) => `
    ${half('vr.company_id', 'vr.related_company_id', 'outbound', stamps, staleness)}
    UNION ALL
    ${half('vr.related_company_id', 'vr.company_id', 'inbound', stamps, staleness)}
    ORDER BY related_company_name`;

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
      // The id list is bound once per half of the union.
      const res = await db.execute({ sql: select(stamps, staleness), args: [...companyIds, ...companyIds] })
        .catch(() => null);
      if (res) return res as { rows: Record<string, unknown>[] };
    }
  }
  // Every combination failed, which means something other than a missing
  // column. An empty list keeps the rest of the page alive.
  return { rows: [] };
}

/**
 * Each relationship status and the words for the other end of it.
 *
 * Read from config so an account that adds its own option can say how it
 * inverts. A column a tenant has not migrated yet yields an empty map, which
 * reads as every status being symmetric — the same answer as before inbound
 * rows were shown at all.
 */
export async function loadInverseStatuses(db: Db): Promise<Record<string, string | null>> {
  const res = await db.execute({
    sql: `SELECT id, value, inverse_value FROM config_options
          WHERE category = 'other_relationship_status'`,
    args: [],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  // Both directions. Either half of a pair can be the one stored now — a rep
  // can log "Abbott is our current vendor" or "Abshire is our customer" — so
  // the pairing has to be followed backwards as well as forwards.
  return buildCounterpartMap(res.rows.map(r => ({
    id: Number(r.id ?? 0),
    value: String(r.value ?? ''),
    inverse_value: r.inverse_value ? String(r.inverse_value) : null,
  })));
}

/** A relationship as every surface renders it, read from one company's side. */
export interface RelationshipCard {
  id: number;
  /** The company whose page this is. */
  company_id: number;
  related_company_id: number;
  related_company_name: string;
  related_company_type: string | null;
  rep_id: number | null;
  relationship_status: string[];
  strength: string | null;
  vendor_type: string[];
  notes: string;
  created_at: string;
  updated_at: string;
  status_as_of: string;
  stale: boolean;
  updates: RelationshipUpdate[];
  /** 'inbound' means the other company logged it. */
  direction: 'outbound' | 'inbound';
  /** Where the row lives, so an inbound card can link back to it. */
  logged_on_company_id: number;
  /** The status as written, when reading it from here changed the words. */
  as_written: string[] | null;
  /** The other company logged the same pair; these are their words for it. */
  counterpart: { id: number; statuses: string[] } | null;
  /** Set when the two ends do not agree once both are read from this side. */
  conflict: boolean;
}

/**
 * Rows from vendorRelsQuery as cards, read from each subject's own side.
 *
 * Shared because the company record and the pre-conference views both render
 * the same card, and a presenter written out twice is how the query they both
 * call came to disagree with itself in the first place.
 */
export function presentRelationships(
  rows: Record<string, unknown>[],
  threads: Map<number, RelationshipUpdate[]>,
  inverses: Record<string, string | null>,
): RelationshipCard[] {
  const directional = rows.map(r => ({
    id: Number(r.id),
    subject_id: Number(r.subject_id),
    related_company_id: Number(r.related_company_id),
    direction: (String(r.direction) === 'inbound' ? 'inbound' : 'outbound') as 'outbound' | 'inbound',
    relationship_status: splitList(r.relationship_status),
    raw: r,
  }));

  return collapsePairs(directional, inverses).map(d => {
    const r = d.raw as Record<string, unknown>;
    const written = d.relationship_status as string[];
    const shown = statusesFor(written, d.direction as 'outbound' | 'inbound', inverses);
    return {
      id: d.id,
      company_id: d.subject_id,
      related_company_id: d.related_company_id,
      related_company_name: r.related_company_name ? String(r.related_company_name) : '',
      related_company_type: r.related_company_type ? String(r.related_company_type) : null,
      rep_id: r.rep_id != null ? Number(r.rep_id) : null,
      relationship_status: shown,
      strength: r.strength ? String(r.strength) : null,
      vendor_type: splitList(r.vendor_type),
      notes: r.notes ? String(r.notes) : '',
      created_at: r.vr_created_at != null ? String(r.vr_created_at) : '',
      updated_at: r.vr_updated_at != null ? String(r.vr_updated_at) : String(r.vr_created_at ?? ''),
      status_as_of: r.vr_status_as_of ? String(r.vr_status_as_of) : '',
      stale: Number(r.vr_stale ?? 0) === 1,
      updates: threads.get(d.id) ?? [],
      direction: d.direction as 'outbound' | 'inbound',
      logged_on_company_id: Number(r.logged_on_company_id ?? d.subject_id),
      // Only when the words changed. Same words either way is not worth
      // explaining, and an explanation nobody needs is noise on every card.
      as_written: shown.join() !== written.join() ? written : null,
      counterpart: (d.counterpart as RelationshipCard['counterpart']) ?? null,
      conflict: d.conflict === true,
    };
  });
}
