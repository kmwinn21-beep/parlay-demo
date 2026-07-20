import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deadlineId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { deadlineId } = await params;
  const id = parseInt(deadlineId, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json();
  const setClauses: string[] = [];
  const args: (string | number | null)[] = [];
  if (body.label !== undefined) { setClauses.push('label = ?'); args.push(String(body.label)); }
  if (body.dueDate !== undefined) { setClauses.push('due_date = ?'); args.push(String(body.dueDate)); }
  if (body.completed !== undefined) { setClauses.push('completed = ?'); args.push(body.completed ? 1 : 0); }
  if (body.category !== undefined) { setClauses.push('category = ?'); args.push(body.category || null); }
  if (setClauses.length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });

  try {
    await db.execute({
      sql: `UPDATE conference_plan_deadlines SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      args: [...args, id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH .../logistics/deadlines/[deadlineId] error:', error);
    return NextResponse.json({ error: 'Failed to update deadline' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deadlineId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { deadlineId } = await params;
  const id = parseInt(deadlineId, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    await db.execute({ sql: `DELETE FROM conference_plan_deadlines WHERE id = ?`, args: [id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE .../logistics/deadlines/[deadlineId] error:', error);
    return NextResponse.json({ error: 'Failed to delete deadline' }, { status: 500 });
  }
}
