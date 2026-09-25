/**
 * The entity picker beside the relationship map: what it filters by, and the
 * order it lists companies in.
 *
 * Kept apart from the component because the ordering is the part with rules in
 * it — which groups lead, what a company with two types does, where a company
 * with none goes — and none of that is visible in a screenshot of the result.
 */

export interface PickerCompany {
  id: number;
  name: string;
  company_types: string[];
  units: number | null;
  attendeeCount: number;
  relationshipCount: number;
}

/** The heading for companies whose type nobody has set. */
export const NO_TYPE_GROUP = 'No type set';

export interface TypeGroup {
  type: string;
  /** True for the account's ICP company types, which lead the list. */
  isIcp: boolean;
  companies: PickerCompany[];
}

const lower = (s: string) => s.trim().toLowerCase();

/**
 * Which company types are present, for the filter buttons.
 *
 * Only the types actually on the map: offering the account's whole taxonomy
 * would put buttons in front of the reader that filter to nothing. ICP types
 * lead so the ones an account cares about are in the first row, and the rest
 * follow alphabetically.
 */
export function typesPresent(companies: PickerCompany[], icpTypes: string[]): string[] {
  const icp = new Set(icpTypes.map(lower));
  const seen = new Map<string, string>();
  let anyUntyped = false;
  for (const c of companies) {
    if (c.company_types.length === 0) { anyUntyped = true; continue; }
    for (const t of c.company_types) if (t.trim()) seen.set(lower(t), t.trim());
  }

  const all = Array.from(seen.values());
  const isIcp = (t: string) => icp.has(lower(t));
  const byName = (a: string, b: string) => a.localeCompare(b);
  const out = [
    ...all.filter(isIcp).sort(byName),
    ...all.filter(t => !isIcp(t)).sort(byName),
  ];
  // Last, always: it is a bucket rather than a type, and leading with it would
  // put the account's own vocabulary behind a non-answer.
  if (anyUntyped) out.push(NO_TYPE_GROUP);
  return out;
}

/**
 * Which group a company is listed under.
 *
 * A company can carry several types. It appears once, under the first of its
 * types the account counts as ICP, because that is the heading a rep is
 * looking for it beneath — a Customer that is also a Partner is a customer
 * first. Failing that, its first type, in the account's own order.
 */
export function groupFor(company: PickerCompany, icpTypes: string[]): string {
  const icp = new Set(icpTypes.map(lower));
  const types = company.company_types.map(t => t.trim()).filter(Boolean);
  if (types.length === 0) return NO_TYPE_GROUP;
  return types.find(t => icp.has(lower(t))) ?? types[0];
}

/**
 * The companies, grouped and ordered for the list.
 *
 * ICP groups first, then the rest by name. Within a group the companies are
 * ordered by how many relationships they have, because the reason to open this
 * panel is to find the company that connects to things — a list sorted by name
 * buries the hub the map exists to show.
 */
export function groupCompanies(companies: PickerCompany[], icpTypes: string[]): TypeGroup[] {
  const icp = new Set(icpTypes.map(lower));
  const byGroup = new Map<string, PickerCompany[]>();
  for (const c of companies) {
    const g = groupFor(c, icpTypes);
    const list = byGroup.get(g) ?? [];
    list.push(c);
    byGroup.set(g, list);
  }

  const groups: TypeGroup[] = Array.from(byGroup.entries()).map(([type, list]) => ({
    type,
    isIcp: icp.has(lower(type)),
    companies: list.sort((a, b) =>
      b.relationshipCount - a.relationshipCount || a.name.localeCompare(b.name)),
  }));

  groups.sort((a, b) => {
    // The untyped bucket is last whatever else is going on.
    if ((a.type === NO_TYPE_GROUP) !== (b.type === NO_TYPE_GROUP)) {
      return a.type === NO_TYPE_GROUP ? 1 : -1;
    }
    if (a.isIcp !== b.isIcp) return a.isIcp ? -1 : 1;
    return a.type.localeCompare(b.type);
  });
  return groups;
}

/**
 * The companies left after the filter buttons and the search box.
 *
 * No buttons selected means no restriction rather than nothing, because the
 * panel opens with none selected and an empty list would read as a broken map.
 * Several selected widen the result — they are alternatives, not conditions,
 * which is what a row of type chips means to the person clicking them.
 */
export function filterCompanies(
  companies: PickerCompany[],
  selectedTypes: string[],
  search: string,
): PickerCompany[] {
  const wanted = new Set(selectedTypes.map(lower));
  const q = search.trim().toLowerCase();
  return companies.filter(c => {
    if (wanted.size > 0) {
      const types = c.company_types.map(t => t.trim()).filter(Boolean);
      const hit = types.length === 0
        ? wanted.has(lower(NO_TYPE_GROUP))
        : types.some(t => wanted.has(lower(t)));
      if (!hit) return false;
    }
    if (q && !c.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** The four buckets the map's legend offers. */
export type EdgeTone = 'current' | 'pilot' | 'former' | 'competitor';

/**
 * Which legend colour an edge takes.
 *
 * Read off the status words rather than a stored field, because the legend is
 * four buckets and the account's status list is open-ended. Matched loosely on
 * purpose: an account that renames "Active Pilot" to "Pilot — Phase 1" should
 * still land in the pilot bucket rather than falling through to current.
 */
export function toneFor(statuses: string[], relatedTypes: string[]): EdgeTone {
  const text = statuses.join(' ').toLowerCase();
  if (relatedTypes.some(t => t.trim().toLowerCase() === 'competitor')) return 'competitor';
  if (/former|past|previous/.test(text)) return 'former';
  if (/pilot|evaluat|prospect|trial/.test(text)) return 'pilot';
  return 'current';
}

