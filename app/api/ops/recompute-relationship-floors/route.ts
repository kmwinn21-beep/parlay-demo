import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { computeRelationshipFloorBatch } from '@/lib/relationship-floor';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const accountId = authResult.accountId ?? '';
  const db = await getDb(accountId);

  const body = await request.json().catch(() => ({})) as { attendeeId?: number };

  if (body.attendeeId) {
    await computeRelationshipFloorBatch([body.attendeeId], accountId, db);
    return NextResponse.json({ ok: true, recomputed: 1 });
  }

  // Recompute for all attendees
  const allAttendees = await db.execute(`SELECT id FROM attendees`);
  const ids = allAttendees.rows.map(r => Number(r.id));

  if (ids.length === 0) return NextResponse.json({ ok: true, recomputed: 0 });

  // Process in chunks to avoid huge IN clauses
  const CHUNK = 200;
  let total = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await computeRelationshipFloorBatch(chunk, accountId, db);
    total += chunk.length;
  }

  return NextResponse.json({ ok: true, recomputed: total });
}
