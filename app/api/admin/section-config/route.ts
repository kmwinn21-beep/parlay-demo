import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
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
  } catch (error) {
    console.error('GET /api/admin/section-config error:', error);
    return NextResponse.json({ error: 'Failed to load section config' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json() as {
      page: string;
      sections: Array<{ key: string; label: string; sort_order: number; visible: boolean }>;
    };
    const { page, sections } = body;
    if (!page || !Array.isArray(sections)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    // Delete all existing rows for this page then re-insert — avoids any
    // dependency on UNIQUE constraints that may be missing in older deployments.
    await db.execute({ sql: 'DELETE FROM section_config WHERE page = ?', args: [page] });
    for (const s of sections) {
      await db.execute({
        sql: 'INSERT INTO section_config (page, section_key, label, sort_order, visible) VALUES (?, ?, ?, ?, ?)',
        args: [page, s.key, s.label, s.sort_order, s.visible ? 1 : 0],
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/admin/section-config error:', error);
    return NextResponse.json({ error: 'Failed to save section config' }, { status: 500 });
  }
}
