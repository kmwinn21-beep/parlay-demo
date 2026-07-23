import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Scoped, single-field update — same rationale as .../[id]/type: avoids the
// full conference PUT form clobbering other fields when only Market
// Coverage / Territory changes (e.g. the Plan tab's inline Territory cell).
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
  const territoryScope: string | null = body.territoryScope === 'national' || body.territoryScope === 'regional' ? body.territoryScope : null;
  const territoryIds: number[] = territoryScope === 'regional' && Array.isArray(body.territoryIds)
    ? body.territoryIds.map(Number).filter((n: number) => !isNaN(n))
    : [];

  await db.execute({
    sql: `UPDATE conferences SET territory_scope = ?, territory_ids = ? WHERE id = ?`,
    args: [territoryScope, JSON.stringify(territoryIds), confId],
  });

  return NextResponse.json({ success: true, conferenceId: confId, territoryScope, territoryIds });
}
