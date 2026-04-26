import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail } from '@/lib/notifications';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const conferenceId = Number(params.id);

    // User's saved my-agenda items
    const itemsRes = await db.execute({
      sql: `SELECT id, source_type, agenda_item_id, meeting_id, day_label, start_time, end_time,
                   session_type, title, description, location, note_content, entity_note_ids,
                   attendee_id, company_id, attendee_name, company_name, conference_name
            FROM conference_my_agenda_items
            WHERE conference_id = ? AND user_email = ?
            ORDER BY created_at ASC`,
      args: [conferenceId, user.email],
    });

    const myItems = itemsRes.rows.map(r => ({
      id: Number(r.id),
      source_type: String(r.source_type),
      agenda_item_id: r.agenda_item_id != null ? Number(r.agenda_item_id) : null,
      meeting_id: r.meeting_id != null ? Number(r.meeting_id) : null,
      day_label: String(r.day_label),
      start_time: r.start_time ? String(r.start_time) : null,
      end_time: r.end_time ? String(r.end_time) : null,
      session_type: r.session_type ? String(r.session_type) : null,
      title: String(r.title),
      description: r.description ? String(r.description) : null,
      location: r.location ? String(r.location) : null,
      note_content: r.note_content ? String(r.note_content) : null,
      entity_note_ids: r.entity_note_ids ? String(r.entity_note_ids) : null,
      attendee_id: r.attendee_id != null ? Number(r.attendee_id) : null,
      company_id: r.company_id != null ? Number(r.company_id) : null,
      attendee_name: r.attendee_name ? String(r.attendee_name) : null,
      company_name: r.company_name ? String(r.company_name) : null,
      conference_name: r.conference_name ? String(r.conference_name) : null,
    }));

    // Meetings for this conference scheduled by the current user
    const configId = await getConfigIdByEmail(user.email);
    let meetings: unknown[] = [];
    if (configId != null) {
      const meetingsRes = await db.execute({
        sql: `SELECT m.id, m.attendee_id, m.conference_id, m.meeting_date, m.meeting_time,
                     m.location, m.scheduled_by, m.additional_attendees, m.outcome, m.meeting_type,
                     a.first_name, a.last_name, a.title as attendee_title,
                     co.id AS company_id, co.name AS company_name,
                     c.name AS conference_name
              FROM meetings m
              JOIN attendees a ON m.attendee_id = a.id
              LEFT JOIN companies co ON a.company_id = co.id
              JOIN conferences c ON m.conference_id = c.id
              WHERE m.conference_id = ?
                AND (',' || REPLACE(COALESCE(m.scheduled_by,''), ' ', '') || ',') LIKE ?
              ORDER BY m.meeting_date ASC, m.meeting_time ASC`,
        args: [conferenceId, `%,${configId},%`],
      });
      meetings = meetingsRes.rows.map(r => ({
        id: Number(r.id),
        attendee_id: Number(r.attendee_id),
        conference_id: Number(r.conference_id),
        meeting_date: String(r.meeting_date ?? ''),
        meeting_time: String(r.meeting_time ?? ''),
        location: r.location ? String(r.location) : null,
        scheduled_by: r.scheduled_by ? String(r.scheduled_by) : null,
        outcome: r.outcome ? String(r.outcome) : null,
        meeting_type: r.meeting_type ? String(r.meeting_type) : null,
        first_name: String(r.first_name ?? ''),
        last_name: String(r.last_name ?? ''),
        attendee_title: r.attendee_title ? String(r.attendee_title) : null,
        company_id: r.company_id != null ? Number(r.company_id) : null,
        company_name: r.company_name ? String(r.company_name) : null,
        conference_name: String(r.conference_name ?? ''),
      }));
    }

    return NextResponse.json({ myItems, meetings });
  } catch (error) {
    console.error('GET /api/conferences/[id]/my-agenda error:', error);
    return NextResponse.json({ error: 'Failed to fetch my agenda' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const conferenceId = Number(params.id);
    const body = await request.json() as {
      source_type: string;
      agenda_item_id?: number | null;
      day_label: string;
      start_time?: string | null;
      end_time?: string | null;
      session_type?: string | null;
      title: string;
      description?: string | null;
      location?: string | null;
    };

    // Check not already added (for agenda items)
    if (body.agenda_item_id) {
      const exists = await db.execute({
        sql: 'SELECT id FROM conference_my_agenda_items WHERE conference_id=? AND user_email=? AND agenda_item_id=?',
        args: [conferenceId, user.email, body.agenda_item_id],
      });
      if (exists.rows.length > 0) {
        return NextResponse.json({ id: Number(exists.rows[0].id) });
      }
    }

    const result = await db.execute({
      sql: `INSERT INTO conference_my_agenda_items
              (conference_id, user_email, source_type, agenda_item_id, day_label, start_time, end_time, session_type, title, description, location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id`,
      args: [
        conferenceId, user.email,
        body.source_type ?? 'agenda',
        body.agenda_item_id ?? null,
        body.day_label, body.start_time ?? null, body.end_time ?? null,
        body.session_type ?? null, body.title,
        body.description ?? null, body.location ?? null,
      ],
    });

    return NextResponse.json({ id: Number(result.rows[0].id) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences/[id]/my-agenda error:', error);
    return NextResponse.json({ error: 'Failed to add to my agenda' }, { status: 500 });
  }
}
