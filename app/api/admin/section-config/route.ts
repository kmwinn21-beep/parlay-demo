import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';

export async function GET() {
  await initDb();
  const rows = await db.execute({
    sql: 'SELECT page, section_key, label, sort_order, visible FROM section_config ORDER BY page, sort_order',
    args: [],
  });
  const result: Record<string, Array<{ key: string; label: string; sort_order: number; visible: boolean }>> = {};
  for (const row of rows.rows) {
    const page = String(row.page);
    if (!result[page]) result[page] = [];
    result[page].push({
      key: String(row.section_key),
      label: String(row.label),
      sort_order: Number(row.sort_order),
      visible: Number(row.visible) !== 0,
    });
  }
  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  await initDb();
  const { page, sections } = await request.json() as {
    page: string;
    sections: Array<{ key: string; label: string; sort_order: number; visible: boolean }>;
  };
  for (const s of sections) {
    await db.execute({
      sql: `INSERT INTO section_config (page, section_key, label, sort_order, visible)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(page, section_key) DO UPDATE SET label=excluded.label, sort_order=excluded.sort_order, visible=excluded.visible`,
      args: [page, s.key, s.label, s.sort_order, s.visible ? 1 : 0],
    });
  }
  return NextResponse.json({ ok: true });
}
