/**
 * A conference's attendees, gathered into the companies and families they
 * belong to.
 *
 * The flat attendee list answers "who is here". It cannot answer "which
 * accounts are here, and did any of them send someone who can sign" — six
 * operators under one parent read as six unrelated logos, and thirty-six names
 * read as thirty-six names whether they are thirty-six managers or a board.
 * This turns the list into families, the companies inside them, and the people
 * inside those, with a seniority distribution rolled up onto every tier so the
 * shape of an account is legible before anything is opened.
 *
 * The family layer is `companyFamilies.ts` — the same code the Companies tab
 * groups with, so the two views cannot disagree about what a family is.
 *
 * Pure and free of React, and free of `lib/parsers` too: seniority arrives as
 * an injected function rather than an import, because the real one lives in a
 * module that pulls in a spreadsheet parser, and this is the part worth testing
 * on its own.
 */

import {
  buildCompanyFamilies,
  type CompanySortDir,
  type GroupableCompany,
} from './companyFamilies';

/** The fields grouping reads off an attendee row. */
export interface AttendeeLike {
  id: number;
  company_id?: number | null;
  /** Carried by the row's join; the fallback name when the company itself is
   *  not in the companies list. */
  company_name?: string | null;
}

// ---------------------------------------------------------------------------
// Seniority
// ---------------------------------------------------------------------------

export interface SeniorityBucket {
  label: string;
  count: number;
}

export interface SeniorityRollup {
  /** People counted, across every bucket. */
  total: number;
  /** Every bucket present, most senior first. */
  buckets: SeniorityBucket[];
  /** The first `maxNamed` of them — what the cell spells out. */
  named: SeniorityBucket[];
  /** Everyone the named buckets left out. Zero renders as nothing. */
  overflow: number;
}

export const EMPTY_SENIORITY_ROLLUP: SeniorityRollup = {
  total: 0, buckets: [], named: [], overflow: 0,
};

/** How many buckets a roll-up spells out before falling back to "+n". */
export const MAX_NAMED_SENIORITY_BUCKETS = 2;

/**
 * Order two seniority labels by the account's own ranking.
 *
 * Rank is position in the configured seniority list, which arrives already
 * sorted by `sort_order` — so the index is the rank and there is no second
 * table to keep in step. A label the config does not know sorts after every
 * label it does, alphabetically among its own kind, so an imported value nobody
 * has configured yet appears at the bottom rather than at the top.
 *
 * Two options sharing a `sort_order` are indistinguishable here by design: the
 * config already resolved that tie by value when it built the list, and
 * re-deciding it would put this file's opinion above the admin screen's.
 */
export function compareSeniority(a: string, b: string, order: readonly string[]): number {
  const ra = order.indexOf(a);
  const rb = order.indexOf(b);
  const ka = ra === -1 ? order.length : ra;
  const kb = rb === -1 ? order.length : rb;
  if (ka !== kb) return ka - kb;
  return a.localeCompare(b);
}

/**
 * The seniority distribution of a group of people.
 *
 * Named buckets are the most SENIOR present, not the most numerous. A family
 * that sent one C-suite and thirty managers reads "1 C-Suite · 30 Manager",
 * because the one is the reason to walk over there and the thirty are not.
 * Ranking by headcount would bury exactly the fact the view exists to surface.
 */
export function rollUpSeniority<A>(
  people: readonly A[],
  seniorityOf: (person: A) => string,
  order: readonly string[],
  maxNamed: number = MAX_NAMED_SENIORITY_BUCKETS,
): SeniorityRollup {
  const counts = new Map<string, number>();
  let total = 0;
  for (const person of people) {
    const label = seniorityOf(person);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    total++;
  }

  const buckets: SeniorityBucket[] = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => compareSeniority(a.label, b.label, order));

  const named = buckets.slice(0, Math.max(0, maxNamed));
  const namedTotal = named.reduce((n, bucket) => n + bucket.count, 0);

  return { total, buckets, named, overflow: total - namedTotal };
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

export interface CompanyNode<A extends AttendeeLike> {
  kind: 'company';
  /** Stable across sorts and collapse changes. */
  companyId: number;
  companyName: string;
  /** Null when the company is not in the companies list — the node is then
   *  built from what the attendee row itself carries. */
  company: GroupableCompany | null;
  /** True only for the company that is its family's own parent. */
  isFamilyParent: boolean;
  /** In the order the caller supplied them, which is the table's sort. */
  attendees: A[];
  seniority: SeniorityRollup;
}

