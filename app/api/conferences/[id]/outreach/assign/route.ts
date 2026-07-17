import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { createNotifications } from '@/lib/notifications';
import { resolveUserDisplayName } from '@/lib/initials';

// POST /api/conferences/[id]/outreach/assign — assign a company to one or more
// reps for outreach at this conference. Upserts so re-assigning an already-
// assigned rep just refreshes updated_at instead of duplicating the row.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  if (!conferenceId) return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });

  try {
    const body = await request.json();
    const { companyId, userIds } = body as { companyId: number; userIds: number[] };
    if (!companyId || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'companyId and userIds required' }, { status: 400 });
    }

    const [companyRow, conferenceRow, assignerRow] = await Promise.all([
      db.execute({ sql: `SELECT name FROM companies WHERE id = ?`, args: [companyId] }),
      db.execute({ sql: `SELECT name FROM conferences WHERE id = ?`, args: [conferenceId] }),
      db.execute({ sql: `SELECT display_name, first_name, last_name, email FROM users WHERE id = ?`, args: [authResult.id] }),
    ]);
    if (companyRow.rows.length === 0) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const companyName = String(companyRow.rows[0].name);
    const conferenceName = conferenceRow.rows.length > 0 ? String(conferenceRow.rows[0].name) : 'this conference';
    const assignerName = assignerRow.rows.length > 0 ? resolveUserDisplayName(assignerRow.rows[0]) : authResult.email;

    for (const userId of userIds) {
      await db.execute({
        sql: `INSERT INTO outreach_assignments (conference_id, company_id, assigned_user_id, assigned_by_user_id, status)
              VALUES (?, ?, ?, ?, 'not_started')
              ON CONFLICT (conference_id, company_id, assigned_user_id)
              DO UPDATE SET updated_at = datetime('now')`,
        args: [conferenceId, companyId, userId, authResult.id],
      });
    }

    // Best-effort — matches the notifications helper's own error-swallowing contract.
    await createNotifications({
      userIds,
      type: 'conference',
      recordId: conferenceId,
      recordName: conferenceName,
      message: `${assignerName} assigned you to outreach for ${companyName} at ${conferenceName}`,
      changedByEmail: authResult.email,
      changedByConfigId: null,
      entityType: 'conference',
      entityId: conferenceId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/conferences/[id]/outreach/assign error:', error);
    return NextResponse.json({ error: 'Failed to assign outreach' }, { status: 500 });
  }
}
