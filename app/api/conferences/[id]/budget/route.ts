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
      sql: 'SELECT line_items, return_on_cost FROM conference_budget WHERE conference_id = ?',
      args: [conferenceId],
    });
    if (result.rows.length === 0) {
      return NextResponse.json({ line_items: [], return_on_cost: null });
    }
    const raw = String(result.rows[0].line_items ?? '[]');
    return NextResponse.json({
      line_items: JSON.parse(raw),
      return_on_cost: result.rows[0].return_on_cost ?? null,
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/budget error:', error);
    return NextResponse.json({ line_items: [], return_on_cost: null });
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
    const { line_items, return_on_cost } = body as { line_items: unknown[]; return_on_cost: string | null };
    await db.execute({
      sql: `INSERT INTO conference_budget (conference_id, line_items, return_on_cost, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(conference_id) DO UPDATE SET
              line_items = excluded.line_items,
              return_on_cost = excluded.return_on_cost,
              updated_at = excluded.updated_at`,
      args: [conferenceId, JSON.stringify(line_items ?? []), return_on_cost ?? null],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/conferences/[id]/budget error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
