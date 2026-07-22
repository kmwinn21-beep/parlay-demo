import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Lets the Plan tab remove a conference it added but never committed —
// scoped strictly to uncommitted drafts (committed_to_program = 0) so this
// can't be used to delete a real, committed conference (that has its own
// deletion path from the Conference Details page). Cascades to
// conference_plans and every other conference-scoped table via ON DELETE
// CASCADE.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const conferenceId = parseInt(id, 10);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const confRes = await db.execute({ sql: `SELECT committed_to_program FROM conferences WHERE id = ?`, args: [conferenceId] });
  const row = confRes.rows[0] as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
  if (Number(row.committed_to_program ?? 1) === 1) {
    return NextResponse.json({ error: 'Only uncommitted Plan-tab conferences can be deleted this way.' }, { status: 400 });
  }

  await db.execute({ sql: `DELETE FROM conferences WHERE id = ?`, args: [conferenceId] });
  return NextResponse.json({ success: true });
}
