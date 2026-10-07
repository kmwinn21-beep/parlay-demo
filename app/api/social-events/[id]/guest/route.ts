import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
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
  const db = await getDb(user?.accountId);
  try {
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

    /*
     * The guest list and the RSVP row go in together, or neither does.
     *
     * They used to be two execute() calls, and the second one could fail on
     * its own: the attendee was then listed as invited with no RSVP record, so
     * the drawer counted them under INVITED and the RSVP columns disagreed —
     * and the client, seeing the request fail, never reloaded, so the list it
     * showed was the one from before the half-write.
     *
     * The INSERT is guarded by a SELECT rather than by ON CONFLICT.
     *
     * ON CONFLICT names a constraint, and naming one that an account's
     * database does not have is an error rather than a no-op: "ON CONFLICT
     * clause does not match any PRIMARY KEY or UNIQUE constraint". The
     * composite key is in the CREATE TABLE, but that statement is IF NOT
     * EXISTS, so a database whose table predates it keeps whatever shape it
     * was made with and every guest add fails with a 500. Reproduced against a
     * real SQLite file built that way: POST returns 500, prospect_attendees is
     * updated anyway, and no RSVP row is written — which is the half-write
     * above. WHERE NOT EXISTS asks about rows instead of about constraints, so
     * it behaves the same on either shape.
     */
    const statements = [];
    if (!existing.includes(aid)) {
      statements.push({
        sql: 'UPDATE social_events SET prospect_attendees = ? WHERE id = ?',
        args: [[...existing, aid].join(','), id],
      });
    }
    statements.push({
      sql: `INSERT INTO social_event_rsvps (social_event_id, attendee_id, rsvp_status, updated_at)
            SELECT ?, ?, 'maybe', datetime('now')
            WHERE NOT EXISTS (
              SELECT 1 FROM social_event_rsvps
              WHERE social_event_id = ? AND attendee_id = ?
            )`,
      args: [id, aid, id, aid],
    });
    await db.batch(statements, 'write');

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
        const changedByConfigId = await getConfigIdByEmail(db, user.email);
        notifyForAttendee(db, {
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
  const db = await getDb(authResult?.accountId);
  try {
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
