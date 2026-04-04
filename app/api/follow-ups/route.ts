import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const attendeeId = searchParams.get('attendee_id');
    const conferenceId = searchParams.get('conference_id');
    const companyId = searchParams.get('company_id');

    const conditions = ["cad.next_steps IS NOT NULL AND cad.next_steps != ''"];
    const args: (string | number)[] = [];

    if (attendeeId) {
      conditions.push('cad.attendee_id = ?');
      args.push(attendeeId);
    }
    if (conferenceId) {
      conditions.push('cad.conference_id = ?');
      args.push(conferenceId);
    }
    if (companyId) {
      conditions.push('a.company_id = ?');
      args.push(companyId);
    }

    const result = await db.execute({
      sql: `
        SELECT
          cad.attendee_id,
          cad.conference_id,
          cad.next_steps,
          cad.next_steps_notes,
          cad.completed,
          a.first_name,
          a.last_name,
          a.title,
          co.name AS company_name,
          c.name AS conference_name,
          c.start_date,
          (SELECT COUNT(*) FROM entity_notes en WHERE en.entity_type = 'attendee' AND en.entity_id = a.id) AS entity_notes_count
        FROM conference_attendee_details cad
        JOIN attendees a ON cad.attendee_id = a.id
        LEFT JOIN companies co ON a.company_id = co.id
        JOIN conferences c ON cad.conference_id = c.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.start_date DESC, a.last_name, a.first_name
      `,
      args,
    });

    return NextResponse.json(
      result.rows.map((r) => ({
        attendee_id: Number(r.attendee_id),
        conference_id: Number(r.conference_id),
        next_steps: String(r.next_steps ?? ''),
        next_steps_notes: r.next_steps_notes != null ? String(r.next_steps_notes) : null,
        completed: Number(r.completed ?? 0) === 1,
        first_name: String(r.first_name ?? ''),
        last_name: String(r.last_name ?? ''),
        title: r.title != null ? String(r.title) : null,
        company_name: r.company_name != null ? String(r.company_name) : null,
        conference_name: String(r.conference_name ?? ''),
        start_date: String(r.start_date ?? ''),
        entity_notes_count: Number(r.entity_notes_count ?? 0),
      }))
    );
  } catch (error) {
    console.error('GET /api/follow-ups error:', error);
    return NextResponse.json({ error: 'Failed to fetch follow-ups' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await dbReady;
    const { attendee_id, conference_id } = await request.json();

    if (attendee_id == null || conference_id == null) {
      return NextResponse.json({ error: 'attendee_id and conference_id are required' }, { status: 400 });
    }

    await db.execute({
      sql: 'UPDATE conference_attendee_details SET next_steps = NULL, next_steps_notes = NULL, completed = 0 WHERE attendee_id = ? AND conference_id = ?',
      args: [attendee_id, conference_id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/follow-ups error:', error);
    return NextResponse.json({ error: 'Failed to delete follow-up' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await dbReady;
    const { attendee_id, conference_id, completed } = await request.json();

    if (attendee_id == null || conference_id == null || completed == null) {
      return NextResponse.json({ error: 'attendee_id, conference_id, and completed are required' }, { status: 400 });
    }

    await db.execute({
      sql: 'UPDATE conference_attendee_details SET completed = ? WHERE attendee_id = ? AND conference_id = ?',
      args: [completed ? 1 : 0, attendee_id, conference_id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/follow-ups error:', error);
    return NextResponse.json({ error: 'Failed to update follow-up' }, { status: 500 });
  }
}
