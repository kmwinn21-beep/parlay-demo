import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { resolveUserDisplayName } from '@/lib/initials';

// GET /api/conferences/[id]/outreach/[companyId]/timeline — all logged outreach
// activity for this company at this conference, most recent first.
export async function GET(request: NextRequest, { params }: { params: { id: string; companyId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(params.companyId);
  if (!conferenceId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const rows = await db.execute({
      sql: `SELECT oa.id, oa.activity_type, oa.notes, oa.logged_at,
                   u.display_name, u.first_name, u.last_name, u.email,
                   a.first_name as attendee_first_name, a.last_name as attendee_last_name
            FROM outreach_activity oa
            JOIN users u ON u.id = oa.logged_by_user_id
            LEFT JOIN attendees a ON a.id = oa.attendee_id
            WHERE oa.conference_id = ? AND oa.company_id = ?
            ORDER BY oa.logged_at DESC, oa.id DESC`,
      args: [conferenceId, companyId],
    });

    const activities = rows.rows.map(r => ({
      id: Number(r.id),
      activityType: String(r.activity_type),
      loggedByName: resolveUserDisplayName(r),
      attendeeName: r.attendee_first_name ? `${r.attendee_first_name} ${r.attendee_last_name}` : null,
      notes: r.notes ? String(r.notes) : null,
      loggedAt: String(r.logged_at),
    }));

    return NextResponse.json({ activities });
  } catch (error) {
    console.error('GET /api/conferences/[id]/outreach/[companyId]/timeline error:', error);
    return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
  }
}
