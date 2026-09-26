/**
 * Relationship statuses and their counterparts, as one list.
 *
 * Every status has a counterpart: the words for the same fact read from the
 * other company. "Current Vendor" on Abshire → Abbott means Abbott is
 * Abshire's vendor, and from Abbott's side Abshire is a "Customer". Some
 * statuses are their own counterpart — a Preferred Partner is one both ways
 * round — and that is a value, not an absence.
 *
 * Both halves are offered when logging a relationship, so a rep can record
 * whichever way round they are thinking: "Abbott is our current vendor" from
 * Abshire's page, or "Abshire is our customer" from Abbott's. The row is
 * stored as written either way, and read back from the other end through the
 * same pairing.
 */

export interface StatusOptionRow {
  id: number;
  value: string;
  inverse_value?: string | null;
}

/** A status as the pickers take it: an id for React, a value to store. */
export interface StatusOption {
  id: number;
  value: string;
}

const lower = (s: string) => s.trim().toLowerCase();

/**
 * Both sides of every status, ready for a dropdown.
 *
 * A counterpart that is the status itself adds nothing, and a counterpart
 * that is already a status in its own right is not repeated — an account
 * carrying both "Current Vendor" and "Customer" as configured options should
 * see each once.
 *
 * Counterpart entries get negative ids. They are not rows; the id only has to
 * be stable and unique for React, and a negative one can never be mistaken
 * for a config_options id by anything downstream.
 */
export function expandStatusOptions(rows: StatusOptionRow[]): StatusOption[] {
  const out: StatusOption[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const v = String(r.value ?? '').trim();
    if (!v || seen.has(lower(v))) continue;
    seen.add(lower(v));
    out.push({ id: r.id, value: v });
  }

  for (const r of rows) {
    const inv = String(r.inverse_value ?? '').trim();
    if (!inv || seen.has(lower(inv))) continue;
    seen.add(lower(inv));
    out.push({ id: -r.id, value: inv });
  }

  return out;
}

/**
 * The map used to read a stored status from the other company's side.
 *
 * Both directions, because either half can now be the one stored. A row
 * written as "Customer" on Abbott's page has to read as "Current Vendor" from
 * Abshire's, which needs the pairing followed backwards.
 *
 * A status is never mapped to itself here — that is what a symmetric status
 * does anyway, and leaving it out keeps "does this status change when you
 * turn it round" a question the map can answer.
 */
export function buildCounterpartMap(rows: StatusOptionRow[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const r of rows) {
    const v = String(r.value ?? '').trim();
    if (!v) continue;
    const inv = String(r.inverse_value ?? '').trim();
    // A status that is its own counterpart is symmetric, and symmetric is what
    // null means here. Storing the word again would make "does this change
    // when you turn it round" two checks instead of one, and the two would
    // eventually disagree.
    map[v] = inv && inv !== v ? inv : null;
    // The way back, unless the value already has a pairing of its own: a
    // configured option's own counterpart always wins over one inferred from
    // being on the far side of somebody else's.
    if (inv && inv !== v && !(inv in map)) map[inv] = v;
  }
  return map;
}

/**
 * Whether a custom status can be saved.
 *
 * A status with no counterpart cannot be read from the other company at all,
 * which is the whole reason the field exists. Required on anything an account
 * adds; the seeded ones come with theirs and cannot be changed.
 */
export function counterpartError(value: string, counterpart: string): string | null {
  if (!String(value ?? '').trim()) return 'Enter a name for the status.';
  if (!String(counterpart ?? '').trim()) {
    return 'Enter the counterpart — what this is called from the other company’s side.';
  }
  return null;
}
