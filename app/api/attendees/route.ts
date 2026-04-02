import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const attendees = db
      .prepare(
        `SELECT a.*, co.name as company_name, co.company_type,
                COUNT(DISTINCT ca.conference_id) as conference_count
         FROM attendees a
         LEFT JOIN companies co ON a.company_id = co.id
         LEFT JOIN conference_attendees ca ON a.id = ca.attendee_id
         GROUP BY a.id
         ORDER BY a.last_name, a.first_name`
      )
      .all();

    return NextResponse.json(attendees);
  } catch (error) {
    console.error('GET /api/attendees error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { first_name, last_name, title, company_id, email, notes } = body;

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    const db = getDb();
    const attendee = db
      .prepare(
        'INSERT INTO attendees (first_name, last_name, title, company_id, email, notes) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
      )
      .get(first_name, last_name, title || null, company_id || null, email || null, notes || null);

    return NextResponse.json(attendee, { status: 201 });
  } catch (error) {
    console.error('POST /api/attendees error:', error);
    return NextResponse.json({ error: 'Failed to create attendee' }, { status: 500 });
  }
}
