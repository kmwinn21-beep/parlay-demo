import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const confResult = await db.execute({
      sql: 'SELECT * FROM conferences WHERE id = ?',
      args: [params.id],
    });

    if (confResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    const conference = confResult.rows[0];

    const attendeesResult = await db.execute({
      sql: `SELECT a.*, c.name as company_name, c.company_type,
                   (SELECT COUNT(*) FROM conference_attendees ca2 WHERE ca2.attendee_id = a.id) as conference_count,
                   (SELECT GROUP_CONCAT(c2.name) FROM conference_attendees ca2 JOIN conferences c2 ON ca2.conference_id = c2.id WHERE ca2.attendee_id = a.id) as conference_names,
                   (SELECT COUNT(*) FROM entity_notes n WHERE n.entity_type = 'attendee' AND n.entity_id = a.id) as entity_notes_count
            FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id
            LEFT JOIN companies c ON a.company_id = c.id
            WHERE ca.conference_id = ?
            ORDER BY a.last_name, a.first_name`,
      args: [params.id],
    });

    const attendees = attendeesResult.rows.map((r) => ({ ...r }));

    return NextResponse.json({ ...conference, attendees });
  } catch (error) {
    console.error('GET /api/conferences/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch conference' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const body = await request.json();
    const { name, start_date, end_date, location, notes, internal_attendees } = body;

    const existingResult = await db.execute({
      sql: 'SELECT id FROM conferences WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    const updatedResult = await db.execute({
      sql: 'UPDATE conferences SET name = ?, start_date = ?, end_date = ?, location = ?, notes = ?, internal_attendees = ? WHERE id = ? RETURNING *',
      args: [name, start_date, end_date, location, notes || null, internal_attendees || null, params.id],
    });

    return NextResponse.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('PUT /api/conferences/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update conference' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const existingResult = await db.execute({
      sql: 'SELECT id FROM conferences WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    await db.batch(
      [
        { sql: 'DELETE FROM conference_attendees WHERE conference_id = ?', args: [params.id] },
        { sql: 'DELETE FROM conferences WHERE id = ?', args: [params.id] },
      ],
      'write'
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete conference' }, { status: 500 });
  }
}
