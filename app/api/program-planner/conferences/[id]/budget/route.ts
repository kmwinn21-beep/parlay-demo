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

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? '', 10);
  if (isNaN(year)) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  const body = await request.json();
  const lineItems: Array<{ label: string; budgeted: number }> = Array.isArray(body.lineItems)
    ? body.lineItems
      .filter((li: unknown) => li != null && typeof li === 'object')
      .map((li: Record<string, unknown>) => ({ label: String(li.label ?? ''), budgeted: Number(li.budgeted ?? 0) }))
      .filter((li: { label: string; budgeted: number }) => li.label && !isNaN(li.budgeted))
    : [];

  const total = lineItems.reduce((sum, li) => sum + li.budgeted, 0);

  await db.execute({
    sql: `INSERT INTO conference_plans (conference_id, plan_year, planned_budget, planned_budget_line_items, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(conference_id, plan_year) DO UPDATE SET
            planned_budget = excluded.planned_budget,
            planned_budget_line_items = excluded.planned_budget_line_items,
            updated_at = datetime('now')`,
    args: [confId, year, total, JSON.stringify(lineItems)],
  });

  return NextResponse.json({ plannedBudget: total, lineItems });
}
