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
  const plannedStartDate: string | null = body.plannedStartDate || null;
  const plannedEndDate: string | null = body.plannedEndDate || null;

  await db.execute({
    sql: `INSERT INTO conference_plans (conference_id, plan_year, planned_start_date, planned_end_date, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(conference_id, plan_year) DO UPDATE SET
            planned_start_date = excluded.planned_start_date,
            planned_end_date = excluded.planned_end_date,
            updated_at = datetime('now')`,
    args: [confId, year, plannedStartDate, plannedEndDate],
  });

  return NextResponse.json({ plannedStartDate, plannedEndDate });
}
