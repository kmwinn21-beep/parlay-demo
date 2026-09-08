/**
 * Turning a stored email back into the name people call each other.
 *
 * Several columns are typed and documented as "a display name" but are filled
 * from `user.email` by every caller that writes them —
 * `pinned_notes.pinned_by` and `upload_jobs.created_by_email` among them. The
 * app then renders whatever it finds, so the same person appears as "Kevin
 * Winn" on one card and "kevin@teton.ai" on the card beside it.
 *
 * The name that matters is the REP PROFILE, in config_options, reached through
 * users.config_id. `users.display_name` is often unset, and the email is only
 * ever a last resort — it is the thing being replaced.
 *
 * Never throws: an unresolvable address renders as itself, which still says
 * who, rather than becoming an error or an empty pill.
 */

import type { Client } from '@libsql/client';

/**
 * True for a value that is really an email address.
 *
 * Deliberately narrow — one @, something either side, a dot in the domain.
 * These columns are documented to hold names, so anything not clearly an
 * address is left exactly as it was stored.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/**
 * Display names for a batch of addresses, keyed by the LOWERCASED email.
 *
 * Batched rather than per-row: a page of pinned notes is one query, not one
 * query per pin. Addresses that match no user are simply absent from the map,
 * and callers fall back to the address.
 */
export async function resolveNamesByEmail(
  client: Client,
  emails: ReadonlyArray<string> | ReadonlySet<string>,
): Promise<Map<string, string>> {
  const wanted = new Set<string>();
  for (const raw of Array.from(emails)) {
    const value = String(raw ?? '').trim();
    if (looksLikeEmail(value)) wanted.add(value.toLowerCase());
  }

  const out = new Map<string, string>();
  if (wanted.size === 0) return out;

  const result = await client.execute({
    sql: `SELECT LOWER(u.email) AS email, COALESCE(co.value, u.display_name, u.email) AS name
          FROM users u
          LEFT JOIN config_options co ON co.id = u.config_id AND co.category = 'user'
          WHERE LOWER(u.email) IN (${Array.from(wanted).map(() => '?').join(',')})`,
    args: Array.from(wanted),
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  for (const row of result.rows as unknown as Record<string, unknown>[]) {
    const email = String(row.email ?? '').trim().toLowerCase();
    const name = String(row.name ?? '').trim();
    if (email && name) out.set(email, name);
  }
  return out;
}

/**
 * The display name for one stored value, resolved where possible.
 *
 * A value that is not an email is already a name and comes back untouched.
 */
export function displayNameFor(stored: string | null | undefined, names: Map<string, string>): string {
  const value = String(stored ?? '').trim();
  if (!looksLikeEmail(value)) return value;
  return names.get(value.toLowerCase()) ?? value;
}
