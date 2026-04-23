import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

// GET /api/companies/[id]/touchpoints
// Returns total touchpoint count across all attendees of the company
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  const row = await db.execute({
    sql: `SELECT COUNT(*) as total
          FROM attendee_touchpoints at
          JOIN attendees a ON at.attendee_id = a.id
          WHERE a.company_id = ?`,
    args: [companyId],
  });

  return NextResponse.json({ total: Number(row.rows[0]?.total ?? 0) });
}
