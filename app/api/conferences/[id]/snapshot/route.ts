import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { resolvePlanState } from '@/lib/trialState';
import { hasCapability } from '@/lib/capabilities';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { planCapabilities } = await resolvePlanState(db);
  if (!hasCapability(planCapabilities, 'revenue_intelligence.conference_snapshots')) {
    return NextResponse.json({ error: 'Upgrade required' }, { status: 403 });
  }

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  if (authResult.role !== 'administrator') {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  if (!Number.isFinite(conferenceId)) {
    return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });
  }

  await db.execute({
    sql: `DELETE FROM conference_snapshots WHERE conference_id = ?`,
    args: [conferenceId],
  });

  return NextResponse.json({ success: true });
}
