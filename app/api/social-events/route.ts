import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const conferenceId = searchParams.get('conference_id');

    if (!conferenceId) {
      return NextResponse.json({ error: 'conference_id is required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `SELECT id, conference_id, entered_by, internal_attendees, event_type, host,
                   location, event_date, event_time, invite_only, prospect_attendees, notes, created_at
            FROM social_events
            WHERE conference_id = ?
            ORDER BY event_date ASC, event_time ASC`,
      args: [conferenceId],
    });

    const eventIds = result.rows.map(r => Number(r.id));
    const rsvpsByEventId: Record<number, Array<{ attendee_id: number; rsvp_status: string }>> = {};
    if (eventIds.length > 0) {
      const rsvpResult = await db.execute({
        sql: `SELECT social_event_id, attendee_id, rsvp_status FROM social_event_rsvps WHERE social_event_id IN (${eventIds.map(() => '?').join(',')})`,
        args: eventIds,
      });
      for (const r of rsvpResult.rows) {
        const eid = Number(r.social_event_id);
        if (!rsvpsByEventId[eid]) rsvpsByEventId[eid] = [];
        rsvpsByEventId[eid].push({ attendee_id: Number(r.attendee_id), rsvp_status: String(r.rsvp_status) });
      }
    }

    return NextResponse.json(
      result.rows.map((r) => ({
        id: Number(r.id),
        conference_id: Number(r.conference_id),
        entered_by: r.entered_by ? String(r.entered_by) : null,
        internal_attendees: r.internal_attendees ? String(r.internal_attendees) : null,
        event_type: r.event_type ? String(r.event_type) : null,
        host: r.host ? String(r.host) : null,
        location: r.location ? String(r.location) : null,
        event_date: r.event_date ? String(r.event_date) : null,
        event_time: r.event_time ? String(r.event_time) : null,
        invite_only: r.invite_only ? String(r.invite_only) : 'No',
        prospect_attendees: r.prospect_attendees ? String(r.prospect_attendees) : null,
        notes: r.notes ? String(r.notes) : null,
        created_at: String(r.created_at),
        rsvps: rsvpsByEventId[Number(r.id)] || [],
      }))
    );
  } catch (error) {
    console.error('GET /api/social-events error:', error);
    return NextResponse.json({ error: 'Failed to fetch social events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const {
      conference_id,
      entered_by,
      internal_attendees,
      event_type,
      host,
      location,
      event_date,
      event_time,
      invite_only,
      prospect_attendees,
      notes,
    } = body;

    if (!conference_id) {
      return NextResponse.json({ error: 'conference_id is required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `INSERT INTO social_events (conference_id, entered_by, internal_attendees, event_type, host, location, event_date, event_time, invite_only, prospect_attendees, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id, conference_id, entered_by, internal_attendees, event_type, host, location, event_date, event_time, invite_only, prospect_attendees, notes, created_at`,
      args: [
        conference_id,
        entered_by || null,
        internal_attendees || null,
        event_type || null,
        host || null,
        location || null,
        event_date || null,
        event_time || null,
        invite_only || 'No',
        prospect_attendees || null,
        notes || null,
      ],
    });

    const r = result.rows[0];
    return NextResponse.json({
      id: Number(r.id),
      conference_id: Number(r.conference_id),
      entered_by: r.entered_by ? String(r.entered_by) : null,
      internal_attendees: r.internal_attendees ? String(r.internal_attendees) : null,
      event_type: r.event_type ? String(r.event_type) : null,
      host: r.host ? String(r.host) : null,
      location: r.location ? String(r.location) : null,
      event_date: r.event_date ? String(r.event_date) : null,
      event_time: r.event_time ? String(r.event_time) : null,
      invite_only: r.invite_only ? String(r.invite_only) : 'No',
      prospect_attendees: r.prospect_attendees ? String(r.prospect_attendees) : null,
      notes: r.notes ? String(r.notes) : null,
      created_at: String(r.created_at),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/social-events error:', error);
    return NextResponse.json({ error: 'Failed to create social event' }, { status: 500 });
  }
}
