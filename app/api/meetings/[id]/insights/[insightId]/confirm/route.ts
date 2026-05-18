import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; insightId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id, insightId } = await params;
  const meetingId = Number(id);
  const insightIdNum = Number(insightId);

  try {
    // Verify meeting exists and belongs to this account
    const meetingResult = await db.execute({
      sql: `SELECT m.id FROM meetings m
            JOIN attendees a ON m.attendee_id = a.id
            WHERE m.id = ?`,
      args: [meetingId],
    });

    if (meetingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Get current confirmed state
    const insightResult = await db.execute({
      sql: `SELECT id, confirmed FROM meeting_insights WHERE id = ? AND meeting_id = ?`,
      args: [insightIdNum, meetingId],
    });

    if (insightResult.rows.length === 0) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }

    const current = Number(insightResult.rows[0].confirmed);
    const newConfirmed = current === 1 ? 0 : 1;

    await db.execute({
      sql: `UPDATE meeting_insights SET confirmed = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [newConfirmed, insightIdNum],
    });

    return NextResponse.json({ confirmed: newConfirmed === 1 });
  } catch (error) {
    console.error('PATCH /api/meetings/[id]/insights/[insightId]/confirm error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
