import type { Client } from '@libsql/client';
import { classifySeniority } from '@/lib/parsers';
import type { RelationshipRow } from '@/components/PreConferenceReview';

/**
 * A company's internal relationships, and the people they were tagged on.
 *
 * Read across the whole account, not one conference.
 *
 * The conference's own pre-conference load builds the same rows, but it
 * resolves `contact_ids` against THAT conference's attendee list, so a
 * relationship tagged on somebody who did not come has no contacts on it. That
 * is right for the pre-conference views, which are about the show. It is wrong
 * everywhere the surface is account-wide — the relationship map's "All
 * Relationships" scope and the IR signal on the competitive grid, which is set
 * from an account-wide read. Clicking that badge asked whose relationship it
 * was and got "no internal relationships with anyone at this conference" back
 * about a company whose record shows two, which reads as the badge lying.
 *
 * The rows come back in the pre-conference payload's own shape so the same
 * cards render either way.
 */

/** Comma-separated ids, as these columns store them. */
function idList(raw: unknown): number[] {
  if (raw == null) return [];
  return String(raw)
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0);
}

/** A stored id list read as labels, falling back to whatever was stored. */
function labels(raw: unknown, map: Map<number, string>): string[] {
  if (raw == null) return [];
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  return parts.map(p => (/^\d+$/.test(p) ? map.get(Number(p)) ?? p : p));
}

export interface InternalRelationshipRaw {
  id: number;
  company_id: number;
  rep_ids: unknown;
  contact_ids: unknown;
  relationship_status: unknown;
  description: unknown;
}

export interface InternalContact {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  /** Stored where there is one, inferred from the title where there is not. */
  seniority: unknown;
  company_id: number | null;
}

export interface InternalLookups {
  companyNames: Map<number, string>;
  /** config_options, category 'user'. */
  userNames: Map<number, string>;
  /** config_options, category 'rep_relationship_type'. */
  statusLabels: Map<number, string>;
  /** config_options, category 'seniority'. */
  seniorityLabels: Map<number, string>;
  contacts: Map<number, InternalContact>;
}

/**
 * The stored rows, shaped into the cards that render them.
 *
 * Pure, and separate from the queries above it, because every rule worth
 * getting right is here: which contacts a row keeps, what a missing label
 * falls back to, and that a row with no contacts left is still a row.
 */
export function shapeInternalRows(
  rows: InternalRelationshipRaw[],
  lookups: InternalLookups,
): RelationshipRow[] {
  return rows.map(rel => {
    /*
     * Only the tagged contacts, and only ones that still exist.
     *
     * `contact_ids` is a comma-separated column with no foreign key behind it,
     * so it outlives the attendees it names. A deleted contact left as an
     * id would render a card with a blank name and a dead link.
     */
    const contacts = idList(rel.contact_ids)
      .map(id => lookups.contacts.get(id))
      .filter((c): c is InternalContact => c != null);
    const seniorityOf = (c: InternalContact): string => {
      if (c.seniority != null && c.seniority !== '') {
        const stored = String(c.seniority);
        const n = Number(stored);
        return Number.isFinite(n) && lookups.seniorityLabels.has(n)
          ? lookups.seniorityLabels.get(n)!
          : stored;
      }
      return classifySeniority(c.title ?? undefined);
    };
    return {
      id: rel.id,
      company_id: rel.company_id,
      company_name: lookups.companyNames.get(rel.company_id) ?? '',
      relationship_status: labels(rel.relationship_status, lookups.statusLabels).join(', '),
      description: String(rel.description ?? ''),
      rep_names: labels(rel.rep_ids, lookups.userNames),
      // The company's own assigned rep is a pre-conference sidebar field; the
      // surfaces this feeds do not draw that pill.
      assigned_user_names: [],
      contact_names: contacts.map(c => `${c.first_name} ${c.last_name}`.trim()),
      attendees: contacts.map(c => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        title: c.title,
        seniority: seniorityOf(c),
        /*
         * Zero, and not a lie.
         *
         * The card that renders this fetches the contact's own timeline and
         * takes the health score from there, so this field is never read. It
         * is on the shape because the pre-conference payload carries it, and
         * computing it here would be that route's five cross-conference
         * queries for a number nothing displays.
         */
        health: 0,
      })),
      // Same: the pre-conference sidebar shows recent company notes, and the
      // card these feed does not.
      recentNotes: [],
    };
  });
}

