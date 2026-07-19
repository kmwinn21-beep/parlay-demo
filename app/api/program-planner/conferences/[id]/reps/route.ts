import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials, resolveUserDisplayName } from '@/lib/initials';

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
  const repIds: number[] = Array.isArray(body.repIds) ? body.repIds.map(Number).filter((n: number) => !isNaN(n)) : [];

  await db.execute({
    sql: `INSERT INTO conference_plans (conference_id, plan_year, assigned_rep_ids, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(conference_id, plan_year) DO UPDATE SET
            assigned_rep_ids = excluded.assigned_rep_ids,
            updated_at = datetime('now')`,
    args: [confId, year, JSON.stringify(repIds)],
  });

  let assignedReps: Array<{ userId: number; displayName: string; initials: string }> = [];
  if (repIds.length > 0) {
    const ph = repIds.map(() => '?').join(',');
    const repsRes = await db.execute({
      sql: `SELECT id, display_name, first_name, last_name, email FROM users WHERE id IN (${ph})`,
      args: repIds,
    });
    const repMap = new Map<number, { userId: number; displayName: string; initials: string }>();
    for (const r of repsRes.rows) {
      const displayName = resolveUserDisplayName(r);
      repMap.set(Number(r.id), { userId: Number(r.id), displayName, initials: getInitials(displayName) });
    }
    assignedReps = repIds.map(rid => repMap.get(rid)).filter((r): r is { userId: number; displayName: string; initials: string } => r != null);
  }

  return NextResponse.json({ assignedReps });
}
