import type { Client } from '@libsql/client';

/**
 * A company-only upload stands in one attendee per company so the company
 * registers as present at the conference. Once a real attendee for that
 * company turns up at the same conference the stand-in has nothing left to
 * hold, and this sweep clears it.
 *
 * Two guards make the delete safe:
 *   • Same conference — a stand-in is only stale relative to the conference
 *     it was uploaded for. Company-wide, a real attendee at conference B
 *     would strip the company off conference A.
 *   • No activity — a stand-in looks like any other attendee in the pickers,
 *     so a note, meeting, follow-up or touchpoint can end up on one. Those
 *     are left for a person to deal with via the Placeholders filter rather
 *     than deleted silently.
 *
 * Anything this misses simply survives and is surfaced by the conference's
 * placeholder banner, so a missed sweep costs nothing beyond the manual path.
 */
export async function sweepConflictedPlaceholders(
  db: Client,
  conferenceId: number,
): Promise<number> {
  try {
    const stale = await db.execute({
      sql: `SELECT ph.id
              FROM attendees ph
              JOIN conference_attendees pca
                ON pca.attendee_id = ph.id AND pca.conference_id = ?
             WHERE ph.is_placeholder = 1
               AND ph.company_id IS NOT NULL
               -- a real attendee from the same company, at this conference
               AND EXISTS (
                 SELECT 1 FROM attendees real
                 JOIN conference_attendees rca
                   ON rca.attendee_id = real.id AND rca.conference_id = ?
                 WHERE real.company_id = ph.company_id
                   AND COALESCE(real.is_placeholder, 0) = 0
               )
               -- and nothing logged against the stand-in itself
               AND NOT EXISTS (SELECT 1 FROM meetings m WHERE m.attendee_id = ph.id)
               AND NOT EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = ph.id)
               AND NOT EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = ph.id)
               AND NOT EXISTS (
                 SELECT 1 FROM entity_notes en
                 WHERE en.entity_type = 'attendee' AND en.entity_id = ph.id
               )`,
      args: [conferenceId, conferenceId],
    });

    const ids = stale.rows.map(r => Number(r.id)).filter(n => n > 0);
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(', ');
    await db.batch(
      [
        { sql: `DELETE FROM conference_attendees WHERE attendee_id IN (${placeholders})`, args: ids },
        { sql: `DELETE FROM attendees WHERE id IN (${placeholders})`, args: ids },
      ],
      'write',
    );
    return ids.length;
  } catch (err) {
    // Never fail the caller's write over cleanup — the banner catches leftovers.
    console.error('sweepConflictedPlaceholders failed:', err);
    return 0;
  }
}
