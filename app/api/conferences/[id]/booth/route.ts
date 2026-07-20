import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Scoped, single-concern update — same rationale as .../[id]/strategy.
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
  const boothPresent = Boolean(body.boothPresent);
  const boothWidth = boothPresent && body.boothWidth != null && body.boothWidth !== '' ? Number(body.boothWidth) : null;
  const boothLength = boothPresent && body.boothLength != null && body.boothLength !== '' ? Number(body.boothLength) : null;
  const boothNumber = boothPresent && body.boothNumber ? String(body.boothNumber) : null;
  const boothHall = boothPresent && body.boothHall ? String(body.boothHall) : null;

  await db.execute({
    sql: `UPDATE conferences SET booth_present = ?, booth_width = ?, booth_length = ?, booth_number = ?, booth_hall = ? WHERE id = ?`,
    args: [boothPresent ? 1 : 0, boothWidth, boothLength, boothNumber, boothHall, confId],
  });

  return NextResponse.json({ success: true, conferenceId: confId, boothPresent, boothWidth, boothLength, boothNumber, boothHall });
}
