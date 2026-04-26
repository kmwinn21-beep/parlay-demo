import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

/**
 * PUT — save or update the note for a my-agenda item.
 *
 * Body:
 *   item_id?:        number — if known, updates that row directly
 *   meeting_id?:     number — used to find/create the row for a meeting note
 *   note_content:    string — new note text (empty string = clear note)
 *
 * For agenda items (item_id provided):
 *   — saves entity_note to conference
 *
 * For meeting items:
 *   — upserts a conference_my_agenda_items row for the meeting
 *   — saves entity_notes to conference + attendee (if exists) + company (if exists)
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const conferenceId = Number(params.id);
    const body = await request.json() as {
      item_id?: number | null;
      meeting_id?: number | null;
      note_content: string;
    };

    const { note_content } = body;

    // ── Resolve / upsert the my_agenda row ──────────────────────────────────
    let row: {
      id: number;
      entity_note_ids: string | null;
      attendee_id: number | null;
      company_id: number | null;
      attendee_name: string | null;
      company_name: string | null;
      conference_name: string | null;
    } | null = null;

    if (body.item_id) {
      const r = await db.execute({
        sql: `SELECT id, entity_note_ids, attendee_id, company_id, attendee_name, company_name, conference_name
              FROM conference_my_agenda_items WHERE id = ? AND user_email = ?`,
        args: [body.item_id, user.email],
      });
      if (r.rows.length > 0) {
        const rx = r.rows[0];
        row = {
          id: Number(rx.id),
          entity_note_ids: rx.entity_note_ids ? String(rx.entity_note_ids) : null,
          attendee_id: rx.attendee_id != null ? Number(rx.attendee_id) : null,
          company_id: rx.company_id != null ? Number(rx.company_id) : null,
          attendee_name: rx.attendee_name ? String(rx.attendee_name) : null,
          company_name: rx.company_name ? String(rx.company_name) : null,
          conference_name: rx.conference_name ? String(rx.conference_name) : null,
        };
      }
    } else if (body.meeting_id) {
      // Find or create a my_agenda row for this meeting
      const existing = await db.execute({
        sql: `SELECT id, entity_note_ids, attendee_id, company_id, attendee_name, company_name, conference_name
              FROM conference_my_agenda_items
              WHERE conference_id = ? AND user_email = ? AND meeting_id = ?`,
        args: [conferenceId, user.email, body.meeting_id],
      });

      if (existing.rows.length > 0) {
        const rx = existing.rows[0];
        row = {
          id: Number(rx.id),
          entity_note_ids: rx.entity_note_ids ? String(rx.entity_note_ids) : null,
          attendee_id: rx.attendee_id != null ? Number(rx.attendee_id) : null,
          company_id: rx.company_id != null ? Number(rx.company_id) : null,
          attendee_name: rx.attendee_name ? String(rx.attendee_name) : null,
          company_name: rx.company_name ? String(rx.company_name) : null,
          conference_name: rx.conference_name ? String(rx.conference_name) : null,
        };
      } else {
        // Pull meeting details so we can denormalize
        const mRes = await db.execute({
          sql: `SELECT m.id, m.attendee_id, m.meeting_date, m.meeting_time, m.outcome, m.meeting_type,
                       a.first_name, a.last_name, co.id AS company_id, co.name AS company_name,
                       c.name AS conference_name
                FROM meetings m
                JOIN attendees a ON m.attendee_id = a.id
                LEFT JOIN companies co ON a.company_id = co.id
                JOIN conferences c ON m.conference_id = c.id
                WHERE m.id = ? AND m.conference_id = ?`,
          args: [body.meeting_id, conferenceId],
        });
        if (mRes.rows.length === 0) {
          return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }
        const m = mRes.rows[0];
        // Format day_label from meeting_date
        let dayLabel = String(m.meeting_date ?? '');
        try {
          dayLabel = new Date(`${dayLabel}T00:00:00`).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
          });
        } catch { /* keep raw */ }
        const attendeeName = `${String(m.first_name ?? '')} ${String(m.last_name ?? '')}`.trim();
        const insRes = await db.execute({
          sql: `INSERT INTO conference_my_agenda_items
                  (conference_id, user_email, source_type, meeting_id, day_label, start_time,
                   session_type, title, attendee_id, company_id, attendee_name, company_name, conference_name)
                VALUES (?, ?, 'meeting', ?, ?, ?, 'Meeting', ?, ?, ?, ?, ?, ?)
                RETURNING id`,
          args: [
            conferenceId, user.email, body.meeting_id, dayLabel,
            m.meeting_time ? String(m.meeting_time) : null,
            attendeeName || 'Meeting',
            m.attendee_id ? Number(m.attendee_id) : null,
            m.company_id != null ? Number(m.company_id) : null,
            attendeeName || null,
            m.company_name ? String(m.company_name) : null,
            m.conference_name ? String(m.conference_name) : null,
          ],
        });
        row = {
          id: Number(insRes.rows[0].id),
          entity_note_ids: null,
          attendee_id: m.attendee_id ? Number(m.attendee_id) : null,
          company_id: m.company_id != null ? Number(m.company_id) : null,
          attendee_name: attendeeName || null,
          company_name: m.company_name ? String(m.company_name) : null,
          conference_name: m.conference_name ? String(m.conference_name) : null,
        };
      }
    }

    if (!row) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    // ── Delete old entity_notes ──────────────────────────────────────────────
    if (row.entity_note_ids) {
      const oldIds = row.entity_note_ids.split(',').map(s => Number(s.trim())).filter(n => n > 0);
      await Promise.all(oldIds.map(noteId =>
        db.execute({ sql: 'DELETE FROM entity_notes WHERE id = ?', args: [noteId] }).catch(() => {})
      ));
    }

    if (!note_content?.trim()) {
      // Clearing the note — just wipe stored fields
      await db.execute({
        sql: 'UPDATE conference_my_agenda_items SET note_content = NULL, entity_note_ids = NULL WHERE id = ?',
        args: [row.id],
      });
      return NextResponse.json({ id: row.id, entity_note_ids: null });
    }

    // ── Save new entity_notes ────────────────────────────────────────────────
    const repName = user.email;
    const confName = row.conference_name ?? '';
    const newNoteIds: number[] = [];

    // Always save to conference
    const confNoteRes = await db.execute({
      sql: `INSERT INTO entity_notes (entity_type, entity_id, content, rep, conference_name, attendee_name, company_name)
            VALUES ('conference', ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [conferenceId, note_content.trim(), repName, confName, row.attendee_name ?? null, row.company_name ?? null],
    });
    newNoteIds.push(Number(confNoteRes.rows[0].id));

    // For meetings: also save to attendee and company
    if (row.attendee_id) {
      const attNoteRes = await db.execute({
        sql: `INSERT INTO entity_notes (entity_type, entity_id, content, rep, conference_name, attendee_name, company_name)
              VALUES ('attendee', ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [row.attendee_id, note_content.trim(), repName, confName, row.attendee_name ?? null, row.company_name ?? null],
      });
      newNoteIds.push(Number(attNoteRes.rows[0].id));
    }
    if (row.company_id) {
      const coNoteRes = await db.execute({
        sql: `INSERT INTO entity_notes (entity_type, entity_id, content, rep, conference_name, attendee_name, company_name)
              VALUES ('company', ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [row.company_id, note_content.trim(), repName, confName, row.attendee_name ?? null, row.company_name ?? null],
      });
      newNoteIds.push(Number(coNoteRes.rows[0].id));
    }

    const entityNoteIds = newNoteIds.join(',');
    await db.execute({
      sql: 'UPDATE conference_my_agenda_items SET note_content = ?, entity_note_ids = ? WHERE id = ?',
      args: [note_content.trim(), entityNoteIds, row.id],
    });

    return NextResponse.json({ id: row.id, entity_note_ids: entityNoteIds });
  } catch (error) {
    console.error('PUT /api/conferences/[id]/my-agenda/note error:', error);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}
