import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const { id } = params;
    const body = await request.json();
    const { attendee_id, rsvp_status } = body;

    if (!attendee_id || !rsvp_status) {
      return NextResponse.json({ error: 'attendee_id and rsvp_status are required' }, { status: 400 });
    }
    if (!['yes', 'no', 'maybe', 'attended'].includes(rsvp_status)) {
      return NextResponse.json({ error: 'rsvp_status must be yes, no, maybe, or attended' }, { status: 400 });
    }

    await db.execute({
      sql: `INSERT INTO social_event_rsvps (social_event_id, attendee_id, rsvp_status, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT (social_event_id, attendee_id)
            DO UPDATE SET rsvp_status = excluded.rsvp_status, updated_at = excluded.updated_at`,
      args: [id, attendee_id, rsvp_status],
    });

    return NextResponse.json({ success: true, rsvp_status });
  } catch (error) {
    console.error('PUT /api/social-events/[id]/rsvp error:', error);
    return NextResponse.json({ error: 'Failed to update RSVP' }, { status: 500 });
  }
}
