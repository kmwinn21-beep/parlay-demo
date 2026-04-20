import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { getCategoryFormKeys } from '@/lib/configOptionForms';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const form = searchParams.get('form');
    const includeVisibility = searchParams.get('include_visibility') === '1';

    let result;
    if (category) {
      result = await db.execute({
        sql: 'SELECT id, category, value, sort_order, color, action_key, status_key, scope FROM config_options WHERE category = ? ORDER BY sort_order, value',
        args: [category],
      });
    } else {
      // Return all options (used for color lookups across the app)
      result = await db.execute({
        sql: 'SELECT id, category, value, sort_order, color, action_key, status_key, scope FROM config_options ORDER BY category, sort_order, value',
        args: [],
      });
    }

    const baseRows = result.rows.map(r => ({
      id: Number(r.id),
      category: String(r.category),
      value: String(r.value),
      sort_order: Number(r.sort_order ?? 0),
      color: r.color ? String(r.color) : null,
      action_key: r.action_key ? String(r.action_key) : null,
      status_key: r.status_key ? String(r.status_key) : null,
      scope: r.scope ? String(r.scope) : 'global',
    }));

    if (!form && !includeVisibility) {
      return NextResponse.json(baseRows, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } });
    }

    const optionIds = baseRows.map(r => r.id);
    if (optionIds.length === 0) {
      return NextResponse.json([], { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } });
    }

    const visibilityRows = await db.execute({
      sql: `SELECT option_id, form_key, visible
            FROM config_option_visibility
            WHERE option_id IN (${optionIds.map(() => '?').join(',')})`,
      args: optionIds,
    });
    const visibilityMap = new Map<string, boolean>();
    for (const row of visibilityRows.rows) {
      visibilityMap.set(`${Number(row.option_id)}::${String(row.form_key)}`, Number(row.visible) !== 0);
    }

    let enriched = baseRows.map((row) => {
      const formKeys = getCategoryFormKeys(row.category);
      const visibleForms = formKeys.filter((formKey) => visibilityMap.get(`${row.id}::${formKey}`) ?? true);
      return { ...row, visible_forms: visibleForms };
    });

    if (form) {
      enriched = enriched.filter(row => {
        const visible = visibilityMap.get(`${row.id}::${form}`);
        return visible ?? true;
      });
    }

    const cacheControl = (includeVisibility || form)
      ? 'no-store'
      : 'private, max-age=300, stale-while-revalidate=600';
    return NextResponse.json(enriched, { headers: { 'Cache-Control': cacheControl } });
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
