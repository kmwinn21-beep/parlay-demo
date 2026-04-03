import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const body = await request.json();
    const { first_name, last_name, title, company, email } = body as {
      first_name: string;
      last_name: string;
      title?: string;
      company?: string;
      email?: string;
    };

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'first_name and last_name are required' }, { status: 400 });
    }

    // Check conference exists
    const confResult = await db.execute({
      sql: 'SELECT id FROM conferences WHERE id = ?',
      args: [params.id],
    });
    if (confResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    // Fuzzy match: case-insensitive first+last name check
    const existingResult = await db.execute({
      sql: `SELECT a.*, c.name as company_name, c.company_type
            FROM attendees a
            LEFT JOIN companies c ON a.company_id = c.id
            WHERE LOWER(a.first_name) = LOWER(?) AND LOWER(a.last_name) = LOWER(?)
            LIMIT 1`,
      args: [first_name, last_name],
    });

    let attendeeId: number;
    let attendeeRow: Record<string, unknown>;

    if (existingResult.rows.length > 0) {
      // Found existing attendee — tag with conference
      attendeeId = Number(existingResult.rows[0].id);
      attendeeRow = { ...existingResult.rows[0] };
    } else {
      // Create new attendee
      let companyId: number | null = null;

      if (company) {
        // Find or create company
        const coResult = await db.execute({
          sql: 'SELECT id FROM companies WHERE LOWER(name) = LOWER(?)',
          args: [company],
        });
        if (coResult.rows.length > 0) {
          companyId = Number(coResult.rows[0].id);
        } else {
          const newCo = await db.execute({
            sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id',
            args: [company],
          });
          companyId = Number(newCo.rows[0].id);
        }
      }

      const newAttendee = await db.execute({
        sql: `INSERT INTO attendees (first_name, last_name, title, company_id, email)
              VALUES (?, ?, ?, ?, ?) RETURNING *`,
        args: [first_name, last_name, title ?? null, companyId, email ?? null],
      });

      attendeeId = Number(newAttendee.rows[0].id);

      // Fetch with company info
      const fullResult = await db.execute({
        sql: `SELECT a.*, c.name as company_name, c.company_type
              FROM attendees a
              LEFT JOIN companies c ON a.company_id = c.id
              WHERE a.id = ?`,
        args: [attendeeId],
      });
      attendeeRow = { ...fullResult.rows[0] };
    }

    // Tag attendee with this conference (ignore if already tagged)
    await db.execute({
      sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
      args: [params.id, attendeeId],
    });

    return NextResponse.json(attendeeRow, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences/[id]/attendees/add error:', error);
    return NextResponse.json({ error: 'Failed to add attendee' }, { status: 500 });
  }
}
