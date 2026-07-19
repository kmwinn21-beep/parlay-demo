import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Scoped, single-field update — deliberately separate from PUT /api/conferences/[id],
// which writes the full conference form and would clobber other fields if called with
// a partial body. Used by the Program Planner Plan view's inline strategy editor.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json();
  const conferenceStrategyTypeId = body.conferenceStrategyTypeId != null ? Number(body.conferenceStrategyTypeId) : null;
  if (conferenceStrategyTypeId != null && isNaN(conferenceStrategyTypeId)) {
    return NextResponse.json({ error: 'Invalid conferenceStrategyTypeId' }, { status: 400 });
  }

  await db.execute({
    sql: `UPDATE conferences SET conference_strategy_type_id = ? WHERE id = ?`,
    args: [conferenceStrategyTypeId, confId],
  });

  return NextResponse.json({ success: true, conferenceId: confId, conferenceStrategyTypeId });
}