export interface FamilyNode<A extends AttendeeLike> {
  kind: 'family';
  key: number;
  parentName: string;
  /** The parent's own row when it is at this conference, else null. */
  parent: GroupableCompany | null;
  /** Parent first when present, then its children. */
  companies: CompanyNode<A>[];
  companyCount: number;
  attendeeCount: number;
  seniority: SeniorityRollup;
}

export type TopLevelEntry<A extends AttendeeLike> = FamilyNode<A> | CompanyNode<A>;

export interface AttendeeGroups<A extends AttendeeLike> {
  /** Families first, then the companies belonging to none. One entry per
   *  top-level thing on screen, which is what a page counts. */
  entries: TopLevelEntry<A>[];
  familyCount: number;
  /** Companies with at least one attendee here. */
  companyCount: number;
  /** Attendees placed under a company. Excludes `noCompany`. */
  attendeeCount: number;
  /**
   * Attendees with no company at all, kept flat and trailing.
   *
   * Not a top-level entry: they are not an account, and pretending they are
   * one would put a header over a list of strangers.
   */
  noCompany: A[];
}

export interface BuildAttendeeGroupsOptions<A extends AttendeeLike> {
  /** The seniority shown on this person's row — the derived value, never the
   *  stored column, or the roll-up disagrees with the badges beneath it. */
  seniorityOf: (attendee: A) => string;
  /** The configured seniority values, in rank order. */
  seniorityOrder: readonly string[];
  /** Which way companies read within the view. Only 'name' is ever sorted on:
   *  the tiers above a person are accounts, and accounts are found by name. */
  companySortDir?: CompanySortDir;
  maxNamedSeniority?: number;
}

/**
 * Gather an already-filtered, already-sorted attendee list into its accounts.
 *
 * Attendee order is preserved inside every company, so the table's sort still
 * governs the rows a reader actually compares. Only the tiers above them are
 * ordered here.
 */
export function buildAttendeeGroups<A extends AttendeeLike>(
  attendees: readonly A[],
  companies: readonly GroupableCompany[],
  opts: BuildAttendeeGroupsOptions<A>,
): AttendeeGroups<A> {
  const { seniorityOf, seniorityOrder, companySortDir = 'asc' } = opts;
  const maxNamed = opts.maxNamedSeniority ?? MAX_NAMED_SENIORITY_BUCKETS;
  const rollUp = (people: readonly A[]) => rollUpSeniority(people, seniorityOf, seniorityOrder, maxNamed);

  const companiesById = new Map<number, GroupableCompany>(companies.map(c => [c.id, c]));

  // Who is where. Insertion order is the table's sort, and Map preserves it.
  const byCompany = new Map<number, A[]>();
  const noCompany: A[] = [];
  for (const attendee of attendees) {
    const companyId = attendee.company_id;
    if (companyId == null) { noCompany.push(attendee); continue; }
    const bucket = byCompany.get(companyId);
    if (bucket) bucket.push(attendee);
    else byCompany.set(companyId, [attendee]);
  }

  /**
   * The companies the family layer gets to see: only those with someone here.
   *
   * A company with nobody at this conference is not on this screen, and
   * feeding it in would build families out of rows that render as nothing.
   * The parent is the exception the family layer already handles — an absent
   * parent still names its family, through the name its children carry.
   */
  const present: GroupableCompany[] = [];
  for (const companyId of Array.from(byCompany.keys())) {
    const company = companiesById.get(companyId);
    if (company) present.push(company);
  }
  present.sort((a, b) => {
    const cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return companySortDir === 'asc' ? cmp : -cmp;
  });

  const grouped = buildCompanyFamilies(present, {
    sortKey: 'name',
    sortDir: companySortDir,
    // Reps are the Companies table's roll-up, not this one's. Nothing here
    // reads the result, so it costs nothing to say there are none.
    parseRepIds: () => [],
  });

  const nodeFor = (company: GroupableCompany, isFamilyParent: boolean): CompanyNode<A> => {
    const people = byCompany.get(company.id) ?? [];
    return {
      kind: 'company',
      companyId: company.id,
      companyName: company.name,
      company,
      isFamilyParent,
      attendees: people,
      seniority: rollUp(people),
    };
  };

  const entries: TopLevelEntry<A>[] = [];
  let familyCount = 0;
  let companyCount = 0;
  let attendeeCount = 0;

  for (const entry of grouped.entries) {
    if (entry.kind === 'family') {
      const companyNodes = entry.all.map(c => nodeFor(c, entry.parent != null && c.id === entry.parent.id));
      const people = companyNodes.flatMap(node => node.attendees);
      entries.push({
        kind: 'family',
        key: entry.key,
        parentName: entry.parentName,
        parent: entry.parent,
        companies: companyNodes,
        companyCount: companyNodes.length,
        attendeeCount: people.length,
        seniority: rollUp(people),
      });
      familyCount++;
      companyCount += companyNodes.length;
      attendeeCount += people.length;
      continue;
    }
    const node = nodeFor(entry.company, false);
    entries.push(node);
    companyCount++;
    attendeeCount += node.attendees.length;
  }

  /**
   * People whose company is not in the companies list.
   *
   * Their row carries a company name even when the companies fetch has not
   * arrived or has filtered that company out, so they get a company of their
   * own rather than being called companyless — the screen would otherwise say
   * "no company" about someone whose company it is printing one row above.
   */
  const orphanIds = Array.from(byCompany.keys()).filter(id => !companiesById.has(id));
  const orphanNodes = orphanIds.map((companyId): CompanyNode<A> => {
    const people = byCompany.get(companyId) ?? [];
    return {
      kind: 'company',
      companyId,
      companyName: people.find(a => a.company_name)?.company_name ?? 'Unknown company',
      company: null,
      isFamilyParent: false,
      attendees: people,
      seniority: rollUp(people),
    };
  });
  orphanNodes.sort((a, b) => {
    const cmp = a.companyName.toLowerCase().localeCompare(b.companyName.toLowerCase());
    return companySortDir === 'asc' ? cmp : -cmp;
  });
  for (const node of orphanNodes) {
    entries.push(node);
    companyCount++;
    attendeeCount += node.attendees.length;
  }

  return { entries, familyCount, companyCount, attendeeCount, noCompany };
}

