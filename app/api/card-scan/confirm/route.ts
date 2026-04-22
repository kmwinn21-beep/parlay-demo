import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { attendee_id, conference_id } = await request.json() as {
      attendee_id: number; conference_id: number;
    };
    if (!attendee_id || !conference_id) {
      return NextResponse.json({ error: 'attendee_id and conference_id required' }, { status: 400 });
    }

    await dbReady;

    // Associate attendee with conference
    await db.execute({
      sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
      args: [conference_id, attendee_id],
    });

    // Find the "Bus. Card" next_steps config option
    const busCardRow = await db.execute({
      sql: `SELECT id, value FROM config_options
            WHERE category = 'next_steps' AND (LOWER(value) LIKE '%bus%card%' OR LOWER(value) LIKE '%business%card%')
            LIMIT 1`,
      args: [],
    });
    const nextStepsValue = busCardRow.rows[0] ? String(busCardRow.rows[0].value) : 'Bus. Card';

    // Create follow-up
    const result = await db.execute({
      sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes)
            VALUES (?, ?, ?, ?)`,
      args: [attendee_id, conference_id, nextStepsValue, 'Follow up from business card scan'],
    });

    return NextResponse.json({ success: true, follow_up_id: Number(result.lastInsertRowid) });
  } catch (error) {
    console.error('POST /api/card-scan/confirm error:', error);
    return NextResponse.json({ error: 'Confirm failed' }, { status: 500 });
  }
}
