import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    await dbReady;
    const result = await db.execute({
      sql: 'SELECT key, value FROM effectiveness_defaults',
      args: [],
    });
    const data: Record<string, string> = {};
    for (const row of result.rows) {
      data[String(row.key)] = String(row.value ?? '');
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('GET /api/admin/effectiveness error:', error);
    return NextResponse.json({});
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { key, value } = body as { key: string; value: string };
    if (!key?.trim()) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }
    await db.execute({
      sql: 'INSERT INTO effectiveness_defaults (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      args: [key.trim(), value ?? ''],
    });
    return NextResponse.json({ key: key.trim(), value: value ?? '' });
  } catch (error) {
    console.error('PUT /api/admin/effectiveness error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
