import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const body = await request.json();
    const updates: string[] = [];
    const args: (string | number | null)[] = [];

    if ('label' in body)          { updates.push('label = ?');          args.push(body.label ?? null); }
    if ('display_type' in body)   { updates.push('display_type = ?');   args.push(body.display_type); }
    if ('display_config' in body) { updates.push('display_config = ?'); args.push(body.display_config ? JSON.stringify(body.display_config) : null); }
    if ('sort_order' in body)     { updates.push('sort_order = ?');     args.push(body.sort_order); }
    if ('visible' in body)        { updates.push('visible = ?');        args.push(body.visible ? 1 : 0); }

    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    args.push(id);
    await db.execute({ sql: `UPDATE custom_columns SET ${updates.join(', ')} WHERE id = ?`, args });

    const result = await db.execute({ sql: `SELECT * FROM custom_columns WHERE id = ?`, args: [id] });
    if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
    });
  } catch (error) {
    console.error('PATCH /api/admin/custom-columns/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update custom column' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    await db.execute({ sql: `DELETE FROM custom_columns WHERE id = ?`, args: [id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/admin/custom-columns/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete custom column' }, { status: 500 });
  }
}
