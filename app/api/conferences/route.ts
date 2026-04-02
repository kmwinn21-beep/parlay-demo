import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { parseFile } from '@/lib/parsers';
import { getOrCreateCompany, getOrCreateAttendee } from '@/lib/fuzzy';

export async function GET() {
  try {
    await dbReady;
    const result = await db.execute({
      sql: `SELECT c.*, COUNT(ca.attendee_id) as attendee_count
            FROM conferences c
            LEFT JOIN conference_attendees ca ON c.id = ca.conference_id
            GROUP BY c.id
            ORDER BY c.start_date DESC`,
      args: [],
    });

    const conferences = result.rows.map((r) => ({ ...r }));
    return NextResponse.json(conferences);
  } catch (error) {
    console.error('GET /api/conferences error:', error);
    return NextResponse.json({ error: 'Failed to fetch conferences' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbReady;
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

    const confResult = await db.execute({
      sql: 'INSERT INTO conferences (name, start_date, end_date, location, notes) VALUES (?, ?, ?, ?, ?) RETURNING *',
      args: [name, start_date, end_date, location, notes || null],
    });

    const conference = confResult.rows[0] as unknown as {
      id: number | bigint;
      name: string;
      start_date: string;
      end_date: string;
      location: string;
      notes: string | null;
      created_at: string;
    };
    const conferenceId = Number(conference.id);

    let parsedCount = 0;

    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsedAttendees = await parseFile(buffer, file.name);

      for (const parsed of parsedAttendees) {
        if (!parsed.first_name && !parsed.last_name) continue;

        let companyId: number | undefined;
        if (parsed.company) {
          const cId = await getOrCreateCompany(parsed.company);
          if (cId > 0) companyId = cId;
        }

        const attendeeId = await getOrCreateAttendee(
          parsed.first_name,
          parsed.last_name,
          parsed.title,
          companyId,
          parsed.email
        );

        await db.execute({
          sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
          args: [conferenceId, attendeeId],
        });

        parsedCount++;
      }
    }

    // Process manual attendees
    const manualAttendeesJson = formData.get('manual_attendees') as string | null;
    if (manualAttendeesJson) {
      try {
        const manualAttendees = JSON.parse(manualAttendeesJson) as Array<{
          first_name: string;
          last_name: string;
          title?: string;
          company?: string;
          email?: string;
        }>;

        for (const manual of manualAttendees) {
          if (!manual.first_name && !manual.last_name) continue;

          let companyId: number | undefined;
          if (manual.company) {
            const cId = await getOrCreateCompany(manual.company);
            if (cId > 0) companyId = cId;
          }

          const attendeeId = await getOrCreateAttendee(
            manual.first_name,
            manual.last_name,
            manual.title,
            companyId,
            manual.email
          );

          await db.execute({
            sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
            args: [conferenceId, attendeeId],
          });

          parsedCount++;
        }
      } catch {
        // ignore JSON parse errors
      }
    }

    return NextResponse.json({ ...conference, id: conferenceId, parsed_count: parsedCount }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create conference' },
      { status: 500 }
    );
  }
}
