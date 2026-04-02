import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const conference = db
      .prepare('SELECT * FROM conferences WHERE id = ?')
      .get(params.id);

    if (!conference) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    const attendees = db
      .prepare(
        `SELECT a.*, c.name as company_name, c.company_type
         FROM attendees a
         JOIN conference_attendees ca ON a.id = ca.attendee_id
         LEFT JOIN companies c ON a.company_id = c.id
         WHERE ca.conference_id = ?
         ORDER BY a.last_name, a.first_name`
      )
      .all(params.id);

    return NextResponse.json({ ...conference as object, attendees });
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
    const body = await request.json();
    const { name, start_date, end_date, location, notes } = body;

    const db = getDb();

    const existing = db.prepare('SELECT id FROM conferences WHERE id = ?').get(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    const updated = db
      .prepare(
        'UPDATE conferences SET name = ?, start_date = ?, end_date = ?, location = ?, notes = ? WHERE id = ? RETURNING *'
      )
      .get(name, start_date, end_date, location, notes || null, params.id);

    return NextResponse.json(updated);
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
    const db = getDb();

    const existing = db.prepare('SELECT id FROM conferences WHERE id = ?').get(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM conference_attendees WHERE conference_id = ?').run(params.id);
    db.prepare('DELETE FROM conferences WHERE id = ?').run(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete conference' }, { status: 500 });
  }
}
