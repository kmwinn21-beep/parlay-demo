import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id, attendeeId } = await params;
  const confId = parseInt(id, 10);
  const attId = parseInt(attendeeId, 10);
  if (isNaN(confId) || isNaN(attId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json() as { tier: string };
  const tier = body.tier;
  if (!tier) return NextResponse.json({ error: 'tier required' }, { status: 400 });

  await dbReady;

  await db.execute({
    sql: 'UPDATE conference_targets SET tier = ? WHERE attendee_id = ? AND conference_id = ?',
    args: [tier, attId, confId],
  });

  return NextResponse.json({ success: true });
}
