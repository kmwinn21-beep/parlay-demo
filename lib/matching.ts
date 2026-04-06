import Fuse from 'fuse.js';

/* ─── Configurable thresholds ──────────────────────────────────────────────── */

/** Fuse.js score threshold for confident fuzzy matches (0 = perfect, 1 = anything). */
export const FUZZY_MATCH_THRESHOLD = 0.35;

/** Fuse.js score threshold for attendee name fuzzy matches (slightly tighter). */
export const ATTENDEE_FUZZY_THRESHOLD = 0.3;

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
  // Strip stray punctuation (commas, periods, dashes at boundaries)
  s = s.replace(/[.,\-]+$/g, '').replace(/^[.,\-]+/g, '');
  // Collapse whitespace
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

/* ─── Matching engine ──────────────────────────────────────────────────────── */

export type MatchResult<T> = { match: T; score: number } | null;

/**
 * Multi-stage company matching:
 *  1. Exact match on raw lowercase name
 *  2. Exact match on normalised name (strips LLC, Inc, etc.)
 *  3. Exact match on deep-normalised name (also strips Group, Holdings, etc.)
 *  4. Fuzzy match via Fuse.js on normalised names
 */
export function matchCompany<T extends { id: number; name: string }>(
  companyName: string,
  existing: T[],
  /** Pre-built maps & fuse index — pass from buildCompanyMatcher for batch use */
  matcher?: CompanyMatcher<T>
): MatchResult<T> {
  const m = matcher ?? buildCompanyMatcher(existing);
  const rawKey = companyName.toLowerCase().trim();
  const normKey = normalizeCompanyName(companyName);
  const deepKey = deepNormalizeCompanyName(companyName);

  // Stage 1: exact on raw lowercase
  const exact = m.exactMap.get(rawKey);
  if (exact) return { match: exact, score: 0 };

  // Stage 2: exact on normalised
  const normExact = m.normMap.get(normKey);
  if (normExact) return { match: normExact, score: 0.05 };

  // Stage 3: exact on deep-normalised
  const deepExact = m.deepMap.get(deepKey);
  if (deepExact) return { match: deepExact, score: 0.1 };

  // Stage 4: fuzzy on normalised names
  const hits = m.fuse.search(normKey);
  if (hits.length > 0 && (hits[0].score ?? 1) <= FUZZY_MATCH_THRESHOLD) {
    return { match: hits[0].item._original, score: hits[0].score ?? FUZZY_MATCH_THRESHOLD };
  }

  return null;
}

export interface CompanyMatcher<T extends { id: number; name: string }> {
  exactMap: Map<string, T>;
  normMap: Map<string, T>;
  deepMap: Map<string, T>;
  fuse: Fuse<{ _normalized: string; _original: T }>;
}

/** Pre-build company lookup structures once for batch matching. */
export function buildCompanyMatcher<T extends { id: number; name: string }>(
  existing: T[]
): CompanyMatcher<T> {
  const exactMap = new Map<string, T>();
  const normMap = new Map<string, T>();
  const deepMap = new Map<string, T>();

  const fuseItems: { _normalized: string; _original: T }[] = [];

  for (const c of existing) {
    const rawKey = c.name.toLowerCase().trim();
    const normKey = normalizeCompanyName(c.name);
    const deepKey = deepNormalizeCompanyName(c.name);

    // First entry wins for each key to avoid overwriting
    if (!exactMap.has(rawKey)) exactMap.set(rawKey, c);
    if (!normMap.has(normKey)) normMap.set(normKey, c);
    if (!deepMap.has(deepKey)) deepMap.set(deepKey, c);

    fuseItems.push({ _normalized: normKey, _original: c });
  }

  const fuse = new Fuse(fuseItems, {
    keys: ['_normalized'],
    threshold: FUZZY_MATCH_THRESHOLD,
    includeScore: true,
  });

  return { exactMap, normMap, deepMap, fuse };
}

/**
 * Multi-stage attendee matching:
 *  1. Exact match on raw lowercase "first last"
 *  2. Exact match on normalised name
 *  3. Fuzzy match via Fuse.js on normalised names
 */
export function matchAttendee<T extends { id: number; full_name: string }>(
  firstName: string,
  lastName: string,
  existing: T[],
  matcher?: AttendeeMatcher<T>
): MatchResult<T> {
  const m = matcher ?? buildAttendeeMatcher(existing);
  const rawKey = `${firstName} ${lastName}`.trim().toLowerCase();
  const normKey = normalizeAttendeeName(firstName, lastName);

  // Stage 1: exact on raw lowercase
  const exact = m.exactMap.get(rawKey);
  if (exact) return { match: exact, score: 0 };

  // Stage 2: exact on normalised
  const normExact = m.normMap.get(normKey);
  if (normExact) return { match: normExact, score: 0.05 };

  // Stage 3: fuzzy on normalised names
  const hits = m.fuse.search(normKey);
  if (hits.length > 0 && (hits[0].score ?? 1) <= ATTENDEE_FUZZY_THRESHOLD) {
    return { match: hits[0].item._original, score: hits[0].score ?? ATTENDEE_FUZZY_THRESHOLD };
  }

  return null;
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
