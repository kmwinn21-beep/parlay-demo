import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDb(auth.accountId);

  try {
    const repsRes = await db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'user' ORDER BY sort_order, value`,
      args: [],
    });

    const reps = repsRes.rows.map(r => ({
      id: Number(r.id),
      name: String(r.value ?? ''),
      email: '',
      role: 'Rep',
    }));

    return NextResponse.json({ reps });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
