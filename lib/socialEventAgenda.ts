import type { Client } from '@libsql/client';

/**
 * Keeps company-hosted social events mirrored into the conference agenda.
 *
 * A company-hosted social event gets one row in `conference_agenda_items`,
 * tagged with `social_event_id` so it can be found again on edit and told
 * apart from rows that came from an agenda upload. Every internal attendee on
 * the event then gets a normal `conference_my_agenda_items` row pointing at
 * that agenda item — the same shape the "Add to My Agenda" button writes, so
 * the Agenda tab renders and removes them with no special-casing.
 *
 * The mirror row is updated in place rather than deleted and re-inserted, so
 * its id stays stable and the My Agenda rows that reference it survive edits.
 */

interface SocialEventRow {
  id: number;
  conference_id: number;
  event_name: string | null;
  event_type: string | null;
  host: string | null;
  venue_name: string | null;
  location: string | null;
  company_hosted: number;
  event_date: string | null;
  event_time: string | null;
  internal_attendees: string | null;
}

/** Minutes since midnight, mirroring parseMinutes() in AgendaTab. */
function parseMinutes(time: string | null): number {
  if (!time) return 9999;
  const t = time.trim().toUpperCase();
  const pm = t.includes('PM');
  const am = t.includes('AM');
  const parts = t.replace(/[AP]M/, '').trim().split(':').map(Number);
  let h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return h * 60 + m;
}

