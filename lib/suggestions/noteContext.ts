import type { Client } from '@libsql/client';

export interface NoteCompany {
  companyId: number | null;
  companyName: string | null;
  attendeeId: number | null;
}

/**
 * Which company a note is about.
 *
 * A note is written against an attendee, a company or a conference. Only the
 * first two lead anywhere: a conference note is about an event rather than an
 * account, and there is no single record for a suggestion to attach to.
 *
 * Attendee notes resolve through the attendee's employer, which is also what
 * makes them worth reading — that is where most of the vendor talk happens.
 */
export async function resolveNoteCompany(
  db: Client,
  entityType: string,
  entityId: number,
): Promise<NoteCompany> {
  const none: NoteCompany = { companyId: null, companyName: null, attendeeId: null };
  if (!entityId) return none;

  if (entityType === 'company') {
    const res = await db.execute({ sql: 'SELECT id, name FROM companies WHERE id = ?', args: [entityId] })
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));
    if (res.rows.length === 0) return none;
    return { companyId: Number(res.rows[0].id), companyName: String(res.rows[0].name ?? ''), attendeeId: null };
  }

  if (entityType === 'attendee') {
    const res = await db.execute({
      sql: `SELECT a.id AS attendee_id, c.id AS company_id, c.name AS company_name
            FROM attendees a LEFT JOIN companies c ON c.id = a.company_id
            WHERE a.id = ?`,
      args: [entityId],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    if (res.rows.length === 0 || res.rows[0].company_id == null) return none;
    return {
      companyId: Number(res.rows[0].company_id),
      companyName: String(res.rows[0].company_name ?? ''),
      attendeeId: Number(res.rows[0].attendee_id),
    };
  }

  return none;
}
