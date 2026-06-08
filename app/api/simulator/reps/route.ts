import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDb(auth.accountId);

  const repsRes = await db.execute({
    sql: `SELECT id, value, email FROM config_options WHERE category = 'user' ORDER BY sort_order, value`,
    args: [],
  });

  const reps = repsRes.rows.map(r => ({
    id: Number(r.id),
    name: String(r.value ?? ''),
    email: r.email ? String(r.email) : '',
    role: 'Rep',
  }));

  return NextResponse.json({ reps });
}
