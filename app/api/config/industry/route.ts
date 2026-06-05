import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const body = await request.json() as { value?: string };
  const value = body.value?.trim();
  if (!value) return NextResponse.json({ error: 'value is required' }, { status: 400 });

  const existing = await db.execute({
    sql: `SELECT id, value FROM config_options WHERE category = 'industry' AND LOWER(value) = LOWER(?)`,
    args: [value],
  });
  if (existing.rows.length > 0) return NextResponse.json(existing.rows[0], { status: 200 });

  const result = await db.execute({
    sql: `INSERT INTO config_options (category, value, sort_order) VALUES ('industry', ?, 0) RETURNING *`,
    args: [value],
  });

  return NextResponse.json(result.rows[0], { status: 201 });
}