/** 'Wednesday, September 23, 2026' — the label the Agenda tab parses back to a date. */
function dayLabelFor(eventDate: string): string {
  const d = new Date(`${eventDate}T00:00:00`);
  if (isNaN(d.getTime())) return eventDate;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** '19:00' -> '7:00 PM'. Agenda times are free text, so match the uploaded style. */
function displayTime(time: string | null): string | null {
  if (!time) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time.trim();
  const h = Number(m[1]);
  if (Number.isNaN(h)) return time.trim();
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

function agendaTitle(ev: SocialEventRow): string {
  return ev.event_name?.trim() || ev.event_type?.trim() || 'Social Event';
}

function agendaLocation(ev: SocialEventRow): string | null {
  const parts = [ev.venue_name?.trim(), ev.location?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : null;
}

/**
 * Resolve the event's internal attendees (config_options values) to the user
 * emails My Agenda is keyed by. Names with no matching user are skipped.
 */
async function resolveAttendeeEmails(db: Client, internalAttendees: string | null): Promise<string[]> {
  const names = (internalAttendees ?? '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean);
  if (names.length === 0) return [];

  const placeholders = names.map(() => '?').join(',');
  const res = await db.execute({
    sql: `SELECT u.email
          FROM users u
          JOIN config_options c ON u.config_id = c.id
          WHERE c.category = 'user' AND c.value IN (${placeholders})`,
    args: names,
  });
  return Array.from(new Set(res.rows.map(r => String(r.email)).filter(Boolean)));
}

/** Delete the mirror row for a social event, plus every My Agenda row pointing at it. */
async function removeMirror(db: Client, conferenceId: number, socialEventId: number): Promise<void> {
  const existing = await db.execute({
    sql: 'SELECT id FROM conference_agenda_items WHERE conference_id = ? AND social_event_id = ?',
    args: [conferenceId, socialEventId],
  });
  for (const row of existing.rows) {
    const agendaItemId = Number(row.id);
    await db.execute({
      sql: 'DELETE FROM conference_my_agenda_items WHERE conference_id = ? AND agenda_item_id = ?',
      args: [conferenceId, agendaItemId],
    });
    await db.execute({ sql: 'DELETE FROM conference_agenda_items WHERE id = ?', args: [agendaItemId] });
  }
}

/**
 * The sort_order the mirror row should occupy so it lands in its day at the
 * right time. Rows belonging to this social event are ignored so an edit
 * re-slots cleanly. Days that aren't in the agenda yet go on the end.
 */
async function targetSortOrder(
  db: Client,
  conferenceId: number,
  socialEventId: number,
  dayLabel: string,
  startMinutes: number,
): Promise<number> {
  const res = await db.execute({
    sql: `SELECT id, day_label, start_time, sort_order
          FROM conference_agenda_items
          WHERE conference_id = ?
            AND (social_event_id IS NULL OR social_event_id != ?)
          ORDER BY sort_order ASC`,
    args: [conferenceId, socialEventId],
  });

  const rows = res.rows.map(r => ({
    day_label: String(r.day_label),
    start_time: r.start_time ? String(r.start_time) : null,
    sort_order: Number(r.sort_order),
  }));
  if (rows.length === 0) return 0;

  const sameDay = rows.filter(r => r.day_label === dayLabel);
  if (sameDay.length === 0) return rows[rows.length - 1].sort_order + 1;

  const after = sameDay.find(r => parseMinutes(r.start_time) > startMinutes);
  if (after) return after.sort_order;
  return sameDay[sameDay.length - 1].sort_order + 1;
}

/**
 * Bring the agenda (and the internal attendees' My Agenda) in line with one
 * social event. Safe to call after any create/update/delete: it adds, moves,
 * or removes the mirror row as the event's own fields dictate.
 */
export async function syncSocialEventAgenda(db: Client, socialEventId: number): Promise<void> {
  const res = await db.execute({
    sql: `SELECT id, conference_id, event_name, event_type, host, venue_name, location,
                 company_hosted, event_date, event_time, internal_attendees
          FROM social_events WHERE id = ?`,
    args: [socialEventId],
  });
  if (res.rows.length === 0) return;

  const r = res.rows[0];
  const ev: SocialEventRow = {
    id: Number(r.id),
    conference_id: Number(r.conference_id),
    event_name: r.event_name ? String(r.event_name) : null,
    event_type: r.event_type ? String(r.event_type) : null,
    host: r.host ? String(r.host) : null,
    venue_name: r.venue_name ? String(r.venue_name) : null,
    location: r.location ? String(r.location) : null,
    company_hosted: Number(r.company_hosted ?? 0),
    event_date: r.event_date ? String(r.event_date) : null,
    event_time: r.event_time ? String(r.event_time) : null,
    internal_attendees: r.internal_attendees ? String(r.internal_attendees) : null,
  };

  // Only company-hosted events with a date belong on the agenda. Anything else
  // (unchecked, date cleared) loses whatever mirror row it had.
  if (ev.company_hosted !== 1 || !ev.event_date) {
    await removeMirror(db, ev.conference_id, ev.id);
    return;
  }

  const dayLabel = dayLabelFor(ev.event_date);
  const startTime = displayTime(ev.event_time);
  const slot = await targetSortOrder(db, ev.conference_id, ev.id, dayLabel, parseMinutes(startTime));

  await db.execute({
    sql: `UPDATE conference_agenda_items SET sort_order = sort_order + 1
          WHERE conference_id = ? AND sort_order >= ?
            AND (social_event_id IS NULL OR social_event_id != ?)`,
    args: [ev.conference_id, slot, ev.id],
  });

  const existing = await db.execute({
    sql: 'SELECT id FROM conference_agenda_items WHERE conference_id = ? AND social_event_id = ? LIMIT 1',
    args: [ev.conference_id, ev.id],
  });

  const fields = {
    day_label: dayLabel,
    start_time: startTime,
    session_type: ev.event_type?.trim() || 'Social',
    title: agendaTitle(ev),
    description: ev.host?.trim() ? `Hosted by ${ev.host.trim()}` : null,
    location: agendaLocation(ev),
  };

  let agendaItemId: number;
  if (existing.rows.length > 0) {
    agendaItemId = Number(existing.rows[0].id);
    await db.execute({
      sql: `UPDATE conference_agenda_items
            SET day_label = ?, start_time = ?, end_time = NULL, session_type = ?,
                title = ?, description = ?, location = ?, sort_order = ?
            WHERE id = ?`,
      args: [fields.day_label, fields.start_time, fields.session_type, fields.title,
             fields.description, fields.location, slot, agendaItemId],
    });
  } else {
    const inserted = await db.execute({
      sql: `INSERT INTO conference_agenda_items
              (conference_id, day_label, start_time, end_time, session_type, title, description, location, sort_order, social_event_id)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
            RETURNING id`,
      args: [ev.conference_id, fields.day_label, fields.start_time, fields.session_type,
             fields.title, fields.description, fields.location, slot, ev.id],
    });
    agendaItemId = Number(inserted.rows[0].id);
  }

  // ── My Agenda for the internal attendees ────────────────────────────────
  const emails = await resolveAttendeeEmails(db, ev.internal_attendees);

  const currentRes = await db.execute({
    sql: 'SELECT id, user_email FROM conference_my_agenda_items WHERE conference_id = ? AND agenda_item_id = ?',
    args: [ev.conference_id, agendaItemId],
  });
  const current = new Map(currentRes.rows.map(row => [String(row.user_email), Number(row.id)]));

  // Someone taken off the event loses the entry again.
  for (const [email, rowId] of Array.from(current.entries())) {
    if (!emails.includes(email)) {
      await db.execute({ sql: 'DELETE FROM conference_my_agenda_items WHERE id = ?', args: [rowId] });
    }
  }

  for (const email of emails) {
    if (current.has(email)) {
      // Keep an existing entry's own notes, just refresh the event details.
      await db.execute({
        sql: `UPDATE conference_my_agenda_items
              SET day_label = ?, start_time = ?, end_time = NULL, session_type = ?,
                  title = ?, description = ?, location = ?
              WHERE id = ?`,
        args: [fields.day_label, fields.start_time, fields.session_type, fields.title,
               fields.description, fields.location, current.get(email)!],
      });
      continue;
    }
    await db.execute({
      sql: `INSERT INTO conference_my_agenda_items
              (conference_id, user_email, source_type, agenda_item_id, day_label, start_time, end_time, session_type, title, description, location)
            VALUES (?, ?, 'agenda', ?, ?, ?, NULL, ?, ?, ?, ?)`,
      args: [ev.conference_id, email, agendaItemId, fields.day_label, fields.start_time,
             fields.session_type, fields.title, fields.description, fields.location],
    });
  }
}

/** Drop a deleted social event's mirror row. Call before the event row goes away. */
export async function removeSocialEventFromAgenda(db: Client, socialEventId: number): Promise<void> {
  const res = await db.execute({
    sql: 'SELECT conference_id FROM social_events WHERE id = ?',
    args: [socialEventId],
  });
  if (res.rows.length === 0) return;
  await removeMirror(db, Number(res.rows[0].conference_id), socialEventId);
}

/** Re-slot every company-hosted event for a conference — used after an agenda upload. */
export async function resyncConferenceSocialEvents(db: Client, conferenceId: number): Promise<void> {
  const res = await db.execute({
    sql: 'SELECT id FROM social_events WHERE conference_id = ? AND company_hosted = 1 ORDER BY id ASC',
    args: [conferenceId],
  });
  for (const row of res.rows) {
    await syncSocialEventAgenda(db, Number(row.id));
  }
}
