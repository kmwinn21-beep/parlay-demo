import type { Client } from '@libsql/client';

const VALID_RSVP_STATUSES = ['yes', 'no', 'maybe'];

/** Normalizes a submitted RSVP field value ("Yes"/"No"/"Maybe", any case) to the lowercase
 * status social_event_rsvps expects. Anything unrecognized (or missing, e.g. the form has
 * no RSVP field) defaults to 'maybe' — same as adding a guest manually via the Social tab. */
export function mapRsvpAnswerToStatus(raw: string | undefined | null): string {
  const normalized = (raw || '').trim().toLowerCase();
  return VALID_RSVP_STATUSES.includes(normalized) ? normalized : 'maybe';
}

/** Finds which (if any) of the actually-submitted field ids is the form's 'rsvp_status'-keyed
 * field. Checking the submitted ids directly — rather than re-deriving the field via the
 * conference form's template_id — avoids depending on that join lining up (e.g. a field added
 * directly on the form instead of inherited from a shared template still resolves correctly). */
export async function findRsvpFieldId(db: Client, submittedFieldIds: number[]): Promise<number | null> {
  if (submittedFieldIds.length === 0) return null;
  try {
    const placeholders = submittedFieldIds.map(() => '?').join(',');
    const res = await db.execute({
      sql: `SELECT id FROM form_fields WHERE field_key = 'rsvp_status' AND id IN (${placeholders}) LIMIT 1`,
      args: submittedFieldIds,
    });
    return res.rows.length > 0 ? Number(res.rows[0].id) : null;
  } catch {
    return null;
  }
}

/** Adds an attendee to a social event's guest list and records their RSVP — the same two
 * writes app/api/social-events/[id]/guest/route.ts makes when a rep manually adds a guest.
 * Best-effort: swallows its own errors so an RSVP-sync issue never fails the submission. */
export async function applySocialEventRsvp(db: Client, params: {
  socialEventId: number;
  attendeeId: number;
  rsvpStatus: string;
}): Promise<void> {
  const { socialEventId, attendeeId, rsvpStatus } = params;
  try {
    const evRes = await db.execute({
      sql: 'SELECT prospect_attendees FROM social_events WHERE id = ?',
      args: [socialEventId],
    });
    if (evRes.rows.length === 0) return;

    const existing = String(evRes.rows[0].prospect_attendees || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);
    if (!existing.includes(attendeeId)) {
      await db.execute({
        sql: 'UPDATE social_events SET prospect_attendees = ? WHERE id = ?',
        args: [[...existing, attendeeId].join(','), socialEventId],
      });
    }

    await db.execute({
      sql: `INSERT INTO social_event_rsvps (social_event_id, attendee_id, rsvp_status, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT (social_event_id, attendee_id)
            DO UPDATE SET rsvp_status = excluded.rsvp_status, updated_at = excluded.updated_at`,
      args: [socialEventId, attendeeId, rsvpStatus],
    });
  } catch (err) {
    console.error('[applySocialEventRsvp] error:', err);
  }
}
