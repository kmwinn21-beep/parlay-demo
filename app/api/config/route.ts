import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let result;
    if (category) {
      result = await db.execute({
        sql: 'SELECT id, category, value, sort_order, color, action_key FROM config_options WHERE category = ? ORDER BY sort_order, value',
        args: [category],
      });
    } else {
      // Return all options (used for color lookups across the app)
      result = await db.execute({
        sql: 'SELECT id, category, value, sort_order, color, action_key FROM config_options ORDER BY category, sort_order, value',
        args: [],
      });
    }

    return NextResponse.json(result.rows.map(r => ({
      id: Number(r.id),
      category: String(r.category),
      value: String(r.value),
      sort_order: Number(r.sort_order ?? 0),
      color: r.color ? String(r.color) : null,
      action_key: r.action_key ? String(r.action_key) : null,
    })), { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } });
  } catch (error) {
    console.error('GET /api/config error:', error);
    return NextResponse.json({ error: 'Failed to fetch config options' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { category, value, sort_order, color } = body;

    if (!category || !value) {
      return NextResponse.json({ error: 'category and value are required' }, { status: 400 });
    }

    // Prevent re-adding legacy "True"/"False" ICP option values
    if (category === 'icp' && (value === 'True' || value === 'False')) {
      return NextResponse.json({ error: '"True" and "False" are reserved and cannot be used as ICP options' }, { status: 400 });
    }

    const result = await db.execute({
      sql: 'INSERT INTO config_options (category, value, sort_order, color) VALUES (?, ?, ?, ?) RETURNING *',
      args: [category, value, sort_order ?? 0, color ?? null],
    });

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('POST /api/config error:', error);
    return NextResponse.json({ error: 'Failed to create config option' }, { status: 500 });
  }
}

// Batch update sort_order for reordering
export async function PATCH(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { items } = body as { items: { id: number; sort_order: number }[] };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    for (const item of items) {
      await db.execute({
        sql: 'UPDATE config_options SET sort_order = ? WHERE id = ?',
        args: [item.sort_order, item.id],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/config error:', error);
    return NextResponse.json({ error: 'Failed to reorder options' }, { status: 500 });
  }
}
