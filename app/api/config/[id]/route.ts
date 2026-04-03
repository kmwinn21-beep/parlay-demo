import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const body = await request.json();
    const { value, sort_order } = body;

    if (!value) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: 'UPDATE config_options SET value = ?, sort_order = ? WHERE id = ? RETURNING *',
      args: [value, sort_order ?? 0, params.id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('PUT /api/config/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update config option' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    await db.execute({
      sql: 'DELETE FROM config_options WHERE id = ?',
      args: [params.id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/config/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete config option' }, { status: 500 });
  }
}
