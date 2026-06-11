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
    sql: `SELECT id, value FROM config_options WHERE category = 'cost_type' AND LOWER(value) = LOWER(?)`,
    args: [value],
  });
  if (existing.rows.length > 0) return NextResponse.json(existing.rows[0], { status: 200 });

  const result = await db.execute({
    sql: `INSERT INTO config_options (category, value, sort_order) VALUES ('cost_type', ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM config_options WHERE category='cost_type')) RETURNING id, value`,
    args: [value],
  });

  const created = result.rows[0];

  // Append to effectiveness_defaults.conference_cost_types if not already present
  try {
    const defaultsRow = await db.execute({
      sql: `SELECT value FROM effectiveness_defaults WHERE key = 'conference_cost_types'`,
      args: [],
    });
    const currentList: string[] = defaultsRow.rows.length > 0
      ? JSON.parse(String(defaultsRow.rows[0].value))
      : [];
    if (!currentList.includes(value)) {
      const updatedList = JSON.stringify([...currentList, value]);
      await db.execute({
        sql: `INSERT INTO effectiveness_defaults (key, value) VALUES ('conference_cost_types', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        args: [updatedList],
      });
    }
  } catch {
    // Non-fatal: continue even if defaults update fails
  }

  return NextResponse.json(created, { status: 201 });
}
