import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  const { provider } = await params;
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  await dbReady;
  await db.execute({
    sql: 'DELETE FROM oauth_connections WHERE user_id = ? AND provider = ?',
    args: [user.id, provider],
  });

  return NextResponse.json({ ok: true });
}
