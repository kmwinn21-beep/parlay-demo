import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

// Add an attendee to a social event's guest list.
// Updates prospect_attendees and creates an RSVP record.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const { id } = params;
    const body = await request.json();
    const { attendee_id } = body;

    if (!attendee_id) {
      return NextResponse.json({ error: 'attendee_id is required' }, { status: 400 });
    }

    const aid = Number(attendee_id);

    // Fetch current event
    const evResult = await db.execute({
      sql: 'SELECT id, prospect_attendees FROM social_events WHERE id = ?',
      args: [id],
    });

    if (evResult.rows.length === 0) {
      return NextResponse.json({ error: 'Social event not found' }, { status: 404 });
    }

    const ev = evResult.rows[0];
    const existing = String(ev.prospect_attendees || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);

    if (!existing.includes(aid)) {
      const updated = [...existing, aid].join(',');
      await db.execute({
        sql: 'UPDATE social_events SET prospect_attendees = ? WHERE id = ?',
        args: [updated, id],
      });
    }

    // Upsert RSVP record with 'maybe' (invited) status
    await db.execute({
      sql: `INSERT INTO social_event_rsvps (social_event_id, attendee_id, rsvp_status, updated_at)
            VALUES (?, ?, 'maybe', datetime('now'))
            ON CONFLICT (social_event_id, attendee_id) DO NOTHING`,
      args: [id, aid],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/social-events/[id]/guest error:', error);
    return NextResponse.json({ error: 'Failed to add guest' }, { status: 500 });
  }
}
