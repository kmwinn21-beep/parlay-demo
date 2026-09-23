/**
 * Whether a vendor / other relationship should still be believed.
 *
 * Two different questions get confused here, so they are two different fields:
 *
 *   relationship_status   what the relationship IS — Current Vendor,
 *                         Evaluating, Former Vendor.
 *   staleness             how much the record is worth trusting.
 *
 * They are independent, which is the reason "Stale" is not a seventh status
 * option. "Current Vendor, and nobody has checked in eighteen months" is a
 * real and common state, and a stale *status* would erase the Current Vendor
 * half of it — the half somebody actually observed. Former Vendor confirmed
 * last week, meanwhile, is fresh and entirely trustworthy.
 *
 * Staleness comes from two places. A rep can say so outright, which beats
 * everything: they heard something on a conference floor that no date knows
 * about. Failing that it is derived from age, because the records most likely
 * to be out of date are precisely the ones nobody has opened — waiting for a
 * person to flag those means they never get flagged.
 */

/** Months of silence after which a relationship stops being taken at face value. */
export const STALE_AFTER_MONTHS = 12;

/** Months of silence after which the card starts saying so quietly. */
export const AGEING_AFTER_MONTHS = 6;

export type Freshness = 'fresh' | 'ageing' | 'stale';

export interface StalenessInput {
  /** Somebody said so outright. Beats any date. */
  stale?: boolean;
  /** When a person last confirmed the status. Empty means nobody ever has. */
  status_as_of?: string | null;
  /** Fallback when the relationship predates status_as_of. */
  created_at?: string | null;
}

/**
 * Months between a stored timestamp and now, or null if there is no usable one.
 *
 * Stored as UTC without a zone marker, so the Z is added before parsing —
 * otherwise it reads as local and the age drifts by the offset. The same fix
 * formatStamp makes on the card.
 */
export function monthsSince(raw: string | null | undefined, now: Date = new Date()): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const d = new Date(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`);
  if (isNaN(d.getTime())) return null;
  const ms = now.getTime() - d.getTime();
  // A stamp in the future is not old. Clock skew between a tenant's database
  // and the browser is small but real, and a negative age would otherwise read
  // as fresh by accident rather than on purpose.
  if (ms < 0) return 0;
  // Average month. Nothing here turns on a day either way — the thresholds are
  // six and twelve months, and no decision changes because February is short.
  return ms / (1000 * 60 * 60 * 24 * 30.44);
}

/**
 * How much to trust this relationship.
 *
 * A relationship nobody has ever confirmed falls back to its creation date:
 * writing it down was itself a confirmation, on that day. With neither date it
 * reads as fresh — an unmigrated tenant should not have every card on the page
 * turn grey the moment this ships.
 */
export function freshnessOf(rel: StalenessInput, now: Date = new Date()): Freshness {
  if (rel.stale) return 'stale';
  const months = monthsSince(rel.status_as_of, now) ?? monthsSince(rel.created_at, now);
  if (months === null) return 'fresh';
  if (months >= STALE_AFTER_MONTHS) return 'stale';
  if (months >= AGEING_AFTER_MONTHS) return 'ageing';
  return 'fresh';
}

/**
 * The line under the card saying when this was last stood behind.
 *
 * Deliberately says "confirmed" rather than "updated": the date answers when
 * somebody last vouched for the relationship, not when the row was last
 * written. Fixing a typo in the notes moves updated_at and not this.
 */
export function confirmationLabel(rel: StalenessInput, now: Date = new Date()): string {
  const source = String(rel.status_as_of ?? '').trim() || String(rel.created_at ?? '').trim();
  if (!source) return 'Never confirmed';
  const d = new Date(source.endsWith('Z') ? source : `${source.replace(' ', 'T')}Z`);
  if (isNaN(d.getTime())) return 'Never confirmed';
  const months = monthsSince(source, now) ?? 0;
  // Formatted in UTC, not the reader's zone. The stamp is parsed as UTC and
  // the age above is measured in UTC, so formatting locally lets the two
  // disagree: a confirmation at 00:30 UTC on 1 March renders as "Feb 2025" to
  // a reader in Pacific time while being counted from March. One of the two
  // has to give, and the arithmetic is the half that decides whether the card
  // greys out.
  const when = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  // Under a month the month-and-year reads oddly ("confirmed Sep 2026" on a
  // card confirmed this morning), so recent ones say so in words instead.
  if (months < 1) return 'Confirmed this month';
  return `Confirmed ${when}`;
}
