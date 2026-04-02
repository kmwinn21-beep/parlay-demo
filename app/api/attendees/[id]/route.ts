import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const attendeeResult = await db.execute({
      sql: `SELECT a.*, co.name as company_name, co.company_type, co.website as company_website
            FROM attendees a
            LEFT JOIN companies co ON a.company_id = co.id
            WHERE a.id = ?`,
      args: [params.id],
    });

    if (attendeeResult.rows.length === 0) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    const attendee = attendeeResult.rows[0];

    const conferencesResult = await db.execute({
      sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location
            FROM conferences c
            JOIN conference_attendees ca ON c.id = ca.conference_id
            WHERE ca.attendee_id = ?
            ORDER BY c.start_date DESC`,
      args: [params.id],
    });

    const conferences = conferencesResult.rows.map((r) => ({ ...r }));

    return NextResponse.json({ ...attendee, conferences });
  } catch (error) {
    console.error('GET /api/attendees/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendee' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const body = await request.json();
    const { first_name, last_name, title, company_id, email, notes } = body;

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    const existingResult = await db.execute({
      sql: 'SELECT id FROM attendees WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    const updatedResult = await db.execute({
      sql: 'UPDATE attendees SET first_name = ?, last_name = ?, title = ?, company_id = ?, email = ?, notes = ? WHERE id = ? RETURNING *',
      args: [first_name, last_name, title || null, company_id || null, email || null, notes || null, params.id],
    });

    return NextResponse.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('PUT /api/attendees/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update attendee' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;

    const existingResult = await db.execute({
      sql: 'SELECT id FROM attendees WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    await db.batch(
      [
        { sql: 'DELETE FROM conference_attendees WHERE attendee_id = ?', args: [params.id] },
        { sql: 'DELETE FROM attendees WHERE id = ?', args: [params.id] },
      ],
      'write'
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/attendees/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete attendee' }, { status: 500 });
  }
}
