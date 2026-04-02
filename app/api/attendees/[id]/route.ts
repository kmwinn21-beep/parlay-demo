import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const attendee = db
      .prepare(
        `SELECT a.*, co.name as company_name, co.company_type, co.website as company_website
         FROM attendees a
         LEFT JOIN companies co ON a.company_id = co.id
         WHERE a.id = ?`
      )
      .get(params.id);

    if (!attendee) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    const conferences = db
      .prepare(
        `SELECT c.id, c.name, c.start_date, c.end_date, c.location
         FROM conferences c
         JOIN conference_attendees ca ON c.id = ca.conference_id
         WHERE ca.attendee_id = ?
         ORDER BY c.start_date DESC`
      )
      .all(params.id);

    return NextResponse.json({ ...attendee as object, conferences });
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
    const body = await request.json();
    const { first_name, last_name, title, company_id, email, notes } = body;

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    const db = getDb();

    const existing = db.prepare('SELECT id FROM attendees WHERE id = ?').get(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    const updated = db
      .prepare(
        'UPDATE attendees SET first_name = ?, last_name = ?, title = ?, company_id = ?, email = ?, notes = ? WHERE id = ? RETURNING *'
      )
      .get(first_name, last_name, title || null, company_id || null, email || null, notes || null, params.id);

    return NextResponse.json(updated);
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
    const db = getDb();

    const existing = db.prepare('SELECT id FROM attendees WHERE id = ?').get(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM conference_attendees WHERE attendee_id = ?').run(params.id);
    db.prepare('DELETE FROM attendees WHERE id = ?').run(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/attendees/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete attendee' }, { status: 500 });
  }
}
