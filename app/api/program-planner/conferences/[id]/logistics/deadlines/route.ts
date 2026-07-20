import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

function daysUntil(dueDate: string): number {
  return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? '', 10);
  if (isNaN(year)) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  const body = await request.json();
  const label: string = String(body.label ?? '').trim();
  const dueDate: string = String(body.dueDate ?? '').trim();
  const category: string | null = body.category || null;
  if (!label || !dueDate) return NextResponse.json({ error: 'label and dueDate are required' }, { status: 400 });

  try {
    const result = await db.execute({
      sql: `INSERT INTO conference_plan_deadlines (conference_id, plan_year, label, due_date, category)
            VALUES (?, ?, ?, ?, ?) RETURNING id`,
      args: [confId, year, label, dueDate, category],
    });
    const newId = Number(result.rows[0].id);

    return NextResponse.json({
      id: newId, label, dueDate, completed: false, category, daysUntil: daysUntil(dueDate),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/program-planner/conferences/[id]/logistics/deadlines error:', error);
    return NextResponse.json({ error: 'Failed to create deadline' }, { status: 500 });
  }
}
