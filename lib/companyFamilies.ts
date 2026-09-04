/**
 * Companies at a conference, gathered into the families they belong to.
 *
 * A conference list is a flat roll of company names, and a group of them are
 * often the same account seen from different sites — six operators under one
 * parent read as six unrelated prospects. This turns that flat list into
 * families plus whatever is left over, so a rep can see the account rather than
 * its parts.
 *
 * Deliberately pure and free of React: the grouping rules are the part worth
 * testing on their own, and the table that consumes this is 1,500 lines of JSX.
 */

/** The fields grouping reads. Any row from /api/companies satisfies this. */
export interface GroupableCompany {
  id: number;
  name: string;
  parent_company_id?: number | null;
  parent_company_name?: string | null;
  company_type?: string;
  status?: string;
  assigned_user?: string;
  wse?: number | null;
  attendee_count: number;
  conference_count: number;
  relationship_count?: number;
}

export type CompanySortKey = 'name' | 'company_type' | 'status' | 'attendee_count' | 'conference_count';
export type CompanySortDir = 'asc' | 'desc';

/**
 * The table's sort, lifted out unchanged so families and the rows inside them
 * can be ordered by the same rule the flat table uses. Behaviour is identical to
 * the comparator that was inline in CompanyTable's filter memo — including that
 * `status` sorts on the raw comma-separated string rather than on its parts.
 */
export function compareCompanies<T extends GroupableCompany>(
  a: T, b: T, sortKey: CompanySortKey, sortDir: CompanySortDir,
): number {
  let aVal: string | number;
  let bVal: string | number;
  if (sortKey === 'status') {
    aVal = (a.status || '').toLowerCase();
    bVal = (b.status || '').toLowerCase();
  } else {
    aVal = a[sortKey] ?? '';
    bVal = b[sortKey] ?? '';
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
  }
  if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
  if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
  return 0;
}

/**
 * Depth guard when walking up to a family's topmost member, matching the one the
 * parent/child repair route uses. Chains longer than one level do not occur
 * today — linking a company reassigns its grandchildren straight to the top
 * parent — but the repair route is written as if they can, so this is too.
 */
const MAX_ANCESTOR_DEPTH = 12;

/** What a family's group row shows, summed over its members at this conference. */
export interface FamilyRollup {
  /** Sum of attendee_count. */
  attendees: number;
  /** Sum of wse. Null when every member's is null, so the pill can be dropped
   *  rather than showing a zero nobody entered. */
  units: number | null;
  /** Sum of relationship_count. Zero renders as nothing, as it does on a row. */
  relationships: number;
  /** Distinct rep ids across the family, in the order first seen. */
  repIds: number[];
  /** Companies in this family at this conference, the parent included. */
  memberCount: number;
}

export interface Family<T extends GroupableCompany> {
  kind: 'family';
  /** The topmost ancestor's company id — its own row's id when it is here, the
   *  id its children point at when it is not. Stable across sorts. */
  key: number;
  /** Null when the parent has nobody at this conference. */
  parent: T | null;
  /** The parent's name whether or not it is here: children carry it. */
  parentName: string;
  /** Everything under the parent, excluding the parent's own row. */
  members: T[];
  /** Parent (when present) followed by members — every selectable row. */
  all: T[];
  rollup: FamilyRollup;
}

export interface LooseCompany<T extends GroupableCompany> {
  kind: 'loose';
  key: number;
  company: T;
}

export type GroupEntry<T extends GroupableCompany> = Family<T> | LooseCompany<T>;

export interface GroupedCompanies<T extends GroupableCompany> {
  /** Families first, then the companies that belong to none. One entry per
   *  top-level thing on screen, which is what the page size now counts. */
  entries: GroupEntry<T>[];
  familyCount: number;
  /** Companies inside families — for the count line, which counts companies. */
  groupedCompanyCount: number;
}

/**
 * The family this company belongs to.
 *
 * Walks up while each parent is itself present, so a chain collapses to its
 * topmost present member. Where the parent is absent the walk stops there and
 * the absent parent's id is still the key — that is what lets two siblings group
 * under a parent that isn't at the conference.
 */
function resolveFamilyKey<T extends GroupableCompany>(company: T, byId: Map<number, T>): number {
  let current = company;
  const seen = new Set<number>([company.id]);
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
    const parentId = current.parent_company_id;
    if (parentId == null) return current.id;
    const parent = byId.get(parentId);
    if (!parent) return parentId;
    // A cycle would otherwise never settle; stop where we came in.
    if (seen.has(parent.id)) return current.id;
    seen.add(parent.id);
    current = parent;
  }
  return current.id;
}

