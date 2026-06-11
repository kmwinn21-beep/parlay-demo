import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const res = await db.execute({
    sql: `SELECT DISTINCT c.id, c.name
          FROM conferences c
          JOIN conference_attendees ca ON ca.conference_id = c.id
          JOIN attendees a ON a.id = ca.attendee_id
          WHERE a.company_id = ?
          ORDER BY c.start_date DESC`,
    args: [companyId],
  });

  const conferences = res.rows.map(r => ({
    id: Number(r.id),
    name: String(r.name),
  }));

  return NextResponse.json({ conferences });
}
