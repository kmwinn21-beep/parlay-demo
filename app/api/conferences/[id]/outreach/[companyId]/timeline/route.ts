import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { resolveUserDisplayName } from '@/lib/initials';

// GET /api/conferences/[id]/outreach/[companyId]/timeline — all logged outreach
// activity for this company at this conference, plus any meetings scheduled with
// this company's attendees at this conference (regardless of where they were
// scheduled from — the targets kanban, this tab, or anywhere else), most recent
// first. Meetings use their row-creation timestamp (when they were scheduled),
// not the meeting's own date/time (when it's set to happen).
export async function GET(request: NextRequest, { params }: { params: { id: string; companyId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(params.companyId);
  if (!conferenceId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const [activityRows, meetingRows] = await Promise.all([
      db.execute({
        sql: `SELECT oa.id, oa.activity_type, oa.notes, oa.logged_at,
                     u.display_name, u.first_name, u.last_name, u.email,
                     a.first_name as attendee_first_name, a.last_name as attendee_last_name
              FROM outreach_activity oa
              JOIN users u ON u.id = oa.logged_by_user_id
              LEFT JOIN attendees a ON a.id = oa.attendee_id
              WHERE oa.conference_id = ? AND oa.company_id = ?
              ORDER BY oa.logged_at DESC, oa.id DESC`,
        args: [conferenceId, companyId],
      }),
      db.execute({
        sql: `SELECT m.id, m.created_at, m.meeting_date, m.meeting_time, m.location, m.scheduled_by,
                     a.first_name as attendee_first_name, a.last_name as attendee_last_name
              FROM meetings m
              JOIN attendees a ON a.id = m.attendee_id
              WHERE m.conference_id = ? AND a.company_id = ?
              ORDER BY m.created_at DESC, m.id DESC`,
        args: [conferenceId, companyId],
      }),
    ]);

    const activities = activityRows.rows.map(r => ({
      id: `activity-${r.id}`,
      activityType: String(r.activity_type),
      loggedByName: resolveUserDisplayName(r),
      attendeeName: r.attendee_first_name ? `${r.attendee_first_name} ${r.attendee_last_name}` : null,
      notes: r.notes ? String(r.notes) : null,
      loggedAt: String(r.logged_at),
    }));

    const meetings = meetingRows.rows.map(r => ({
      id: `meeting-${r.id}`,
      activityType: 'meeting',
      loggedByName: r.scheduled_by ? String(r.scheduled_by) : 'Someone',
      attendeeName: r.attendee_first_name ? `${r.attendee_first_name} ${r.attendee_last_name}` : null,
      notes: `Meeting scheduled for ${r.meeting_date}${r.meeting_time ? ` at ${r.meeting_time}` : ''}${r.location ? ` — ${r.location}` : ''}`,
      loggedAt: String(r.created_at),
    }));

    const merged = [...activities, ...meetings].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));

    return NextResponse.json({ activities: merged });
  } catch (error) {
    console.error('GET /api/conferences/[id]/outreach/[companyId]/timeline error:', error);
    return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
  }
}
