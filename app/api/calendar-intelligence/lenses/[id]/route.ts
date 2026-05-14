import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const lensId = Number(params.id);
  if (!lensId) return NextResponse.json({ error: 'Invalid lens id' }, { status: 400 });

  const lensRes = await db.execute({
    sql: `SELECT created_by_user_id FROM calendar_lenses WHERE id = ?`,
    args: [lensId],
  });
  const lens = lensRes.rows[0] as Row | undefined;
  if (!lens) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = Number(lens.created_by_user_id) === authResult.id;
  if (!isOwner && authResult.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.execute({ sql: `DELETE FROM calendar_lenses WHERE id = ?`, args: [lensId] });
  return NextResponse.json({ ok: true });
}

