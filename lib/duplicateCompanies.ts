import {
  normalizeCompanyName, extractDomainFromEmail, extractDomainFromWebsite,
  MIN_FUZZY_NAME_LENGTH,
} from './matching';

/**
 * Companies that are the same company, under a different spelling or a
 * different name entirely.
 *
 * ── Two signals ──────────────────────────────────────────────────────────────
 *
 * NAME — normalizeCompanyName, the SAME key collapseNewCompanyNames uses when
 * an upload creates companies. That sharing is load-bearing: if the scanner
 * grouped records the upload would file apart, cleaning them up would be undone
 * by the next import and nobody would trust either.
 *
 * It stops where that one stops — case, legal suffixes, `&` vs `and`,
 * punctuation — and NOT at deepNormalizeCompanyName, which on a real 2,647-row
 * list reduced "Healthcare Services Group", "US Healthcare" and "Healthcare
 * Management Partners" all to "healthcare". Those are three companies. On that
 * list the name signal alone found 56 groups covering 64 redundant records,
 * with no wrong grouping among them.
 *
 * SIMILAR NAME — one company's whole name is the leading words of another's.
 * "12 Oaks" and "12 Oaks Senior Living" are one company, and the exact key
 * above will never say so: nothing it strips turns one into the other. Same for
 * "Gardant" / "Gardant Management Solutions" and "Colliers" / "Colliers
 * International". This was left out at first as too loose, and a real account
 * showed that judgement was wrong — the misses were obvious to anyone reading
 * the list.
 *
 * It is the weakest of the three and labelled as such, because a short stem is
 * a stem of many things. Two guards: the stem must be at least
 * MIN_FUZZY_NAME_LENGTH characters — the same floor the fuzzy matcher uses,
 * and for the same reason, that "ABC" is a prefix of everything — and it must
 * land on a WORD boundary, so "Care" does not pull in "Careington".
 *
 * DOMAIN — the company's own website, and the email domains of its attendees.
 * This is the signal names cannot give: "T20 Holdings LLC" and "Twenty20 Group"
 * share nothing to normalize, but if the people at both use @twenty20.com they
 * are one company. A domain is close to proof, which is why it is worth having
 * and why it needs the guards below more than the name key does.
 *
 * ── The guards, and which of them is a judgement ─────────────────────────────
 *
 * Free providers are excluded: two companies each with one @gmail.com attendee
 * are not related, and without this they would merge the moment anyone scanned.
 * extractDomainFromEmail already refuses those; a website field is not checked
 * by anything, so it is checked here. Social and directory domains go too — a
 * linkedin.com in a website field is somebody's profile link, not a domain.
 *
 * MAX_COMPANIES_PER_DOMAIN is the one number here that is a judgement rather
 * than a measurement. A domain on a handful of records is a duplicate; a domain
 * on twenty is far more likely a shared host, a placeholder, or a column
 * somebody pasted wrong. It could not be calibrated on real data — the
 * conference list this was built against carries no email or website column at
 * all — so it is set where an over-grouping would be obviously wrong rather
 * than plausibly right, and left easy to change.
 *
 * ── What this is NOT ─────────────────────────────────────────────────────────
 *
 * A proposal, not a decision. Nothing here merges anything. Even an exact
 * normalized match can be two firms — "Smith Company" and "Smith Corp" both
 * reduce to "smith" — which is why a group can be dismissed, and why the merge
 * behind it shows what it would move before it moves it.
 */

/** Beyond this, a shared domain says more about the data than the companies. */
export const MAX_COMPANIES_PER_DOMAIN = 10;

/**
 * Beyond this, a shared stem is a common word rather than a company.
 *
 * Same judgement as the domain cap, and the same caveat: a number chosen where
 * an over-grouping would be obviously wrong, not one read off data.
 */
export const MAX_COMPANIES_PER_STEM = 6;

/**
 * Domains that identify a person, a platform or a mailbox — never a company.
 *
 * Only for the website side. Email already refuses free providers inside
 * extractDomainFromEmail; these are the ones that turn up in a website column.
 */
const NON_COMPANY_DOMAINS = new Set([
  'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
  'youtube.com', 'tiktok.com', 'crunchbase.com', 'wikipedia.org',
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com',
]);

export type DuplicateSignal = 'name' | 'similar-name' | 'domain';

export interface DuplicateCandidate {
  id: number;
  name: string;
  attendee_count?: number;
  conference_count?: number;
  company_type?: string | null;
  website?: string | null;
  /** Email addresses of this company's attendees, for the domain signal. */
  attendee_emails?: string[];
}

export interface DuplicateGroup {
  /** Stable identity for the group. */
  key: string;
  /** Identifies this exact set, so dismissing a pair does not hide a later trio. */
  dismissalKey: string;
  members: DuplicateCandidate[];
  /** The member this would keep, unless the person says otherwise. */
  suggestedMasterId: number;
  /** Why these are together — shown, so the reader can judge the evidence. */
  matchedOn: DuplicateSignal[];
  /** The domains that connected them, when one did. */
  sharedDomains: string[];
  /** The leading words they share, when that is what connected them. */
  sharedStems: string[];
}

/** Every domain a company can be identified by, website and attendees alike. */
export function domainsFor(company: DuplicateCandidate): string[] {
  const out = new Set<string>();
  const site = extractDomainFromWebsite(company.website ?? undefined);
  if (site && !NON_COMPANY_DOMAINS.has(site)) out.add(site);
  for (const email of company.attendee_emails ?? []) {
    // Already refuses free providers.
    const d = extractDomainFromEmail(email);
    if (d && !NON_COMPANY_DOMAINS.has(d)) out.add(d);
  }
  return Array.from(out);
}

