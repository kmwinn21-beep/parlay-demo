import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const [lensesRes, prefRes] = await Promise.all([
    db.execute({
      sql: `SELECT id, name, weights, created_by_user_id, is_account_default, created_at FROM calendar_lenses ORDER BY created_at ASC`,
      args: [],
    }),
    db.execute({
      sql: `SELECT default_lens_id FROM user_lens_preferences WHERE user_id = ?`,
      args: [authResult.id],
    }),
  ]);

  type Row = Record<string, unknown>;
  const personalDefaultLensId = (prefRes.rows[0] as Row | undefined)?.default_lens_id ?? null;

  const lenses = (lensesRes.rows as Row[]).map(r => ({
    id: Number(r.id),
    name: String(r.name),
    weights: JSON.parse(String(r.weights ?? '{}')),
    createdByUserId: r.created_by_user_id != null ? Number(r.created_by_user_id) : null,
    isAccountDefault: Number(r.is_account_default ?? 0) === 1,
    isPersonalDefault: Number(r.id) === Number(personalDefaultLensId),
    createdAt: String(r.created_at ?? ''),
  }));

  return NextResponse.json({ lenses });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const body = await request.json() as { name: string; weights: Record<string, number> };
  const { name, weights } = body;

  if (!name?.trim() || !weights) {
    return NextResponse.json({ error: 'name and weights are required' }, { status: 400 });
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.round(total) !== 100) {
    return NextResponse.json({ error: 'Weights must sum to 100' }, { status: 400 });
  }

  const result = await db.execute({
    sql: `INSERT INTO calendar_lenses (name, weights, created_by_user_id) VALUES (?, ?, ?)`,
    args: [name.trim(), JSON.stringify(weights), authResult.id],
  });

  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}
