import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

const VALID_STATUSES = ['not_started', 'in_progress', 'completed', 'overdue'];

// PATCH /api/conferences/[id]/outreach/[companyId]/status — updates every
// outreach_assignments row for this conference+company (all assigned reps
// share one status). 'overdue' is otherwise a derived, not stored, state —
// but a rep can still explicitly set/clear it here.
export async function PATCH(request: NextRequest, { params }: { params: { id: string; companyId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(params.companyId);
  if (!conferenceId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json();
    const { status } = body as { status: string };
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'status must be one of: ' + VALID_STATUSES.join(', ') }, { status: 400 });
    }

    await db.execute({
      sql: `UPDATE outreach_assignments SET status = ?, updated_at = datetime('now')
            WHERE conference_id = ? AND company_id = ?`,
      args: [status, conferenceId, companyId],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/conferences/[id]/outreach/[companyId]/status error:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
