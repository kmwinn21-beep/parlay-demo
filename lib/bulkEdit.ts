/**
 * Telling "leave this alone" apart from "empty it".
 *
 * A bulk-edit panel is a form where almost every field is meant to be ignored:
 * you pick the one or two you want to change and the rest must not be touched.
 * The panels expressed that with truthiness — `if (fields.status)` — which
 * collapses the two meanings an empty value can have. "— no change —" and
 * "clear it" both arrive as the empty string, so the second was unreachable
 * and a value could be changed but never removed.
 *
 * So the clear is given a value of its own. A field is then in one of three
 * states, and the API layer already speaks this language: both bulk routes
 * test `'field' in fields` and coerce a falsy value to NULL, so an absent key
 * is left alone and a null one is emptied. Only the panels needed to catch up.
 *
 * No server-only imports — used from client components.
 */

/**
 * The option value that means "empty this field".
 *
 * Deliberately not something a real option could be: config options are
 * user-defined strings, and a rep naming a status "clear" should not wipe the
 * column.
 */
export const BULK_CLEAR = '__bulk_clear__';

/** What the clear option reads as, so every panel words it the same way. */
export const BULK_CLEAR_LABEL = '— clear value —';

/**
 * Read one select's value into what the API expects.
 *
 *   undefined → the field is absent from the payload; leave it alone
 *   null      → the field is sent as null; the route empties it
 *   string    → the field is set to that value
 */
export function bulkFieldValue(raw: string | null | undefined): string | null | undefined {
  if (raw == null || raw === '') return undefined;
  return raw === BULK_CLEAR ? null : raw;
}
