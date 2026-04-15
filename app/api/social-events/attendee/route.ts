import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

// Returns all social events where the given attendee is on the guest list (prospect_attendees),
// joined with conference name and RSVP status.
export async function GET(request: NextRequest) {
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const attendeeId = searchParams.get('attendee_id');

    if (!attendeeId) {
      return NextResponse.json({ error: 'attendee_id is required' }, { status: 400 });
    }

    const aid = Number(attendeeId);

    // Fetch all social events for conferences this attendee is registered in,
    // then filter to events where the attendee appears in prospect_attendees.
    const result = await db.execute({
      sql: `SELECT se.id as event_id, se.event_name, se.event_type, se.conference_id,
                   se.prospect_attendees, c.name as conference_name,
                   r.rsvp_status
            FROM social_events se
            JOIN conferences c ON c.id = se.conference_id
            JOIN conference_attendees ca ON ca.conference_id = se.conference_id AND ca.attendee_id = ?
            LEFT JOIN social_event_rsvps r ON r.social_event_id = se.id AND r.attendee_id = ?
            ORDER BY c.name ASC, se.event_name ASC`,
      args: [aid, aid],
    });

    // Filter to events where the attendee ID appears in the comma-separated prospect_attendees
    const items = result.rows
      .filter(r => {
        const ids = String(r.prospect_attendees || '')
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n) && n > 0);
        return ids.includes(aid);
      })
      .map(r => ({
        event_id: Number(r.event_id),
        event_name: r.event_name ? String(r.event_name) : null,
        event_type: r.event_type ? String(r.event_type) : null,
        conference_id: Number(r.conference_id),
        conference_name: String(r.conference_name),
        rsvp_status: r.rsvp_status ? String(r.rsvp_status) : null,
      }));

    return NextResponse.json(items);
  } catch (error) {
    console.error('GET /api/social-events/attendee error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendee events' }, { status: 500 });
  }
}
