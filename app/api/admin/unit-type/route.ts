import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET() {
  await dbReady;
  try {
    const result = await db.execute({
      sql: "SELECT id, value FROM config_options WHERE category = 'unit_type' ORDER BY id LIMIT 1",
      args: [],
    });
    if (result.rows.length === 0) {
      return NextResponse.json({ id: null, value: 'WSE' });
    }
    return NextResponse.json({ id: Number(result.rows[0].id), value: String(result.rows[0].value) });
  } catch (error) {
    console.error('GET /api/admin/unit-type error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  await dbReady;
  try {
    const body = await request.json();
    const { value } = body as { value: string };
    if (!value || !value.trim()) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 });
    }
    const trimmed = value.trim();

    const existing = await db.execute({
      sql: "SELECT id FROM config_options WHERE category = 'unit_type' ORDER BY id",
      args: [],
    });

    if (existing.rows.length > 0) {
      const keepId = Number(existing.rows[0].id);
      // Remove any duplicates first, then update the surviving row
      if (existing.rows.length > 1) {
        const dupeIds = existing.rows.slice(1).map(r => Number(r.id));
        for (const dupeId of dupeIds) {
          await db.execute({ sql: 'DELETE FROM config_options WHERE id = ?', args: [dupeId] });
        }
      }
      await db.execute({
        sql: 'UPDATE config_options SET value = ? WHERE id = ?',
        args: [trimmed, keepId],
      });
      return NextResponse.json({ id: keepId, value: trimmed });
    } else {
      const result = await db.execute({
        sql: "INSERT INTO config_options (category, value, sort_order) VALUES ('unit_type', ?, 0) RETURNING id",
        args: [trimmed],
      });
      const id = Number(result.rows[0].id);
      return NextResponse.json({ id, value: trimmed });
    }
  } catch (error) {
    console.error('PUT /api/admin/unit-type error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
