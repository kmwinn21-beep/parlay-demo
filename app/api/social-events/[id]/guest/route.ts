import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, notifyForAttendee } from '@/lib/notifications';

// Add an attendee to a social event's guest list.
// Updates prospect_attendees and creates an RSVP record.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
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

    // Return success before best-effort notification so DB failures in
    // notification lookup never surface as a guest-add failure to the client.
    const response = NextResponse.json({ success: true });

    // Notify company assignees for this attendee (best-effort, non-blocking)
    try {
      const attendeeRow = await db.execute({
        sql: 'SELECT first_name, last_name FROM attendees WHERE id = ?',
        args: [aid],
      });
      if (attendeeRow.rows.length > 0) {
        const a = attendeeRow.rows[0];
        const attendeeName = `${a.first_name} ${a.last_name}`.trim();
        const eventRow = await db.execute({ sql: 'SELECT name FROM social_events WHERE id = ?', args: [id] });
        const eventName = eventRow.rows.length > 0 ? String(eventRow.rows[0].name) : `Social Event #${id}`;
        const changedByConfigId = await getConfigIdByEmail(user.email);
        notifyForAttendee({
          attendeeId: aid,
          attendeeName,
          message: `${attendeeName} added to guest list for ${eventName}`,
          changedByEmail: user.email,
          changedByConfigId,
        });
      }
    } catch { /* non-fatal */ }

    return response;
  } catch (error) {
    console.error('POST /api/social-events/[id]/guest error:', error);
    return NextResponse.json({ error: 'Failed to add guest' }, { status: 500 });
  }
}

// Remove an attendee from a social event's guest list.
// Strips the ID from prospect_attendees and deletes their RSVP record.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { id } = params;
    const body = await request.json();
    const { attendee_id } = body;

    if (!attendee_id) {
      return NextResponse.json({ error: 'attendee_id is required' }, { status: 400 });
    }

    const aid = Number(attendee_id);

    const evResult = await db.execute({
      sql: 'SELECT prospect_attendees FROM social_events WHERE id = ?',
      args: [id],
    });

    if (evResult.rows.length === 0) {
      return NextResponse.json({ error: 'Social event not found' }, { status: 404 });
    }

    const remaining = String(evResult.rows[0].prospect_attendees || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0 && n !== aid);

    await db.execute({
      sql: 'UPDATE social_events SET prospect_attendees = ? WHERE id = ?',
      args: [remaining.length > 0 ? remaining.join(',') : null, id],
    });

    await db.execute({
      sql: 'DELETE FROM social_event_rsvps WHERE social_event_id = ? AND attendee_id = ?',
      args: [id, aid],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/social-events/[id]/guest error:', error);
    return NextResponse.json({ error: 'Failed to remove guest' }, { status: 500 });
  }
}
