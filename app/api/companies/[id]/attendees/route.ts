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
    sql: `SELECT id, first_name, last_name, title, seniority, function as func
          FROM attendees
          WHERE company_id = ?
          ORDER BY last_name, first_name`,
    args: [companyId],
  });

  const attendees = res.rows.map(r => ({
    id: Number(r.id),
    first_name: r.first_name ? String(r.first_name) : '',
    last_name: r.last_name ? String(r.last_name) : '',
    title: r.title ? String(r.title) : null,
    seniority: r.seniority ? String(r.seniority) : null,
    function: r.func ? String(r.func) : null,
  }));

  return NextResponse.json({ attendees });
}
