import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const conferenceId = Number(params.id);
    const result = await db.execute({
      sql: 'SELECT line_items FROM conference_budget WHERE conference_id = ?',
      args: [conferenceId],
    });
    if (result.rows.length === 0) {
      return NextResponse.json({ line_items: [] });
    }
    const raw = String(result.rows[0].line_items ?? '[]');
    return NextResponse.json({ line_items: JSON.parse(raw) });
  } catch (error) {
    console.error('GET /api/conferences/[id]/budget error:', error);
    return NextResponse.json({ line_items: [] });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const conferenceId = Number(params.id);
    const body = await request.json();
    const { line_items } = body as { line_items: unknown[] };
    await db.execute({
      sql: `INSERT INTO conference_budget (conference_id, line_items, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(conference_id) DO UPDATE SET
              line_items = excluded.line_items,
              updated_at = excluded.updated_at`,
      args: [conferenceId, JSON.stringify(line_items ?? [])],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/conferences/[id]/budget error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
