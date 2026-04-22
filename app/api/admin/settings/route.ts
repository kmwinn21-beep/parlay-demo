import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const result = await db.execute({ sql: 'SELECT key, value FROM site_settings', args: [] });
    const settings: Record<string, string> = {};
    for (const row of result.rows) settings[String(row.key)] = String(row.value);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('GET /api/admin/settings error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
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
    const { key, value } = await request.json() as { key: string; value: string };
    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key and value are required' }, { status: 400 });
    }
    await db.execute({
      sql: 'INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)',
      args: [key, String(value)],
    });
    revalidatePath('/', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/admin/settings error:', error);
    return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 });
  }
}