/** SQLite's bound-parameter ceiling is reachable at the all-accounts scope. */
const CHUNK = 500;

/**
 * Every internal relationship on the given companies, ready to render.
 *
 * Returns nothing rather than throwing when the read fails: these are one
 * column beside a map, and losing them is better than losing the map.
 */
export async function loadInternalRelationships(
  db: Client,
  companyIds: number[],
): Promise<RelationshipRow[]> {
  const ids = Array.from(new Set(companyIds.filter(id => Number.isFinite(id) && id > 0)));
  if (ids.length === 0) return [];
  try {
    const rows: InternalRelationshipRaw[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const res = await db.execute({
        sql: `SELECT id, company_id, rep_ids, contact_ids, relationship_status, description
              FROM internal_relationships
              WHERE company_id IN (${slice.map(() => '?').join(',')})`,
        args: slice,
      });
      for (const r of res.rows) {
        rows.push({
          id: Number(r.id),
          company_id: Number(r.company_id),
          rep_ids: r.rep_ids,
          contact_ids: r.contact_ids,
          relationship_status: r.relationship_status,
          description: r.description,
        });
      }
    }
    if (rows.length === 0) return [];

    // The contacts these rows name, read from the attendees table itself
    // rather than from a conference's list — that narrowing is the bug this
    // exists to avoid.
    const contactIds = Array.from(new Set(rows.flatMap(r => idList(r.contact_ids))));
    const contacts = new Map<number, InternalContact>();
    for (let i = 0; i < contactIds.length; i += CHUNK) {
      const slice = contactIds.slice(i, i + CHUNK);
      const res = await db.execute({
        sql: `SELECT id, first_name, last_name, title, seniority, company_id
              FROM attendees WHERE id IN (${slice.map(() => '?').join(',')})`,
        args: slice,
      });
      for (const r of res.rows) {
        contacts.set(Number(r.id), {
          id: Number(r.id),
          first_name: r.first_name ? String(r.first_name) : '',
          last_name: r.last_name ? String(r.last_name) : '',
          title: r.title ? String(r.title) : null,
          seniority: r.seniority,
          company_id: r.company_id != null ? Number(r.company_id) : null,
        });
      }
    }

    const relCompanyIds = Array.from(new Set(rows.map(r => r.company_id)));
    const companyNames = new Map<number, string>();
    for (let i = 0; i < relCompanyIds.length; i += CHUNK) {
      const slice = relCompanyIds.slice(i, i + CHUNK);
      const res = await db.execute({
        sql: `SELECT id, name FROM companies WHERE id IN (${slice.map(() => '?').join(',')})`,
        args: slice,
      });
      for (const r of res.rows) companyNames.set(Number(r.id), r.name ? String(r.name) : '');
    }

    const optionMap = async (category: string) => {
      const res = await db.execute({
        sql: `SELECT id, value FROM config_options WHERE category = ?`,
        args: [category],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return new Map<number, string>(res.rows.map(r => [Number(r.id), String(r.value ?? '')]));
    };
    const [userNames, statusLabels, seniorityLabels] = await Promise.all([
      optionMap('user'),
      // The same category the pre-conference load reads relationship statuses
      // from, so the two spell a status the same way.
      optionMap('rep_relationship_type'),
      optionMap('seniority'),
    ]);

    return shapeInternalRows(rows, { companyNames, userNames, statusLabels, seniorityLabels, contacts });
  } catch {
    return [];
  }
}
