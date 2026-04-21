import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_VALUE = 'Units';

export async function GET(_request: NextRequest) {
  try {
    await dbReady;
    const result = await db.execute({
      sql: "SELECT value FROM config_options WHERE category = 'unit_type' ORDER BY id LIMIT 1",
      args: [],
    });
    const value = result.rows[0] ? String(result.rows[0].value) || DEFAULT_VALUE : DEFAULT_VALUE;
    return NextResponse.json({ value });
  } catch (error) {
    console.error('GET /api/admin/unit-type error:', error);
    return NextResponse.json({ value: DEFAULT_VALUE });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { value } = body as { value: string };
    if (!value?.trim()) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 });
    }
    const trimmed = value.trim();

    const existing = await db.execute({
      sql: "SELECT id FROM config_options WHERE category = 'unit_type' ORDER BY id",
      args: [],
    });
    if (existing.rows.length > 1) {
      const dupeIds = existing.rows.slice(1).map(r => Number(r.id));
      for (const id of dupeIds) {
        await db.execute({ sql: 'DELETE FROM config_options WHERE id = ?', args: [id] });
      }
    }

    if (existing.rows.length > 0) {
      await db.execute({
        sql: "UPDATE config_options SET value = ? WHERE category = 'unit_type'",
        args: [trimmed],
      });
    } else {
      await db.execute({
        sql: "INSERT INTO config_options (category, value, sort_order) VALUES ('unit_type', ?, 0)",
        args: [trimmed],
      });
    }

    return NextResponse.json({ value: trimmed });
  } catch (error) {
    console.error('PUT /api/admin/unit-type error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
