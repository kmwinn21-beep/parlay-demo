import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

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
  const { year, decision, plannedBudget, plannedHeadcount, plannedPipelineTarget, notes } = body;
  if (!year) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  await db.execute({
    sql: `INSERT INTO conference_plans (conference_id, plan_year, decision, planned_budget, planned_headcount, planned_pipeline_target, notes, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(conference_id, plan_year) DO UPDATE SET
            decision = excluded.decision,
            planned_budget = COALESCE(excluded.planned_budget, planned_budget),
            planned_headcount = COALESCE(excluded.planned_headcount, planned_headcount),
            planned_pipeline_target = COALESCE(excluded.planned_pipeline_target, planned_pipeline_target),
            notes = COALESCE(excluded.notes, notes),
            updated_at = datetime('now')`,
    args: [
      confId, year,
      decision ?? null,
      plannedBudget != null ? Number(plannedBudget) : null,
      plannedHeadcount != null ? Number(plannedHeadcount) : null,
      plannedPipelineTarget != null ? Number(plannedPipelineTarget) : null,
      notes ?? null,
    ],
  });

  return NextResponse.json({ success: true, conferenceId: confId, year, decision: decision ?? null });
}
