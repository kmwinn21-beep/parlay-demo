import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { computeSaturationSnapshot } from '@/lib/saturation-snapshot';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const accountId = authResult.accountId ?? '';
  const db = await getDb(accountId);

  const body = await request.json().catch(() => ({})) as { conferenceId?: number };

  if (body.conferenceId) {
    await computeSaturationSnapshot(accountId, body.conferenceId, db);
    return NextResponse.json({ ok: true, recomputed: 1 });
  }

  // Recompute all conferences that have a series_id
  const confs = await db.execute(
    `SELECT id FROM conferences WHERE series_id IS NOT NULL ORDER BY start_date ASC`,
  );

  let count = 0;
  for (const row of confs.rows) {
    await computeSaturationSnapshot(accountId, Number(row.id), db);
    count++;
  }

  return NextResponse.json({ ok: true, recomputed: count });
}
