import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

const VALID_ACTIVITY_TYPES = ['phone', 'email', 'linkedin'];

// POST /api/conferences/[id]/outreach/[companyId]/activity — logs one outreach
// touch. attendeeId is optional (a company-level touch with no specific
// attendee is still a valid log).
export async function POST(request: NextRequest, { params }: { params: { id: string; companyId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(params.companyId);
  if (!conferenceId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json();
    const { attendeeId, activityType, notes } = body as { attendeeId?: number; activityType: string; notes?: string };
    if (!VALID_ACTIVITY_TYPES.includes(activityType)) {
      return NextResponse.json({ error: 'activityType must be one of: ' + VALID_ACTIVITY_TYPES.join(', ') }, { status: 400 });
    }

    const result = await db.execute({
      sql: `INSERT INTO outreach_activity (conference_id, company_id, attendee_id, logged_by_user_id, activity_type, notes)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id, logged_at`,
      args: [conferenceId, companyId, attendeeId ?? null, authResult.id, activityType, notes?.trim() || null],
    });

    return NextResponse.json({
      id: Number(result.rows[0].id),
      logged_at: String(result.rows[0].logged_at),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences/[id]/outreach/[companyId]/activity error:', error);
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}

// DELETE /api/conferences/[id]/outreach/[companyId]/activity — removes the most
// recently logged activity of a given type for an attendee. Mirrors
// app/api/attendees/[id]/touchpoints/route.ts's DELETE (find the latest matching
// row, delete just that one) so repeated hover-deletes undo the most recent log.
export async function DELETE(request: NextRequest, { params }: { params: { id: string; companyId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(params.companyId);
  if (!conferenceId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json();
    const { attendeeId, activityType } = body as { attendeeId?: number; activityType: string };
    if (!VALID_ACTIVITY_TYPES.includes(activityType)) {
      return NextResponse.json({ error: 'activityType must be one of: ' + VALID_ACTIVITY_TYPES.join(', ') }, { status: 400 });
    }

    const latest = await db.execute({
      sql: `SELECT id FROM outreach_activity
            WHERE conference_id = ? AND company_id = ? AND activity_type = ?
              AND (attendee_id = ? OR (attendee_id IS NULL AND ? IS NULL))
            ORDER BY id DESC LIMIT 1`,
      args: [conferenceId, companyId, activityType, attendeeId ?? null, attendeeId ?? null],
    });

    if (latest.rows.length === 0) {
      return NextResponse.json({ error: 'No logged activity found' }, { status: 404 });
    }

    await db.execute({ sql: `DELETE FROM outreach_activity WHERE id = ?`, args: [latest.rows[0].id] });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id]/outreach/[companyId]/activity error:', error);
    return NextResponse.json({ error: 'Failed to remove activity' }, { status: 500 });
  }
}
