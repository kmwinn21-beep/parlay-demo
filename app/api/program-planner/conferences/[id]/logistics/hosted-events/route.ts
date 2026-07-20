import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

function mapRow(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    eventType: r.event_type ? String(r.event_type) : null,
    venueName: r.venue_name ? String(r.venue_name) : null,
    eventDate: r.event_date ? String(r.event_date) : null,
    eventTime: r.event_time ? String(r.event_time) : null,
    guestCap: r.guest_cap != null ? Number(r.guest_cap) : null,
    cateringConfirmed: Boolean(Number(r.catering_confirmed ?? 0)),
    invitationsSentDate: r.invitations_sent_date ? String(r.invitations_sent_date) : null,
    rsvpDeadline: r.rsvp_deadline ? String(r.rsvp_deadline) : null,
    notes: r.notes ? String(r.notes) : null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? '', 10);
  if (isNaN(year)) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  try {
    const res = await db.execute({
      sql: `SELECT id, event_type, venue_name, event_date, event_time, guest_cap,
                   catering_confirmed, invitations_sent_date, rsvp_deadline, notes
            FROM conference_plan_hosted_events WHERE conference_id = ? AND plan_year = ?
            ORDER BY event_date ASC, id ASC`,
      args: [confId, year],
    });
    return NextResponse.json({ hostedEvents: res.rows.map(r => mapRow(r as Record<string, unknown>)) });
  } catch (error) {
    console.error('GET .../logistics/hosted-events error:', error);
    return NextResponse.json({ error: 'Failed to fetch hosted events' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? '', 10);
  if (isNaN(year)) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  const body = await request.json();

  try {
    const result = await db.execute({
      sql: `INSERT INTO conference_plan_hosted_events
              (conference_id, plan_year, event_type, venue_name, event_date, event_time, guest_cap,
               catering_confirmed, invitations_sent_date, rsvp_deadline, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [
        confId, year, body.eventType || null, body.venueName || null, body.eventDate || null,
        body.eventTime || null, body.guestCap != null ? Number(body.guestCap) : null,
        body.cateringConfirmed ? 1 : 0, body.invitationsSentDate || null, body.rsvpDeadline || null, body.notes || null,
      ],
    });
    return NextResponse.json(mapRow(result.rows[0] as Record<string, unknown>), { status: 201 });
  } catch (error) {
    console.error('POST .../logistics/hosted-events error:', error);
    return NextResponse.json({ error: 'Failed to create hosted event' }, { status: 500 });
  }
}
