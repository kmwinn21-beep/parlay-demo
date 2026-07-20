import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Scoped, single-field update — same rationale as .../[id]/strategy: avoids the
// full conference PUT form clobbering other fields when only Type changes.
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

  const body = await request.json();
  const conferenceType: string | null = body.conferenceType || null;

  await db.execute({
    sql: `UPDATE conferences SET conference_type = ? WHERE id = ?`,
    args: [conferenceType, confId],
  });

  return NextResponse.json({ success: true, conferenceId: confId, conferenceType });
}
