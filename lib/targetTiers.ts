/**
 * The target tiers, in the order they rank.
 *
 * A conference target is an ATTENDEE with a tier, so anything that lists
 * companies has to decide what a company's tier is when two of its people are
 * targeted at different levels. The rule is the highest one: a company with a
 * Must Target contact is a Must Target company, whoever else works there.
 *
 * Gathered here because the labels and the ordering were written out again in
 * every tab that shows them, and a fourth copy is how "Monitor" ends up
 * spelled two ways on one screen. The tabs that predate this still carry their
 * own; they are not migrated here in the same change that adds a feature.
 */

/** The stored values, best first. `unassigned` is what the API defaults to. */
export const TIER_ORDER = ['1', '2', '3', 'unassigned'] as const;
export type TierKey = typeof TIER_ORDER[number];

export const TIER_LABEL: Record<TierKey, string> = {
  '1': 'Must Target',
  '2': 'High Priority',
  '3': 'Worth Engaging',
  unassigned: 'Monitor',
};

/**
 * A stored tier as one of the four, or null if it is none of them.
 *
 * The column is free text and has been written both ways — '1' by the targets
 * board, the words by older imports — so both are read rather than only the
 * shape today's writer happens to use.
 */
export function normalizeTier(raw: string | null | undefined): TierKey | null {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase();
  if (!t) return null;
  if (t === '1' || t.includes('must')) return '1';
  if (t === '2' || t.includes('high')) return '2';
  if (t === '3' || t.includes('worth')) return '3';
  if (t === 'unassigned' || t.includes('monitor')) return 'unassigned';
  return null;
}

/** Where a tier ranks. Unknown tiers sort after every known one. */
export function tierRank(raw: string | null | undefined): number {
  const t = normalizeTier(raw);
  return t == null ? TIER_ORDER.length : TIER_ORDER.indexOf(t);
}

/** The better of two tiers — the one that ranks first. */
export function bestTier(a: string | null | undefined, b: string | null | undefined): TierKey {
  return tierRank(a) <= tierRank(b) ? (normalizeTier(a) ?? 'unassigned') : (normalizeTier(b) ?? 'unassigned');
}

export function tierLabel(raw: string | null | undefined): string {
  const t = normalizeTier(raw);
  return t == null ? TIER_LABEL.unassigned : TIER_LABEL[t];
}
