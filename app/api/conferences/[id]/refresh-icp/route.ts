import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { computeAttendeeProductSignals } from '@/lib/computeAttendeeProductSignals';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const conferenceId = parseInt(params.id, 10);
  if (isNaN(conferenceId)) {
    return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });
  }

  const db = await getDb(authResult?.accountId);

  try {
    const { upserted } = await computeAttendeeProductSignals(db, conferenceId);
    return NextResponse.json({ ok: true, upserted });
  } catch (error) {
    console.error('refresh-icp error:', error);
    return NextResponse.json({ error: 'Failed to compute signals' }, { status: 500 });
  }
}
