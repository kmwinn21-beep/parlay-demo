import { normalizeCompanyName } from './matching';

/**
 * Companies that are the same company, spelled differently.
 *
 * ── The key ──────────────────────────────────────────────────────────────────
 *
 * normalizeCompanyName — the SAME key collapseNewCompanyNames uses when an
 * upload creates companies. That is deliberate and load-bearing: if the scanner
 * grouped records the upload would file apart, cleaning them up would be undone
 * by the next import, and nobody would trust either.
 *
 * So it stops where that one stops: case, legal suffixes, `&` vs `and`, stray
 * punctuation and whitespace. NOT deepNormalizeCompanyName, which also strips
 * group, holdings, management, services, partners, advisors, consulting, us and
 * international — on a real 2,647-row list that reduced "Healthcare Services
 * Group", "US Healthcare" and "Healthcare Management Partners" all to
 * "healthcare". Those are three companies. A missed duplicate costs a minute;
 * a wrong merge has no undo.
 *
 * Measured on that list: this key finds 56 groups covering 64 redundant
 * records, with no wrong grouping among them.
 *
 * ── What this is NOT ─────────────────────────────────────────────────────────
 *
 * A proposal, not a decision. Nothing here merges anything. Even an exact
 * normalized match can be two different firms — "Smith Company" and "Smith
 * Corp" both reduce to "smith" — which is why a group can be dismissed, and why
 * the merge behind it shows what it would move before it moves it.
 */

export interface DuplicateCandidate {
  id: number;
  name: string;
  attendee_count?: number;
  conference_count?: number;
  company_type?: string | null;
  website?: string | null;
}

export interface DuplicateGroup {
  /** The normalized spelling every member shares. Stable across scans. */
  key: string;
  /** Identifies this exact set, so dismissing a pair does not hide a later trio. */
  dismissalKey: string;
  members: DuplicateCandidate[];
  /** The member this would keep, unless the person says otherwise. */
  suggestedMasterId: number;
}

/**
 * Which record to keep, absent an opinion.
 *
 * Most attendees first — that is the record the account has actually been
 * working, and the one whose id is likely to appear in someone's bookmark.
 * Then the longest name, which carries the most information ("Gardant
 * Management Solutions" over "Gardant"). Then the lowest id, so the answer is
 * the same every time the scan runs.
 */
function suggestMaster(members: DuplicateCandidate[]): number {
  return members.slice().sort((a, b) =>
    (b.attendee_count ?? 0) - (a.attendee_count ?? 0)
    || b.name.trim().length - a.name.trim().length
    || a.id - b.id,
  )[0].id;
}

/** Identifies a group by its key AND its exact membership. */
export function dismissalKeyFor(key: string, ids: number[]): string {
  return `${key}|${ids.slice().sort((a, b) => a - b).join(',')}`;
}

/**
 * Group companies that share a normalized name.
 *
 * Groups of one are not duplicates and are dropped. Dismissed groups are
 * dropped too — but only while their membership is unchanged, so a third
 * spelling arriving later brings the question back rather than inheriting an
 * answer that was given about two.
 */
export function findDuplicateGroups(
  companies: readonly DuplicateCandidate[],
  dismissed: ReadonlySet<string> = new Set(),
): DuplicateGroup[] {
  const byKey = new Map<string, DuplicateCandidate[]>();
  for (const company of companies) {
    // A name that normalizes away entirely keeps its own text, so two such
    // names don't collapse into each other.
    const key = normalizeCompanyName(company.name) || company.name.toLowerCase().trim();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(company);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, members] of Array.from(byKey.entries())) {
    if (members.length < 2) continue;
    const ids = members.map(m => m.id);
    const dismissalKey = dismissalKeyFor(key, ids);
    if (dismissed.has(dismissalKey)) continue;
    groups.push({
      key,
      dismissalKey,
      members: members.slice().sort((a, b) => a.name.localeCompare(b.name)),
      suggestedMasterId: suggestMaster(members),
    });
  }

  // Biggest first: a group of four is worth more of someone's attention than a
  // pair, and within that, alphabetical so a second scan reads the same way.
  return groups.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}
