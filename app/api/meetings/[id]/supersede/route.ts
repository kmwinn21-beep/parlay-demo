import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { getSessionUser } from '@/lib/auth';
import { validateConferenceStage } from '@/lib/validate-conference-stage';

// POST /api/meetings/[id]/supersede — "editing" a meeting from the outreach tab
// doesn't mutate the row in place (unlike PUT /api/meetings/[id]): it inserts a
// new meeting with the updated details and points the old row at it via
// superseded_by_id, so both remain visible in the outreach timeline — the old
// one struck through, the new one as the current entry. Same attendee/conference
// as the meeting being edited; same field set/validation as PUT.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
      sql: 'SELECT id, attendee_id, conference_id, outcome FROM meetings WHERE id = ?',
      args: [id],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }
    const old = existing.rows[0];

    const stageBlock = await validateConferenceStage(request, Number(old.conference_id), 'canEditMeeting');
    if (stageBlock) return stageBlock;

    const inserted = await db.execute({
      sql: `INSERT INTO meetings (attendee_id, conference_id, meeting_date, meeting_time, location, scheduled_by, additional_attendees, outcome, meeting_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [
        old.attendee_id, old.conference_id,
        meeting_date, meeting_time,
        location ?? null, scheduled_by ?? null, additional_attendees ?? null,
        old.outcome ?? null, meeting_type ?? null,
      ],
    });
    const newMeetingId = Number(inserted.rows[0].id);

    await db.execute({
      sql: `UPDATE meetings SET superseded_by_id = ? WHERE id = ?`,
      args: [newMeetingId, id],
    });

    return NextResponse.json(inserted.rows[0]);
  } catch (error) {
    console.error('POST /api/meetings/[id]/supersede error:', error);
    return NextResponse.json({ error: 'Failed to update meeting' }, { status: 500 });
  }
}
