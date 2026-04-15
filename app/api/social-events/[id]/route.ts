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

    const existing = await db.execute({
      sql: 'SELECT id FROM social_events WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Social event not found' }, { status: 404 });
    }

    const {
      entered_by,
      internal_attendees,
      event_name,
      event_type,
      host,
      location,
      event_date,
      event_time,
      invite_only,
      prospect_attendees,
      notes,
    } = body;

    const result = await db.execute({
      sql: `UPDATE social_events
            SET entered_by = ?, internal_attendees = ?, event_name = ?, event_type = ?, host = ?,
                location = ?, event_date = ?, event_time = ?, invite_only = ?,
                prospect_attendees = ?, notes = ?
            WHERE id = ?
            RETURNING id, conference_id, entered_by, internal_attendees, event_name, event_type, host, location, event_date, event_time, invite_only, prospect_attendees, notes, created_at`,
      args: [
        entered_by || null,
        internal_attendees || null,
        event_name || null,
        event_type || null,
        host || null,
        location || null,
        event_date || null,
        event_time || null,
        invite_only || 'No',
        prospect_attendees || null,
        notes || null,
        id,
      ],
    });

    const r = result.rows[0];
    return NextResponse.json({
      id: Number(r.id),
      conference_id: Number(r.conference_id),
      entered_by: r.entered_by ? String(r.entered_by) : null,
      internal_attendees: r.internal_attendees ? String(r.internal_attendees) : null,
      event_name: r.event_name ? String(r.event_name) : null,
      event_type: r.event_type ? String(r.event_type) : null,
      host: r.host ? String(r.host) : null,
      location: r.location ? String(r.location) : null,
      event_date: r.event_date ? String(r.event_date) : null,
      event_time: r.event_time ? String(r.event_time) : null,
      invite_only: r.invite_only ? String(r.invite_only) : 'No',
      prospect_attendees: r.prospect_attendees ? String(r.prospect_attendees) : null,
      notes: r.notes ? String(r.notes) : null,
      created_at: String(r.created_at),
    });
  } catch (error) {
    console.error('PUT /api/social-events/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update social event' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const { id } = params;

    const existing = await db.execute({
      sql: 'SELECT id FROM social_events WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Social event not found' }, { status: 404 });
    }

    await db.execute({
      sql: 'DELETE FROM social_events WHERE id = ?',
      args: [id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/social-events/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete social event' }, { status: 500 });
  }
}
