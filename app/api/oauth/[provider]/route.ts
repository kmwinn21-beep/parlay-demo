import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  const { provider } = await params;
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const db = await getDb(user.accountId);
  await db.execute({
    sql: 'DELETE FROM oauth_connections WHERE user_id = ? AND provider = ?',
    args: [user.id, provider],
  });

  return NextResponse.json({ ok: true });
}
