import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { getSessionUser } from '@/lib/auth';
import { syncSocialEventAgenda } from '@/lib/socialEventAgenda';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const { searchParams } = new URL(request.url);
    const conferenceId = searchParams.get('conference_id');

    if (!conferenceId) {
      return NextResponse.json({ error: 'conference_id is required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `SELECT id, conference_id, entered_by, internal_attendees, event_name, event_type, host,
                   venue_name, location, company_hosted, event_date, event_time, invite_only, prospect_attendees, notes, guest_limit, created_at
            FROM social_events
            WHERE conference_id = ?
            ORDER BY event_date ASC, event_time ASC`,
      args: [conferenceId],
    });

    const eventIds = result.rows.map(r => Number(r.id));
    const rsvpsByEventId: Record<number, Array<{ attendee_id: number; rsvp_status: string; rep_rank: number | null; team_rank: number | null }>> = {};
    if (eventIds.length > 0) {
      const rsvpResult = await db.execute({
        sql: `SELECT social_event_id, attendee_id, rsvp_status, rep_rank, team_rank FROM social_event_rsvps WHERE social_event_id IN (${eventIds.map(() => '?').join(',')})`,
        args: eventIds,
      });
      for (const r of rsvpResult.rows) {
        const eid = Number(r.social_event_id);
        if (!rsvpsByEventId[eid]) rsvpsByEventId[eid] = [];
        rsvpsByEventId[eid].push({
          attendee_id: Number(r.attendee_id),
          rsvp_status: String(r.rsvp_status),
          rep_rank: r.rep_rank != null ? Number(r.rep_rank) : null,
          team_rank: r.team_rank != null ? Number(r.team_rank) : null,
        });
      }
    }

    return NextResponse.json(
      result.rows.map((r) => ({
        id: Number(r.id),
        conference_id: Number(r.conference_id),
        entered_by: r.entered_by ? String(r.entered_by) : null,
        internal_attendees: r.internal_attendees ? String(r.internal_attendees) : null,
        event_name: r.event_name ? String(r.event_name) : null,
        event_type: r.event_type ? String(r.event_type) : null,
        host: r.host ? String(r.host) : null,
        venue_name: r.venue_name ? String(r.venue_name) : null,
        guest_limit: r.guest_limit != null ? Number(r.guest_limit) : null,
        location: r.location ? String(r.location) : null,
        company_hosted: Number(r.company_hosted ?? 0) === 1,
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
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const body = await request.json();
    const {
      conference_id,
      entered_by,
      internal_attendees,
      event_name,
      event_type,
      host,
      venue_name,
      guest_limit,
      location,
      company_hosted,
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
      sql: `INSERT INTO social_events (conference_id, entered_by, internal_attendees, event_name, event_type, host, venue_name, location, company_hosted, event_date, event_time, invite_only, prospect_attendees, notes, guest_limit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id, conference_id, entered_by, internal_attendees, event_name, event_type, host, venue_name, location, company_hosted, event_date, event_time, invite_only, prospect_attendees, notes, guest_limit, created_at`,
      args: [
        conference_id,
        entered_by || null,
        internal_attendees || null,
        event_name || null,
        event_type || null,
        host || null,
        venue_name || null,
        location || null,
        company_hosted ? 1 : 0,
        event_date || null,
        event_time || null,
        invite_only || 'No',
        prospect_attendees || null,
        notes || null,
        // Optional and numeric. An empty field is "no limit", not zero.
        Number.isFinite(Number(guest_limit)) && Number(guest_limit) > 0 ? Math.floor(Number(guest_limit)) : null,
      ],
    });

    const r = result.rows[0];

    // Company-hosted events mirror onto the conference agenda (and the
    // internal attendees' My Agenda). Never let that fail the create.
    try {
      await syncSocialEventAgenda(db, Number(r.id));
    } catch (err) {
      console.error('syncSocialEventAgenda after create failed:', err);
    }

    return NextResponse.json({
      id: Number(r.id),
      conference_id: Number(r.conference_id),
      entered_by: r.entered_by ? String(r.entered_by) : null,
      internal_attendees: r.internal_attendees ? String(r.internal_attendees) : null,
      event_name: r.event_name ? String(r.event_name) : null,
      event_type: r.event_type ? String(r.event_type) : null,
      host: r.host ? String(r.host) : null,
      venue_name: r.venue_name ? String(r.venue_name) : null,
      location: r.location ? String(r.location) : null,
      company_hosted: Number(r.company_hosted ?? 0) === 1,
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
