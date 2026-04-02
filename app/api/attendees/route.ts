import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET() {
  try {
    await dbReady;
    const result = await db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.company_id, a.email,
                   a.notes, a.action, a.next_steps, a.next_steps_notes,
                   COALESCE(a.status, 'Unknown') as status,
                   a.created_at,
                   co.name as company_name, co.company_type,
                   COUNT(DISTINCT ca.conference_id) as conference_count,
                   GROUP_CONCAT(DISTINCT c.name) as conference_names
            FROM attendees a
            LEFT JOIN companies co ON a.company_id = co.id
            LEFT JOIN conference_attendees ca ON a.id = ca.attendee_id
            LEFT JOIN conferences c ON ca.conference_id = c.id
            GROUP BY a.id
            ORDER BY a.last_name, a.first_name`,
      args: [],
    });

    const attendees = result.rows.map((r) => ({ ...r }));
    return NextResponse.json(attendees);
  } catch (error) {
    console.error('GET /api/attendees error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { first_name, last_name, title, company_id, email, notes } = body;

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: 'INSERT INTO attendees (first_name, last_name, title, company_id, email, notes) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      args: [first_name, last_name, title || null, company_id || null, email || null, notes || null],
    });

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('POST /api/attendees error:', error);
    return NextResponse.json({ error: 'Failed to create attendee' }, { status: 500 });
  }
}
