import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Promotes a Plan-tab "New" conference into a real, committed conference —
// this is the only place committed_to_program flips from 0 to 1. Copies the
// plan's dates onto the conferences row (the Conference Details page and
// every other part of the app reads conferences.start_date/end_date, not
// conference_plans' planned_* columns) so the new detail profile isn't
// dated 1900-01-01 (the Plan tab's add-flow placeholder).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const conferenceId = parseInt(id, 10);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const planYear = Number(body?.planYear);
  if (!Number.isFinite(planYear)) {
    return NextResponse.json({ error: 'planYear is required' }, { status: 400 });
  }

  const planRes = await db.execute({
    sql: `SELECT planned_start_date, planned_end_date FROM conference_plans WHERE conference_id = ? AND plan_year = ?`,
    args: [conferenceId, planYear],
  });
  const plan = planRes.rows[0] as unknown as { planned_start_date: string | null; planned_end_date: string | null } | undefined;
  const plannedStartDate = plan?.planned_start_date ?? null;
  const plannedEndDate = plan?.planned_end_date ?? null;

  if (!plannedStartDate) {
    return NextResponse.json({ error: 'Set conference dates before adding this conference to your program.' }, { status: 400 });
  }

  await db.execute({
    sql: `UPDATE conferences SET start_date = ?, end_date = ?, committed_to_program = 1 WHERE id = ?`,
    args: [plannedStartDate, plannedEndDate ?? plannedStartDate, conferenceId],
  });

  return NextResponse.json({ success: true, conferenceId, startDate: plannedStartDate, endDate: plannedEndDate ?? plannedStartDate });
}
