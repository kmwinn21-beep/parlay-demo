import type { Client } from '@libsql/client';
import { getConfigIdByEmail } from '@/lib/notifications';

/**
 * What to write in a note's `rep` column: the author's name, as the rest of
 * the app spells it.
 *
 * `entity_notes.rep` is read as a DISPLAY value — the pill on a note card
 * derives its initials straight from this string — so what goes in has to be
 * a name. The routes that write notes each resolved it their own way, and one
 * of them did not resolve it at all: assigning a floor note to a conference
 * stored `user.email` verbatim, and the pill then showed the one letter an
 * address like `kevin@…` can honestly yield. The note said K where every
 * other pill for the same person said KW.
 *
 * The rep profile's name, then the address as a last resort. The address is
 * still better than nothing — it names somebody, and getPersonInitials makes
 * what it can of it — but it is the fallback, not the default.
 */
export async function noteAuthorName(db: Client, email: string): Promise<string> {
  try {
    const configId = await getConfigIdByEmail(db, email);
    if (configId) {
      const row = await db.execute({
        sql: 'SELECT value FROM config_options WHERE id = ?',
        args: [configId],
      });
      if (row.rows.length > 0 && row.rows[0].value) return String(row.rows[0].value);
    }
  } catch { /* non-fatal — the address still names them */ }
  return email;
}
