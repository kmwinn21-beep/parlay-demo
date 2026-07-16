import type { Client } from '@libsql/client';

const VALID_RSVP_STATUSES = ['yes', 'no', 'maybe'];

/** Normalizes a submitted RSVP field value ("Yes"/"No"/"Maybe", any case) to the lowercase
 * status social_event_rsvps expects. Anything unrecognized (or missing, e.g. the form has
 * no RSVP field) defaults to 'maybe' — same as adding a guest manually via the Social tab. */
export function mapRsvpAnswerToStatus(raw: string | undefined | null): string {
  const normalized = (raw || '').trim().toLowerCase();
  return VALID_RSVP_STATUSES.includes(normalized) ? normalized : 'maybe';
}

/** Finds the id of a form's 'rsvp_status'-keyed field, checking both its shared template
 * fields and its own per-form fields (mirrors how conference-forms routes merge the two). */
export async function findRsvpFieldId(db: Client, conferenceFormId: number): Promise<number | null> {
  try {
    const formRow = await db.execute({
      sql: 'SELECT template_id FROM conference_forms WHERE id = ?',
      args: [conferenceFormId],
    });
    const templateId = formRow.rows[0]?.template_id != null ? Number(formRow.rows[0].template_id) : null;
    const res = await db.execute({
      sql: `SELECT id FROM form_fields WHERE field_key = 'rsvp_status' AND (
              (template_id = ? AND conference_form_id IS NULL) OR conference_form_id = ?
            ) LIMIT 1`,
      args: [templateId, conferenceFormId],
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
