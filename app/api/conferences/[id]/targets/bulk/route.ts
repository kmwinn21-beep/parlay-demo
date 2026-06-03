import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId ?? '');

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json() as { attendeeIds?: number[] };
  const attendeeIds = body.attendeeIds;
  if (!Array.isArray(attendeeIds) || attendeeIds.length === 0) {
    return NextResponse.json({ error: 'attendeeIds must be a non-empty array' }, { status: 400 });
  }

  const existingRes = await db.execute({
    sql: `SELECT attendee_id FROM conference_targets WHERE conference_id = ? AND attendee_id IN (${attendeeIds.map(() => '?').join(',')})`,
    args: [confId, ...attendeeIds],
  });
  const alreadyTargetedSet = new Set(existingRes.rows.map(r => Number(r.attendee_id)));

  const toInsert = attendeeIds.filter(id => !alreadyTargetedSet.has(id));

  if (toInsert.length > 0) {
    const stmts = toInsert.map(attendeeId => ({
      sql: `INSERT OR IGNORE INTO conference_targets (attendee_id, conference_id, tier) VALUES (?, ?, 'unassigned')`,
      args: [attendeeId, confId] as (string | number | null)[],
    }));
    for (let i = 0; i < stmts.length; i += 200) {
      await db.batch(stmts.slice(i, i + 200), 'write');
    }
  }

  return NextResponse.json({
    added: toInsert.length,
    alreadyTargeted: alreadyTargetedSet.size,
  });
}
