import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { getSessionUser } from '@/lib/auth';
import { validateConferenceStage } from '@/lib/validate-conference-stage';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const { id } = params;

    const result = await db.execute({
      sql: `SELECT m.id, m.attendee_id, m.conference_id, m.scheduled_by,
               m.additional_attendees, m.meeting_date, m.meeting_time, m.location,
               a.first_name, a.last_name, a.title,
               co.id AS company_id, co.name AS company_name, co.icp AS company_icp,
               c.name AS conference_name, c.internal_attendees AS conference_internal_attendees
            FROM meetings m
            JOIN attendees a ON m.attendee_id = a.id
            LEFT JOIN companies co ON a.company_id = co.id
            JOIN conferences c ON m.conference_id = c.id
            WHERE m.id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const r = result.rows[0];

    // Resolve scheduled_by config_option IDs to display names
    let scheduledByNames: string[] = [];
    if (r.scheduled_by) {
      const ids = String(r.scheduled_by).split(',').map(s => s.trim()).filter(Boolean);
      const numericIds = ids.filter(id => !isNaN(Number(id)) && id !== '');
      if (numericIds.length > 0) {
        const placeholders = numericIds.map(() => '?').join(',');
        const namesRes = await db.execute({
          sql: `SELECT id, value FROM config_options WHERE id IN (${placeholders})`,
          args: numericIds.map(Number),
        });
        const nameMap = new Map(namesRes.rows.map(row => [Number(row.id), String(row.value)]));
        scheduledByNames = ids.map(id => nameMap.get(Number(id)) ?? id);
      } else {
        scheduledByNames = ids; // already names (legacy data)
      }
    }
    return NextResponse.json({
      id: Number(r.id),
      attendee_id: Number(r.attendee_id),
      conference_id: Number(r.conference_id),
      scheduled_by: r.scheduled_by ? String(r.scheduled_by) : null,
      scheduled_by_names: scheduledByNames,
      additional_attendees: r.additional_attendees ? String(r.additional_attendees) : null,
      meeting_date: r.meeting_date ? String(r.meeting_date) : null,
      meeting_time: r.meeting_time ? String(r.meeting_time) : null,
      location: r.location ? String(r.location) : null,
      first_name: String(r.first_name ?? ''),
      last_name: String(r.last_name ?? ''),
      title: r.title ? String(r.title) : null,
      company_id: r.company_id ? Number(r.company_id) : null,
      company_name: r.company_name ? String(r.company_name) : null,
      company_icp: r.company_icp ? String(r.company_icp) : null,
      conference_name: String(r.conference_name ?? ''),
      conference_internal_attendees: r.conference_internal_attendees ? String(r.conference_internal_attendees) : null,
    });
  } catch (error) {
    console.error('GET /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const { id } = params;
    const body = await request.json();
    const { meeting_date, meeting_time, location, scheduled_by, additional_attendees, meeting_type } = body;

    if (!meeting_date || !meeting_time) {
      return NextResponse.json({ error: 'meeting_date and meeting_time are required' }, { status: 400 });
    }

    const existing = await db.execute({
      sql: 'SELECT id, conference_id FROM meetings WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const stageBlock = await validateConferenceStage(request, Number(existing.rows[0].conference_id), 'canEditMeeting');
    if (stageBlock) return stageBlock;

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
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const { id } = params;

    const existing = await db.execute({
      sql: 'SELECT id, attendee_id, conference_id FROM meetings WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const stageBlock = await validateConferenceStage(request, Number(existing.rows[0].conference_id), 'canDeleteMeeting');
    if (stageBlock) return stageBlock;

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
