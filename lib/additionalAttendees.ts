import type { Client } from '@libsql/client';

/**
 * Additional attendees on a meeting come in two flavours. Names typed in that
 * match no record stay in meetings.additional_attendees as free text; anyone
 * picked off the conference roster is stored by id in
 * meetings.additional_attendee_ids, which is what lets the meeting carry their
 * photo and title, and show up on their own profile.
 *
 * They are guests on someone else's meeting, never a meeting of their own: the
 * row count is untouched, and the Held follow-up automation keys off
 * meetings.attendee_id, so only the primary attendee gets one.
 */
export interface AdditionalAttendeeRecord {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  photo_url: string | null;
  company_id: number | null;
  company_name: string | null;
}

/** '3, 7,,9' → [3, 7, 9]; anything unparseable is dropped. */
export function parseAttendeeIds(raw: unknown): number[] {
  if (raw == null) return [];
  return String(raw)
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);
}

/** [3, 7, 3] → '3,7' — de-duplicated, order preserved, empty → null. */
export function serializeAttendeeIds(ids: unknown): string | null {
  const list = Array.isArray(ids) ? ids.map(n => Number(n)) : parseAttendeeIds(ids);
  const unique = Array.from(new Set(list.filter(n => Number.isInteger(n) && n > 0)));
  return unique.length > 0 ? unique.join(',') : null;
}

/**
 * Resolve every id referenced across a batch of meetings in one query, keyed by
 * meeting id and returned in the order the ids were stored. Ids pointing at
 * deleted attendees simply drop out.
 */
export async function loadAdditionalAttendees(
  db: Client,
  meetings: { id: number; additional_attendee_ids: unknown }[],
): Promise<Map<number, AdditionalAttendeeRecord[]>> {
  const byMeeting = new Map<number, number[]>();
  const all = new Set<number>();
  for (const m of meetings) {
    const ids = parseAttendeeIds(m.additional_attendee_ids);
    if (ids.length === 0) continue;
    byMeeting.set(m.id, ids);
    ids.forEach(id => all.add(id));
  }
  if (all.size === 0) return new Map();

  const ids = Array.from(all);
  const rows = await db.execute({
    sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.photo_url,
                 co.id AS company_id, co.name AS company_name
            FROM attendees a
            LEFT JOIN companies co ON a.company_id = co.id
           WHERE a.id IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  });

  const lookup = new Map<number, AdditionalAttendeeRecord>();
  for (const r of rows.rows) {
    lookup.set(Number(r.id), {
      id: Number(r.id),
      first_name: String(r.first_name ?? ''),
      last_name: String(r.last_name ?? ''),
      title: r.title != null ? String(r.title) : null,
      photo_url: r.photo_url != null ? String(r.photo_url) : null,
      company_id: r.company_id != null ? Number(r.company_id) : null,
      company_name: r.company_name != null ? String(r.company_name) : null,
    });
  }

  const out = new Map<number, AdditionalAttendeeRecord[]>();
  byMeeting.forEach((list, meetingId) => {
    const records = list
      .map((id: number) => lookup.get(id))
      .filter((r): r is AdditionalAttendeeRecord => !!r);
    if (records.length > 0) out.set(meetingId, records);
  });
  return out;
}

/**
 * SQL fragment matching a meeting that carries the given attendee id in its
 * additional list. Comma-wrapping both sides keeps '1' from matching '11'.
 */
export const ADDITIONAL_ATTENDEE_MATCH_SQL =
  `(',' || COALESCE(m.additional_attendee_ids, '') || ',') LIKE ('%,' || ? || ',%')`;
