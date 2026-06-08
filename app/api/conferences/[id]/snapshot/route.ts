import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  if (!Number.isFinite(conferenceId)) {
    return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });
  }

  const res = await db.execute({
    sql: `SELECT * FROM conference_snapshots WHERE conference_id = ? ORDER BY snapshot_taken_at DESC LIMIT 1`,
    args: [conferenceId],
  });

  if (res.rows.length === 0) {
    return NextResponse.json({ snapshot: null });
  }

  const row = res.rows[0];
  return NextResponse.json({ snapshot: row });
}
