import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { parseFile } from '@/lib/parsers';
import { getOrCreateCompany, getOrCreateAttendee } from '@/lib/fuzzy';

export async function GET() {
  try {
    const db = getDb();
    const conferences = db
      .prepare(
        `SELECT c.*, COUNT(ca.attendee_id) as attendee_count
         FROM conferences c
         LEFT JOIN conference_attendees ca ON c.id = ca.conference_id
         GROUP BY c.id
         ORDER BY c.start_date DESC`
      )
      .all();

    return NextResponse.json(conferences);
  } catch (error) {
    console.error('GET /api/conferences error:', error);
    return NextResponse.json({ error: 'Failed to fetch conferences' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const start_date = formData.get('start_date') as string;
    const end_date = formData.get('end_date') as string;
    const location = formData.get('location') as string;
    const notes = formData.get('notes') as string | null;
    const file = formData.get('file') as File | null;

    if (!name || !start_date || !end_date || !location) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb();

    const conference = db
      .prepare(
        'INSERT INTO conferences (name, start_date, end_date, location, notes) VALUES (?, ?, ?, ?, ?) RETURNING *'
      )
      .get(name, start_date, end_date, location, notes || null) as { id: number; name: string; start_date: string; end_date: string; location: string; notes: string; created_at: string };

    let parsedCount = 0;

    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsedAttendees = await parseFile(buffer, file.name);

      for (const parsed of parsedAttendees) {
        if (!parsed.first_name && !parsed.last_name) continue;

        let companyId: number | undefined;
        if (parsed.company) {
          const cId = getOrCreateCompany(parsed.company);
          if (cId > 0) companyId = cId;
        }

        const attendeeId = getOrCreateAttendee(
          parsed.first_name,
          parsed.last_name,
          parsed.title,
          companyId,
          parsed.email
        );

        // Tag attendee with this conference
        db.prepare(
          'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)'
        ).run(conference.id, attendeeId);

        parsedCount++;
      }
    }

    return NextResponse.json({ ...conference, parsed_count: parsedCount }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create conference' },
      { status: 500 }
    );
  }
}
