import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; insightId: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id, insightId } = await params;
  try {
    await db.execute({ sql: 'DELETE FROM meeting_insights WHERE id = ? AND meeting_id = ?', args: [Number(insightId), Number(id)] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE insight error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