function rollUp<T extends GroupableCompany>(
  all: T[],
  parseRepIds: (value: string | undefined) => number[],
): FamilyRollup {
  let attendees = 0;
  let units = 0;
  let anyUnits = false;
  let relationships = 0;
  const repIds: number[] = [];
  const seenReps = new Set<number>();

  for (const c of all) {
    attendees += Number(c.attendee_count) || 0;
    if (c.wse != null) { units += Number(c.wse) || 0; anyUnits = true; }
    relationships += Number(c.relationship_count) || 0;
    for (const id of parseRepIds(c.assigned_user)) {
      if (seenReps.has(id)) continue;
      seenReps.add(id);
      repIds.push(id);
    }
  }

  return { attendees, units: anyUnits ? units : null, relationships, repIds, memberCount: all.length };
}

/**
 * What a family sorts on — the value its group row actually shows.
 *
 * Attendees is the roll-up, because the roll-up is the number on the row. The
 * rest are the parent's own, and are null when the parent is not here: a family
 * with no parent row has no type or status of its own to sort by, and null
 * sorts last in both directions rather than pretending to be the empty string
 * and leading the ascending sort.
 */
function familySortSubject<T extends GroupableCompany>(
  family: Family<T>, sortKey: CompanySortKey,
): string | number | null {
  if (sortKey === 'name') return family.parentName.toLowerCase();
  if (sortKey === 'attendee_count') return family.rollup.attendees;
  if (!family.parent) return null;
  if (sortKey === 'status') return (family.parent.status || '').toLowerCase();
  const value = family.parent[sortKey] ?? '';
  return typeof value === 'string' ? value.toLowerCase() : value;
}

function compareFamilies<T extends GroupableCompany>(
  a: Family<T>, b: Family<T>, sortKey: CompanySortKey, sortDir: CompanySortDir,
): number {
  const av = familySortSubject(a, sortKey);
  const bv = familySortSubject(b, sortKey);
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  if (av < bv) return sortDir === 'asc' ? -1 : 1;
  if (av > bv) return sortDir === 'asc' ? 1 : -1;
  return 0;
}

/**
 * Gather an already-filtered, already-sorted list of companies into families.
 *
 * Input order is the table's sort, and it is preserved inside each family and
 * across the leftovers — only the families themselves are reordered, by what
 * their own row shows.
 *
 * A family needs two companies here to exist. One company under a parent who
 * didn't come is not a family, it is a company with a parent elsewhere, and
 * wrapping it in a header of its own says nothing the row didn't already say.
 */
export function buildCompanyFamilies<T extends GroupableCompany>(
  companies: T[],
  opts: {
    sortKey: CompanySortKey;
    sortDir: CompanySortDir;
    parseRepIds: (value: string | undefined) => number[];
  },
): GroupedCompanies<T> {
  const byId = new Map<number, T>(companies.map(c => [c.id, c]));

  const buckets = new Map<number, T[]>();
  for (const company of companies) {
    const key = resolveFamilyKey(company, byId);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(company);
    else buckets.set(key, [company]);
  }

  const families: Family<T>[] = [];
  const loose: LooseCompany<T>[] = [];

  // Array.from rather than iterating the Map directly: the project's TS target
  // predates for-of over Map entries.
  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (bucket.length < 2) {
      loose.push({ kind: 'loose', key, company: bucket[0] });
      continue;
    }
    const parent = byId.get(key) ?? null;
    const members: T[] = parent ? bucket.filter((c: T) => c.id !== parent.id) : bucket;
    const all = parent ? [parent, ...members] : members;
    const parentName = parent?.name
      // The parent isn't here, but every child carries its name.
      ?? bucket.find((c: T) => c.parent_company_name)?.parent_company_name
      ?? 'Parent company';
    families.push({
      kind: 'family',
      key,
      parent,
      parentName,
      members,
      all,
      rollup: rollUp(all, opts.parseRepIds),
    });
  }

  families.sort((a, b) => compareFamilies(a, b, opts.sortKey, opts.sortDir));

  return {
    // Leftovers trail the families: the section boundary outranks the sort.
    entries: [...families, ...loose],
    familyCount: families.length,
    groupedCompanyCount: families.reduce((n, f) => n + f.all.length, 0),
  };
}

/** Every company on screen for a page of entries, families flattened. */
export function entriesToCompanies<T extends GroupableCompany>(entries: GroupEntry<T>[]): T[] {
  return entries.flatMap(e => (e.kind === 'family' ? e.all : [e.company]));
}
