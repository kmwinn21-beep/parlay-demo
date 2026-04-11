import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const attendee_id = searchParams.get('attendee_id');
    const conference_id = searchParams.get('conference_id');

    if (attendee_id && conference_id) {
      // Single record lookup
      const result = await db.execute({
        sql: 'SELECT * FROM conference_attendee_details WHERE attendee_id = ? AND conference_id = ?',
        args: [attendee_id, conference_id],
      });
      if (result.rows.length === 0) {
        return NextResponse.json(null);
      }
      return NextResponse.json(result.rows[0]);
    } else if (conference_id) {
      // All records for a conference
      const result = await db.execute({
        sql: 'SELECT * FROM conference_attendee_details WHERE conference_id = ?',
        args: [conference_id],
      });
      return NextResponse.json(result.rows);
    } else {
      return NextResponse.json({ error: 'conference_id is required' }, { status: 400 });
    }
  } catch (error) {
    console.error('GET /api/conference-details error:', error);
    return NextResponse.json({ error: 'Failed to fetch conference details' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { attendee_id, conference_id, action, next_steps, next_steps_notes, assigned_rep } = body;

    if (!attendee_id || !conference_id) {
      return NextResponse.json({ error: 'attendee_id and conference_id are required' }, { status: 400 });
    }

    // Ensure a conference_attendee_details row exists (for action tracking / analytics)
    await db.execute({
      sql: `INSERT INTO conference_attendee_details (attendee_id, conference_id, action)
            VALUES (?, ?, ?)
            ON CONFLICT(attendee_id, conference_id) DO UPDATE SET
              action = COALESCE(excluded.action, action)`,
      args: [attendee_id, conference_id, action ?? null],
    });

    // Create a new follow-up in the dedicated follow_ups table
    const result = await db.execute({
      sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        attendee_id,
        conference_id,
        next_steps ?? null,
        next_steps_notes ?? null,
        assigned_rep ?? null,
      ],
    });

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('POST /api/conference-details error:', error);
    return NextResponse.json({ error: 'Failed to create follow-up' }, { status: 500 });
  }
}
