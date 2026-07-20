import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials } from '@/lib/initials';

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

  // "Reps" are config_options rows (category='user'), not logins in the `users`
  // table — this is the convention every other assigned-rep feature in the app
  // follows (crm-export, activity-map, targets, pre/post-conference, etc.), and
  // it's what RepAssignmentPopover's picker list (useUserOptions -> /api/config
  // ?category=user) actually sources its IDs from.
  let assignedReps: Array<{ userId: number; displayName: string; initials: string }> = [];
  if (repIds.length > 0) {
    const ph = repIds.map(() => '?').join(',');
    const repsRes = await db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'user' AND id IN (${ph})`,
      args: repIds,
    });
    const repMap = new Map<number, { userId: number; displayName: string; initials: string }>();
    for (const r of repsRes.rows) {
      const displayName = String(r.value);
      repMap.set(Number(r.id), { userId: Number(r.id), displayName, initials: getInitials(displayName) });
    }
    assignedReps = repIds.map(rid => repMap.get(rid)).filter((r): r is { userId: number; displayName: string; initials: string } => r != null);
  }

  return NextResponse.json({ assignedReps });
}
