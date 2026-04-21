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
    const { meeting_date, meeting_time, location, scheduled_by, additional_attendees, meeting_type } = body;

    if (!meeting_date || !meeting_time) {
      return NextResponse.json({ error: 'meeting_date and meeting_time are required' }, { status: 400 });
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM meetings WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    await db.execute({
      sql: `UPDATE meetings SET meeting_date = ?, meeting_time = ?, location = ?, scheduled_by = ?, additional_attendees = ?, meeting_type = ? WHERE id = ?`,
      args: [meeting_date, meeting_time, location ?? null, scheduled_by ?? null, additional_attendees ?? null, meeting_type ?? null, id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update meeting' }, { status: 500 });
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
      sql: 'SELECT id, attendee_id, conference_id FROM meetings WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const meeting = existing.rows[0];
    const attendeeId = meeting.attendee_id;
    const conferenceId = meeting.conference_id;

    // Look up all meeting-related action names from config_options
    const meetingActionKeys = ['meeting_scheduled', 'pending', 'meeting_held', 'rescheduled', 'cancelled', 'no_show'];
    const actionResult = await db.execute({
      sql: `SELECT value FROM config_options WHERE category = 'action' AND action_key IN (${meetingActionKeys.map(() => '?').join(',')})`,
      args: meetingActionKeys,
    });
    const meetingActionNames = new Set(actionResult.rows.map(r => String(r.value)));

    // Remove meeting-related actions from conference_attendee_details
    const detailResult = await db.execute({
      sql: 'SELECT action FROM conference_attendee_details WHERE attendee_id = ? AND conference_id = ?',
      args: [attendeeId, conferenceId],
    });

    if (detailResult.rows.length > 0) {
      const currentAction = String(detailResult.rows[0].action ?? '');
      const actions = currentAction.split(',').map(a => a.trim()).filter(Boolean);
      const filtered = actions.filter(a => !meetingActionNames.has(a));
      const newAction = filtered.length > 0 ? filtered.join(',') : null;

      await db.execute({
        sql: 'UPDATE conference_attendee_details SET action = ? WHERE attendee_id = ? AND conference_id = ?',
        args: [newAction, attendeeId, conferenceId],
      });
    }

    // Delete the meeting
    await db.execute({
      sql: 'DELETE FROM meetings WHERE id = ?',
      args: [id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete meeting' }, { status: 500 });
  }
}
