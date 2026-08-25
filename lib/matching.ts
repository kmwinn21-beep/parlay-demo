import Fuse from 'fuse.js';

/* ─── Configurable thresholds ──────────────────────────────────────────────── */

/** Fuse.js score threshold for confident fuzzy matches (0 = perfect, 1 = anything). */
export const FUZZY_MATCH_THRESHOLD = 0.35;

/** Fuse.js score threshold for attendee name fuzzy matches (slightly tighter). */
export const ATTENDEE_FUZZY_THRESHOLD = 0.3;

/* ─── Domain extraction ───────────────────────────────────────────────────── */

/** Common email providers whose domains should NOT be used for company matching. */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'proton.me', 'zoho.com',
  'ymail.com', 'live.com', 'msn.com', 'me.com', 'mac.com',
  'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net', 'cox.net',
  'charter.net', 'earthlink.net', 'optonline.net', 'frontier.com',
]);

/**
 * Extract the root domain from an email address.
 * Returns null for free email providers (gmail, yahoo, etc.) since those
 * cannot reliably identify a company.
 */
export function extractDomainFromEmail(email?: string): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain || !domain.includes('.')) return null;
  if (FREE_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

/**
 * Extract the root domain from a website URL.
 * Handles URLs with or without protocol, strips www prefix.
 */
export function extractDomainFromWebsite(website?: string): string | null {
  if (!website) return null;
  let url = website.trim().toLowerCase();
  // Strip protocol
  url = url.replace(/^https?:\/\//, '');
  // Strip path/query
  url = url.split('/')[0].split('?')[0].split('#')[0];
  // Strip www prefix
  url = url.replace(/^www\./, '');
  // Strip port
  url = url.split(':')[0];
  if (!url || !url.includes('.')) return null;
  return url;
}

/**
 * Extract a domain from any available source — email first, then website.
 */
export function extractDomain(email?: string, website?: string): string | null {
  return extractDomainFromEmail(email) ?? extractDomainFromWebsite(website);
}

/* ─── Company-name normalisation ───────────────────────────────────────────── */

/** Legal-entity suffixes that rarely distinguish one company from another. */
const LEGAL_SUFFIXES = [
  'llc', 'l\\.l\\.c\\.?', 'inc\\.?', 'incorporated', 'ltd\\.?', 'limited',
  'llp', 'l\\.l\\.p\\.?', 'lp', 'l\\.p\\.?', 'gmbh', 'corp\\.?', 'corporation',
  'co\\.?', 'company', 'plc', 'p\\.l\\.c\\.?', 'ag', 'sa', 's\\.a\\.?',
  'pllc', 'p\\.l\\.l\\.c\\.?', 'pc', 'p\\.c\\.?',
];

/** Common filler words / descriptors that are often added or dropped. */
const FILLER_WORDS = [
  'group', 'holdings', 'holding', 'technologies', 'technology', 'solutions',
  'services', 'consulting', 'partners', 'advisors', 'management',
  'north america', 'usa', 'us', 'intl', 'international', 'global',
  'enterprises', 'associates', 'the',
];

const LEGAL_REGEX = new RegExp(
  '\\b(' + LEGAL_SUFFIXES.join('|') + ')\\b\\.?\\s*,?',
  'gi'
);

const FILLER_REGEX = new RegExp(
  '\\b(' + FILLER_WORDS.join('|') + ')\\b',
  'gi'
);

/**
 * Normalise a company name for comparison.
 *
 * Steps:
 * 1. Lowercase
 * 2. Replace "&" with "and"
 * 3. Strip legal-entity suffixes (LLC, Inc, …)
 * 4. Strip trailing/leading punctuation & commas
 * 5. Collapse whitespace
 */
export function normalizeCompanyName(raw: string): string {
  let s = raw.toLowerCase().trim();
  // & → and
  s = s.replace(/&/g, 'and');
  // Strip legal suffixes
  s = s.replace(LEGAL_REGEX, ' ');
  // Collapse whitespace BEFORE stripping boundary punctuation. The other order
  // left a comma stranded behind the space the suffix was replaced with:
  // "Grace Management, Inc" became "grace management," and so failed to match
  // "Grace Management" on an exact-normalized comparison, dropping a pair that
  // is obviously the same company down into fuzzy matching.
  s = s.replace(/\s+/g, ' ').trim();
  // Strip stray punctuation at either boundary, spaces included, then tidy up.
  s = s.replace(/[.,\-\s]+$/g, '').replace(/^[.,\-\s]+/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Aggressively normalise a company name for deep comparison.
 * On top of `normalizeCompanyName`, also strips common filler words.
 */
export function deepNormalizeCompanyName(raw: string): string {
  let s = normalizeCompanyName(raw);
  s = s.replace(FILLER_REGEX, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/* ─── Attendee-name normalisation ──────────────────────────────────────────── */

/**
 * Normalise an attendee name for comparison.
 * Lowercases, removes punctuation, collapses whitespace.
 */
export function normalizeAttendeeName(first: string, last: string): string {
  const raw = `${first} ${last}`;
  let s = raw.toLowerCase().trim();
  // Remove periods, commas, hyphens between name parts won't matter for matching
  s = s.replace(/[.,]/g, ' ');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/* ─── Fuzzy-match guards ───────────────────────────────────────────────────── */

/**
 * A normalized name shorter than this never fuzzy-matches. Three- and
 * four-letter names are almost all characters-in-common by accident: "BWE" hit
 * "Bethesda", "UPS" hit "USHS", "SUMA" hit "Smallwood". None of them share a
 * word; the strings are just too short for edit distance to mean anything.
 */
export const MIN_FUZZY_NAME_LENGTH = 5;

/**
 * Two names must share at least this much before a fuzzy hit is even worth
 * showing someone. Measured on real collisions from four conference lists:
 * "BWE"/"Bethesda" scores 0.13 and "SUMA"/"Smallwood" 0.12, while every pair a
 * person would want to look at scores above 0.5.
 */
export const MIN_FUZZY_OVERLAP = 0.35;

/** Character trigrams, padded so the start and end of the string count. */
function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/**
 * How much two names have in common, 0–1, by shared character trigrams.
 *
 * Deliberately not the same measure as the fuzzy score: this one is only asked
 * to spot pairs with nothing in common. It doesn't try to separate a real match
 * from a plausible-looking one, because nothing reliably does — that's what the
 * person reviewing is for.
 */
export function nameOverlap(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  A.forEach(g => { if (B.has(g)) shared++; });
  return (2 * shared) / (A.size + B.size);
}

/* ─── Matching engine ──────────────────────────────────────────────────────── */

/**
 * Which rule produced a match. Everything but 'fuzzy' is an equality of some
 * kind and can be acted on; 'fuzzy' is a guess and callers must treat it as a
 * proposal for someone to confirm.
 */
export type CompanyMatchStage = 'confirmed' | 'exact' | 'normalized' | 'deep' | 'domain' | 'fuzzy';

export type MatchResult<T> = { match: T; score: number; stage?: CompanyMatchStage } | null;

/**
 * Decisions a person has already made about company names, so the same
 * question isn't asked at every upload.
 *  - confirmed: this uploaded name IS this company. Binds without asking.
 *  - rejected:  this uploaded name is NOT this company. That candidate is
 *               dropped, so the name falls through to being created.
 * Keyed by deep-normalized name.
 */
export interface CompanyNameDecisions {
  confirmed: Map<string, number>;
  rejected: Map<string, Set<number>>;
}

export const NO_DECISIONS: CompanyNameDecisions = { confirmed: new Map(), rejected: new Map() };

/**
 * The `field` an identity question carries, so the route that asks it and the
 * route that reads the answer agree on one key. Lives here rather than beside
 * the modal because a server route can't import from a client component.
 */
export function identityConflictField(normalizedUploadName: string): string {
  return `identity:${normalizedUploadName}`;
}

/**
 * Multi-stage company matching:
 *  1. Exact match on raw lowercase name
 *  2. Exact match on normalised name (strips LLC, Inc, etc.)
 *  3. Exact match on deep-normalised name (also strips Group, Holdings, etc.)
 *  4. Domain match: if an email or website domain matches an existing company's domain
 *  5. Fuzzy match via Fuse.js on normalised names
 */
export function matchCompany<T extends { id: number; name: string; website?: string | null }>(
  companyName: string,
  existing: T[],
  /** Pre-built maps & fuse index — pass from buildCompanyMatcher for batch use */
  matcher?: CompanyMatcher<T>,
  /** Optional email/website for domain-based matching */
  email?: string,
  website?: string,
  /** Answers a person has already given about this name. */
  decisions: CompanyNameDecisions = NO_DECISIONS,
): MatchResult<T> {
  const m = matcher ?? buildCompanyMatcher(existing);
  const rawKey = companyName.toLowerCase().trim();
  const normKey = normalizeCompanyName(companyName);
  const deepKey = deepNormalizeCompanyName(companyName);

  // Stage 0: a decision someone already made outranks every rule below it.
  const confirmedId = decisions.confirmed.get(deepKey);
  if (confirmedId != null) {
    const hit = existing.find(c => c.id === confirmedId) ?? m.byId?.get(confirmedId);
    if (hit) return { match: hit, score: 0, stage: 'confirmed' };
  }

  // Stage 1: exact on raw lowercase
  const exact = m.exactMap.get(rawKey);
  if (exact) return { match: exact, score: 0, stage: 'exact' };

  // Stage 2: exact on normalised
  const normExact = m.normMap.get(normKey);
  if (normExact) return { match: normExact, score: 0.05, stage: 'normalized' };

  // Stage 3: exact on deep-normalised
  const deepExact = m.deepMap.get(deepKey);
  if (deepExact) return { match: deepExact, score: 0.1, stage: 'deep' };

  // Stage 4: domain-based matching
  const domain = extractDomain(email, website);
  if (domain) {
    const domainHit = m.domainMap.get(domain);
    if (domainHit) return { match: domainHit, score: 0.15, stage: 'domain' };
  }

  // Stage 5: fuzzy on normalised names. A hit here is a PROPOSAL, never a
  // decision — callers must check `stage` and route it to a person. Two guards
  // stop the obvious nonsense from ever being proposed: names too short for
  // edit distance to mean anything, and pairs with almost no characters in
  // common. Anything a person has already rejected is skipped outright.
  if (normKey.length < MIN_FUZZY_NAME_LENGTH) return null;
  const rejected = decisions.rejected.get(deepKey);
  for (const hit of m.fuse.search(normKey)) {
    const score = hit.score ?? 1;
    if (score > FUZZY_MATCH_THRESHOLD) break;
    const candidate = hit.item._original;
    if (rejected?.has(candidate.id)) continue;
    if (normalizeCompanyName(candidate.name).length < MIN_FUZZY_NAME_LENGTH) continue;
    if (nameOverlap(normKey, hit.item._normalized) < MIN_FUZZY_OVERLAP) continue;
    return { match: candidate, score, stage: 'fuzzy' };
  }

  return null;
}

export interface CompanyMatcher<T extends { id: number; name: string; website?: string | null }> {
  exactMap: Map<string, T>;
  normMap: Map<string, T>;
  deepMap: Map<string, T>;
  domainMap: Map<string, T>;
  byId: Map<number, T>;
  fuse: Fuse<{ _normalized: string; _original: T }>;
}

/** Pre-build company lookup structures once for batch matching. */
export function buildCompanyMatcher<T extends { id: number; name: string; website?: string | null }>(
  existing: T[]
): CompanyMatcher<T> {
  const exactMap = new Map<string, T>();
  const normMap = new Map<string, T>();
  const deepMap = new Map<string, T>();
  const domainMap = new Map<string, T>();
  const byId = new Map<number, T>();

  const fuseItems: { _normalized: string; _original: T }[] = [];

  for (const c of existing) {
    byId.set(c.id, c);
    const rawKey = c.name.toLowerCase().trim();
    const normKey = normalizeCompanyName(c.name);
    const deepKey = deepNormalizeCompanyName(c.name);

    // First entry wins for each key to avoid overwriting
    if (!exactMap.has(rawKey)) exactMap.set(rawKey, c);
    if (!normMap.has(normKey)) normMap.set(normKey, c);
    if (!deepMap.has(deepKey)) deepMap.set(deepKey, c);

    // Build domain map from company website
    const domain = extractDomainFromWebsite(c.website ?? undefined);
    if (domain && !domainMap.has(domain)) {
      domainMap.set(domain, c);
    }

    fuseItems.push({ _normalized: normKey, _original: c });
  }

  const fuse = new Fuse(fuseItems, {
    keys: ['_normalized'],
    threshold: FUZZY_MATCH_THRESHOLD,
    includeScore: true,
  });

  return { exactMap, normMap, deepMap, domainMap, byId, fuse };
}

/**
 * Multi-stage attendee matching — name match PLUS secondary confirmation.
 *
 * Rules:
 *  1. First+last name must match exactly (case-insensitive). Fuzzy name
 *     matching is intentionally disabled — "Brian Smith" and "Bryan Smith"
 *     are NOT the same person.
 *  2. A name match alone is never sufficient. At least one of the following
 *     must also hold (enforced via `confirmFn` when supplied):
 *       a. Email addresses match (case-insensitive exact)
 *       b. Corporate domain matches (extracted from email or website)
 *       c. Company name is a close match (same normalisation rules as company matching)
 *  3. If `confirmFn` is omitted the function falls back to name-only matching
 *     (kept for call-sites that haven't been migrated to carry secondary data).
 */
export function matchAttendee<T extends { id: number; full_name: string }>(
  firstName: string,
  lastName: string,
  existing: T[],
  matcher?: AttendeeMatcher<T>,
  /** Secondary-confirmation predicate — must return true for the match to be accepted. */
  confirmFn?: (candidate: T) => boolean,
): MatchResult<T> {
  const m = matcher ?? buildAttendeeMatcher(existing);
  const rawKey = `${firstName} ${lastName}`.trim().toLowerCase();
  const normKey = normalizeAttendeeName(firstName, lastName);

  // Stage 1: exact on raw lowercase ("brian smith")
  let candidate: T | undefined = m.exactMap.get(rawKey);

  // Stage 2: exact on normalised (strips periods/commas — handles "J. Smith" vs "J Smith")
  if (!candidate) candidate = m.normMap.get(normKey);

  // No fuzzy stage — mismatched first names (Brian/Bryan) must NOT auto-match.

  if (!candidate) return null;

  // Secondary confirmation: email, domain, or company must also match.
  if (confirmFn && !confirmFn(candidate)) return null;

  return { match: candidate, score: 0 };
}

/**
 * Secondary confirmation for a name-matched attendee candidate.
 *
 * Returns true if ANY of the following holds:
 *  1. Incoming email === candidate email (case-insensitive)
 *  2. Corporate domain extracted from (incoming email | website) matches
 *     corporate domain extracted from (candidate email | company website)
 *  3. Incoming company name close-matches candidate company name
 *     (same normalisation as matchCompany — strips LLC, Inc, etc., plus fuzzy)
 *
 * Returns false when no secondary data is present at all — per the matching
 * rules a name match without confirmable secondary data should produce a new
 * record, not silently merge with an existing one.
 */
export function confirmAttendeeMatch(
  candidate: { email?: string | null; website?: string | null; company_name?: string | null },
  incomingEmail?: string | null,
  incomingWebsite?: string | null,
  incomingCompanyName?: string | null,
): boolean {
  // 1. Email exact match
  if (incomingEmail?.trim() && candidate.email?.trim()) {
    if (incomingEmail.trim().toLowerCase() === candidate.email.trim().toLowerCase()) return true;
  }

  // 2. Corporate domain match (email domain or website domain)
  const incDomain = extractDomain(incomingEmail ?? undefined, incomingWebsite ?? undefined);
  const candDomain = extractDomain(candidate.email ?? undefined, candidate.website ?? undefined);
  if (incDomain && candDomain && incDomain === candDomain) return true;

  // 3. Company name close match (normalised + fuzzy via matchCompany)
  if (incomingCompanyName?.trim() && candidate.company_name?.trim()) {
    const hit = matchCompany(incomingCompanyName, [{ id: -1, name: candidate.company_name }]);
    if (hit) return true;
  }

  return false;
}

export interface AttendeeMatcher<T extends { id: number; full_name: string }> {
  exactMap: Map<string, T>;
  normMap: Map<string, T>;
  fuse: Fuse<{ _normalized: string; _original: T }>;
}

/** Pre-build attendee lookup structures once for batch matching. */
export function buildAttendeeMatcher<T extends { id: number; full_name: string }>(
  existing: T[]
): AttendeeMatcher<T> {
  const exactMap = new Map<string, T>();
  const normMap = new Map<string, T>();
  const fuseItems: { _normalized: string; _original: T }[] = [];

  for (const a of existing) {
    const rawKey = a.full_name.toLowerCase().trim();
    const parts = rawKey.split(/\s+/);
    const normKey = normalizeAttendeeName(parts[0] ?? '', parts.slice(1).join(' '));

    if (!exactMap.has(rawKey)) exactMap.set(rawKey, a);
    if (!normMap.has(normKey)) normMap.set(normKey, a);

    fuseItems.push({ _normalized: normKey, _original: a });
  }

  const fuse = new Fuse(fuseItems, {
    keys: ['_normalized'],
    threshold: ATTENDEE_FUZZY_THRESHOLD,
    includeScore: true,
  });

  return { exactMap, normMap, fuse };
}
