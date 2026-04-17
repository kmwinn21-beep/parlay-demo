import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('table');

    if (tableName) {
      const result = await db.execute({
        sql: 'SELECT column_key, visible FROM table_column_config WHERE table_name = ?',
        args: [tableName],
      });
      const config: Record<string, boolean> = {};
      for (const row of result.rows) {
        config[String(row.column_key)] = Number(row.visible) === 1;
      }
      return NextResponse.json(config);
    }

    const result = await db.execute({
      sql: 'SELECT table_name, column_key, visible FROM table_column_config',
      args: [],
    });
    const config: Record<string, Record<string, boolean>> = {};
    for (const row of result.rows) {
      const tbl = String(row.table_name);
      if (!config[tbl]) config[tbl] = {};
      config[tbl][String(row.column_key)] = Number(row.visible) === 1;
    }
    return NextResponse.json(config);
  } catch (error) {
    console.error('GET /api/admin/table-config error:', error);
    return NextResponse.json({ error: 'Failed to fetch table config' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  if (user.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await dbReady;
    const { table, column, visible } = await request.json() as {
      table: string;
      column: string;
      visible: boolean;
    };
    if (!table || !column || visible === undefined) {
      return NextResponse.json({ error: 'table, column, and visible are required' }, { status: 400 });
    }
    await db.execute({
      sql: 'INSERT OR REPLACE INTO table_column_config (table_name, column_key, visible) VALUES (?, ?, ?)',
      args: [table, column, visible ? 1 : 0],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/admin/table-config error:', error);
    return NextResponse.json({ error: 'Failed to save column config' }, { status: 500 });
  }
}
