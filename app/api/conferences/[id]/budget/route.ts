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
      sql: 'SELECT line_items, return_on_cost, required_pipeline_multiple, required_pipeline_amount FROM conference_budget WHERE conference_id = ?',
      args: [conferenceId],
    });
    if (result.rows.length === 0) {
      return NextResponse.json({ line_items: [], return_on_cost: null, required_pipeline_multiple: '3.5', required_pipeline_amount: null });
    }
    const raw = String(result.rows[0].line_items ?? '[]');
    return NextResponse.json({
      line_items: JSON.parse(raw),
      return_on_cost: result.rows[0].return_on_cost ?? null,
      required_pipeline_multiple: result.rows[0].required_pipeline_multiple ?? '3.5',
      required_pipeline_amount: result.rows[0].required_pipeline_amount != null ? Number(result.rows[0].required_pipeline_amount) : null,
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/budget error:', error);
    return NextResponse.json({ line_items: [], return_on_cost: null, required_pipeline_multiple: '3.5', required_pipeline_amount: null });
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
    const { line_items, return_on_cost, required_pipeline_multiple } = body as { line_items: unknown[]; return_on_cost: string | null; required_pipeline_multiple?: string | null };
    const parsedMultiple = Number(required_pipeline_multiple ?? 3.5);
    const safeMultiple = Number.isFinite(parsedMultiple) && parsedMultiple > 0 ? parsedMultiple : 3.5;
    const budgetTotal = Array.isArray(line_items) ? line_items.reduce((sum, item) => {
      const raw = String((item as Record<string, unknown>)?.budget ?? '').replace(/[^0-9.]/g, '');
      const n = Number(raw);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0) : 0;
    const returnOnCostNum = Number(return_on_cost ?? 0);
    const expectedReturnAmount = Number.isFinite(returnOnCostNum) && returnOnCostNum > 0 ? budgetTotal * returnOnCostNum : 0;
    const requiredPipelineAmount = expectedReturnAmount > 0 ? expectedReturnAmount * safeMultiple : null;
    await db.execute({
      sql: `INSERT INTO conference_budget (conference_id, line_items, return_on_cost, required_pipeline_multiple, required_pipeline_amount, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(conference_id) DO UPDATE SET
              line_items = excluded.line_items,
              return_on_cost = excluded.return_on_cost,
              required_pipeline_multiple = excluded.required_pipeline_multiple,
              required_pipeline_amount = excluded.required_pipeline_amount,
              updated_at = excluded.updated_at`,
      args: [conferenceId, JSON.stringify(line_items ?? []), return_on_cost ?? null, String(safeMultiple), requiredPipelineAmount],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/conferences/[id]/budget error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
