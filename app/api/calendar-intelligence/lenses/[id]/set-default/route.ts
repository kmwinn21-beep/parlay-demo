import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const lensId = Number(params.id);
  if (!lensId) return NextResponse.json({ error: 'Invalid lens id' }, { status: 400 });

  await db.execute({
    sql: `INSERT INTO user_lens_preferences (user_id, default_lens_id) VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET default_lens_id = excluded.default_lens_id`,
    args: [authResult.id, lensId],
  });

  return NextResponse.json({ ok: true });
}
