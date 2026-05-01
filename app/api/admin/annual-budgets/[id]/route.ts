import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const id = Number(params.id);
    const body = await request.json();
    const { amount } = body as { amount: number };
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }
    await db.execute({
      sql: 'UPDATE annual_budgets SET amount = ? WHERE id = ?',
      args: [amount, id],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/admin/annual-budgets/[id] error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const id = Number(params.id);
    await db.execute({ sql: 'DELETE FROM annual_budgets WHERE id = ?', args: [id] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/admin/annual-budgets/[id] error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
