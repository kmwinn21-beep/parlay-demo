import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('table');
    if (!tableName) {
      return NextResponse.json({ error: 'table parameter required' }, { status: 400 });
    }
    const result = await db.execute({
      sql: `SELECT id, table_name, column_key, label, data_key, config_category,
                   is_user_field, display_type, display_config, sort_order, visible
            FROM custom_columns
            WHERE table_name = ?
            ORDER BY sort_order, id`,
      args: [tableName],
    });
    const rows = result.rows.map(r => ({
      id: Number(r.id),
      table_name: String(r.table_name),
      column_key: String(r.column_key),
      label: String(r.label),
      data_key: String(r.data_key),
      config_category: r.config_category ? String(r.config_category) : null,
      is_user_field: Number(r.is_user_field) !== 0,
      display_type: String(r.display_type),
      display_config: r.display_config ? JSON.parse(String(r.display_config)) : null,
      sort_order: Number(r.sort_order),
      visible: Number(r.visible) !== 0,
    }));
    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/admin/custom-columns error:', error);
    return NextResponse.json({ error: 'Failed to fetch custom columns' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { table_name, column_key, label, data_key, config_category, is_user_field, display_type, display_config } = body;

    if (!table_name || !column_key || !label || !data_key || !display_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM custom_columns WHERE table_name = ?`,
      args: [table_name],
    });
    const sort_order = Number(countResult.rows[0].cnt);

    const result = await db.execute({
      sql: `INSERT INTO custom_columns (table_name, column_key, label, data_key, config_category, is_user_field, display_type, display_config, sort_order, visible)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            RETURNING *`,
      args: [
        table_name, column_key, label, data_key,
        config_category ?? null,
        is_user_field ? 1 : 0,
        display_type,
        display_config ? JSON.stringify(display_config) : null,
        sort_order,
      ],
    });

    const row = result.rows[0];
    return NextResponse.json({
      id: Number(row.id),
      table_name: String(row.table_name),
      column_key: String(row.column_key),
      label: String(row.label),
      data_key: String(row.data_key),
      config_category: row.config_category ? String(row.config_category) : null,
      is_user_field: Number(row.is_user_field) !== 0,
      display_type: String(row.display_type),
      display_config: row.display_config ? JSON.parse(String(row.display_config)) : null,
      sort_order: Number(row.sort_order),
      visible: Number(row.visible) !== 0,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/custom-columns error:', error);
    return NextResponse.json({ error: 'Failed to create custom column' }, { status: 500 });
  }
}
