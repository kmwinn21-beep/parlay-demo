import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// GET /api/conferences/[id]/touchpoints
// How many touchpoints have been logged at this conference, in total and per
// type. Read-only — the dashboard's Touchpoints count pill is the only caller.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const conferenceId = parseInt(id, 10);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const rows = await db.execute({
      sql: `SELECT option_id, COUNT(*) AS count
            FROM attendee_touchpoints
            WHERE conference_id = ?
            GROUP BY option_id`,
      args: [conferenceId],
    });

    const counts: Record<number, number> = {};
    let total = 0;
    for (const row of rows.rows) {
      const n = Number(row.count);
      counts[Number(row.option_id)] = n;
      total += n;
    }
    return NextResponse.json({ total, counts });
  } catch (error) {
    console.error('GET /api/conferences/[id]/touchpoints error:', error);
    return NextResponse.json({ error: 'Failed to count touchpoints' }, { status: 500 });
  }
}
