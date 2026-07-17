import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { createNotifications } from '@/lib/notifications';
import { resolveUserDisplayName } from '@/lib/initials';

// POST /api/conferences/[id]/outreach/assign — sets the full list of reps
// assigned to a company for outreach at this conference (not additive):
// upserts everyone in userIds, and removes any existing assignment for this
// conference+company whose assigned_user_id isn't in that list — so
// unchecking a rep in the assign modal actually un-assigns them. An empty
// userIds array is valid and clears all assignments for this company.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  if (!conferenceId) return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });

  try {
    const body = await request.json();
    const { companyId, userIds } = body as { companyId: number; userIds: number[] };
    if (!companyId || !Array.isArray(userIds)) {
      return NextResponse.json({ error: 'companyId and userIds required' }, { status: 400 });
    }

    const companyRow = await db.execute({ sql: `SELECT name FROM companies WHERE id = ?`, args: [companyId] });
    if (companyRow.rows.length === 0) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const existingRes = await db.execute({
      sql: `SELECT assigned_user_id FROM outreach_assignments WHERE conference_id = ? AND company_id = ?`,
      args: [conferenceId, companyId],
    });
    const existingUserIds = new Set(existingRes.rows.map(r => Number(r.assigned_user_id)));
    const newlyAddedUserIds = userIds.filter(id => !existingUserIds.has(id));

    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      await db.execute({
        sql: `DELETE FROM outreach_assignments
              WHERE conference_id = ? AND company_id = ? AND assigned_user_id NOT IN (${placeholders})`,
        args: [conferenceId, companyId, ...userIds],
      });
    } else {
      await db.execute({
        sql: `DELETE FROM outreach_assignments WHERE conference_id = ? AND company_id = ?`,
        args: [conferenceId, companyId],
      });
    }

    for (const userId of userIds) {
      await db.execute({
        sql: `INSERT INTO outreach_assignments (conference_id, company_id, assigned_user_id, assigned_by_user_id, status)
              VALUES (?, ?, ?, ?, 'not_started')
              ON CONFLICT (conference_id, company_id, assigned_user_id)
              DO UPDATE SET updated_at = datetime('now')`,
        args: [conferenceId, companyId, userId, authResult.id],
      });
    }

    if (newlyAddedUserIds.length > 0) {
      const [conferenceRow, assignerRow] = await Promise.all([
        db.execute({ sql: `SELECT name FROM conferences WHERE id = ?`, args: [conferenceId] }),
        db.execute({ sql: `SELECT display_name, first_name, last_name, email FROM users WHERE id = ?`, args: [authResult.id] }),
      ]);
      const companyName = String(companyRow.rows[0].name);
      const conferenceName = conferenceRow.rows.length > 0 ? String(conferenceRow.rows[0].name) : 'this conference';
      const assignerName = assignerRow.rows.length > 0 ? resolveUserDisplayName(assignerRow.rows[0]) : authResult.email;

      // Only newly-added reps are notified — editing an existing assignment
      // (e.g. adding one more rep) shouldn't re-notify reps who were already
      // assigned and unaffected by the change.
      await createNotifications({
        userIds: newlyAddedUserIds,
        type: 'conference',
        recordId: conferenceId,
        recordName: conferenceName,
        message: `${assignerName} assigned you to outreach for ${companyName} at ${conferenceName}`,
        changedByEmail: authResult.email,
        changedByConfigId: null,
        entityType: 'conference',
        entityId: conferenceId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/conferences/[id]/outreach/assign error:', error);
    return NextResponse.json({ error: 'Failed to assign outreach' }, { status: 500 });
  }
}