/**
 * Which record to keep, absent an opinion.
 *
 * Most attendees first — that is the record the account has actually been
 * working. Then the longest name, which carries the most information ("Gardant
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
 * Group companies that share a normalized name or an identifying domain.
 *
 * The two signals feed one grouping rather than two lists, so a pair that
 * matches on both is one question, not two — and a chain (A and B share a name,
 * B and C share a domain) is one group, which is what it is.
 *
 * Groups of one are dropped. Dismissed groups are dropped too, but only while
 * their membership is unchanged: a third record arriving later brings the
 * question back rather than inheriting an answer given about two.
 */
export function findDuplicateGroups(
  companies: readonly DuplicateCandidate[],
  dismissed: ReadonlySet<string> = new Set(),
): DuplicateGroup[] {
  const byId = new Map<number, DuplicateCandidate>();
  for (const c of companies) byId.set(c.id, c);

  // Signal key → the companies carrying it.
  const buckets = new Map<string, number[]>();
  const push = (key: string, id: number) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(id);
  };

  const nameKeyOf = new Map<number, string>();
  for (const company of companies) {
    // A name that normalizes away entirely keeps its own text, so two such
    // names don't collapse into each other.
    const nameKey = normalizeCompanyName(company.name) || company.name.toLowerCase().trim();
    if (nameKey) {
      push(`name:${nameKey}`, company.id);
      nameKeyOf.set(company.id, nameKey);
    }
    for (const domain of domainsFor(company)) push(`domain:${domain}`, company.id);
  }

  // A company whose whole name is the leading words of another's. Only where a
  // company actually carries the stem as its entire name — this never invents a
  // stem, it joins a longer name to a shorter record that already exists.
  const exactNames = new Map<string, number[]>();
  for (const [id, key] of Array.from(nameKeyOf.entries())) {
    if (!exactNames.has(key)) exactNames.set(key, []);
    exactNames.get(key)!.push(id);
  }
  for (const [id, key] of Array.from(nameKeyOf.entries())) {
    const tokens = key.split(' ').filter(Boolean);
    for (let i = 1; i < tokens.length; i++) {
      const stem = tokens.slice(0, i).join(' ');
      if (stem.length < MIN_FUZZY_NAME_LENGTH) continue;
      const shorter = exactNames.get(stem);
      if (!shorter) continue;
      push(`similar:${stem}`, id);
      for (const shortId of shorter) push(`similar:${stem}`, shortId);
    }
  }

  // A domain on too many records is telling us about the data, not the
  // companies — drop it rather than proposing a merge nobody would accept.
  for (const [key, ids] of Array.from(buckets.entries())) {
    const distinct = new Set(ids).size;
    if (key.startsWith('domain:') && distinct > MAX_COMPANIES_PER_DOMAIN) buckets.delete(key);
    if (key.startsWith('similar:') && distinct > MAX_COMPANIES_PER_STEM) buckets.delete(key);
  }

  // Union-find over the companies each signal connects.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    // Path compression, so a long chain stays cheap on the next lookup.
    let cur = x;
    while (parent.get(cur) !== undefined && parent.get(cur) !== cur) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const [, ids] of Array.from(buckets.entries())) {
    const unique = Array.from(new Set(ids));
    for (let i = 1; i < unique.length; i++) union(unique[0], unique[i]);
  }

  const byRoot = new Map<number, number[]>();
  for (const id of Array.from(parent.keys())) {
    const root = find(id);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)!.push(id);
  }

  const groups: DuplicateGroup[] = [];
  for (const [, ids] of Array.from(byRoot.entries())) {
    if (ids.length < 2) continue;
    const members = ids.map(id => byId.get(id)!).filter(Boolean);
    if (members.length < 2) continue;

    // Which signals actually connected THIS group, and on what.
    const memberIds = new Set(members.map(m => m.id));
    const signalKeys: string[] = [];
    const sharedDomains: string[] = [];
    const sharedStems: string[] = [];
    let byName = false;
    for (const [key, bucketIds] of Array.from(buckets.entries())) {
      const inGroup = Array.from(new Set(bucketIds)).filter(id => memberIds.has(id));
      if (inGroup.length < 2) continue;
      signalKeys.push(key);
      if (key.startsWith('name:')) byName = true;
      else if (key.startsWith('similar:')) sharedStems.push(key.slice('similar:'.length));
      else sharedDomains.push(key.slice('domain:'.length));
    }

    // The smallest signal key, so a name-only group keeps the key it had before
    // domains were a signal and an existing dismissal still matches it.
    const key = signalKeys.sort()[0]?.replace(/^name:/, '') ?? `ids:${ids.slice().sort((a, b) => a - b).join(',')}`;
    const dismissalKey = dismissalKeyFor(key, ids);
    if (dismissed.has(dismissalKey)) continue;

    const matchedOn: DuplicateSignal[] = [];
    if (byName) matchedOn.push('name');
    if (sharedStems.length > 0) matchedOn.push('similar-name');
    if (sharedDomains.length > 0) matchedOn.push('domain');

    groups.push({
      key,
      dismissalKey,
      members: members.slice().sort((a, b) => a.name.localeCompare(b.name)),
      suggestedMasterId: suggestMaster(members),
      matchedOn,
      sharedDomains: sharedDomains.sort(),
      sharedStems: sharedStems.sort(),
    });
  }

  // Biggest first: a group of four is worth more attention than a pair, and
  // within that alphabetical, so a second scan reads the same way.
  return groups.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}