// ---------------------------------------------------------------------------
// Reading the tree
// ---------------------------------------------------------------------------

/** Every attendee under an entry, whatever is open. Selection's unit. */
export function attendeesUnder<A extends AttendeeLike>(entry: TopLevelEntry<A>): A[] {
  return entry.kind === 'family'
    ? entry.companies.flatMap(node => node.attendees)
    : entry.attendees;
}

/** Every attendee across a page of entries — what the count line counts. */
export function entriesToAttendees<A extends AttendeeLike>(entries: readonly TopLevelEntry<A>[]): A[] {
  return entries.flatMap(entry => attendeesUnder(entry));
}

export interface EntryCounts {
  attendees: number;
  companies: number;
  families: number;
}

/** The three numbers the count line reads, for whatever slice it is given. */
export function countEntries<A extends AttendeeLike>(entries: readonly TopLevelEntry<A>[]): EntryCounts {
  let attendees = 0;
  let companies = 0;
  let families = 0;
  for (const entry of entries) {
    if (entry.kind === 'family') {
      families++;
      companies += entry.companies.length;
      attendees += entry.attendeeCount;
    } else {
      companies++;
      attendees += entry.attendees.length;
    }
  }
  return { attendees, companies, families };
}

// ---------------------------------------------------------------------------
// What is open
// ---------------------------------------------------------------------------

/**
 * Which tiers are open, held as two sets with opposite polarity.
 *
 * Families default open and companies default shut, so each set stores the
 * exception rather than the rule: `collapsedFamilies` are the families someone
 * closed, `expandedCompanies` the companies someone opened. Storing the rule
 * instead would mean seeding both sets from the data on every rebuild, and a
 * family arriving mid-session would arrive shut.
 *
 * The sets never touch each other. Closing a family hides its companies
 * without forgetting which of them were open, so reopening it gives back the
 * screen the reader left rather than a reset one — the state is a record of
 * what they did, and collapsing an ancestor is not undoing it.
 */
export interface GroupCollapseState {
  collapsedFamilies: ReadonlySet<number>;
  expandedCompanies: ReadonlySet<number>;
}

export const EMPTY_COLLAPSE_STATE: GroupCollapseState = {
  collapsedFamilies: new Set<number>(),
  expandedCompanies: new Set<number>(),
};

/** Families are open until someone shuts them. */
export function isFamilyExpanded(state: GroupCollapseState, key: number): boolean {
  return !state.collapsedFamilies.has(key);
}

/** Companies are shut until someone opens them — the point of the view. */
export function isCompanyExpanded(state: GroupCollapseState, companyId: number): boolean {
  return state.expandedCompanies.has(companyId);
}

function toggled(set: ReadonlySet<number>, key: number): Set<number> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function toggleFamily(state: GroupCollapseState, key: number): GroupCollapseState {
  return { ...state, collapsedFamilies: toggled(state.collapsedFamilies, key) };
}

export function toggleCompany(state: GroupCollapseState, companyId: number): GroupCollapseState {
  return { ...state, expandedCompanies: toggled(state.expandedCompanies, companyId) };
}
