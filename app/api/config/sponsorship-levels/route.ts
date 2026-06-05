import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  try {
    const result = await db.execute({
      sql: `SELECT * FROM config_options WHERE category = 'sponsorship_level' ORDER BY sort_order ASC`,
      args: [],
    });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/config/sponsorship-levels error:', error);
    return NextResponse.json({ error: 'Failed to fetch sponsorship levels' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  try {
    const body = await request.json() as { value?: string };
    const value = body.value?.trim();
    if (!value) return NextResponse.json({ error: 'value is required' }, { status: 400 });

    const existing = await db.execute({
      sql: `SELECT id, value, color, is_system FROM config_options WHERE category = 'sponsorship_level' AND LOWER(value) = LOWER(?)`,
      args: [value],
    });
    if (existing.rows.length > 0) return NextResponse.json(existing.rows[0], { status: 200 });

    const maxSortRes = await db.execute({
      sql: `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort FROM config_options WHERE category = 'sponsorship_level'`,
      args: [],
    });
    const nextSort = Number(maxSortRes.rows[0]?.next_sort ?? 99);

    const result = await db.execute({
      sql: `INSERT INTO config_options (category, value, sort_order, is_system) VALUES ('sponsorship_level', ?, ?, 0) RETURNING *`,
      args: [value, nextSort],
    });
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('POST /api/config/sponsorship-levels error:', error);
    return NextResponse.json({ error: 'Failed to create sponsorship level' }, { status: 500 });
  }
}
