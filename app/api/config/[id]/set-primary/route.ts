import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;

    const row = await db.execute({
      sql: 'SELECT id, category FROM config_options WHERE id = ?',
      args: [params.id],
    });
    if (row.rows.length === 0) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }
    const category = String(row.rows[0].category);

    // Clear existing primary in this category, then set the new one
    await db.execute({
      sql: 'UPDATE config_options SET is_primary = 0 WHERE category = ?',
      args: [category],
    });
    await db.execute({
      sql: 'UPDATE config_options SET is_primary = 1 WHERE id = ?',
      args: [params.id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/config/[id]/set-primary error:', error);
    return NextResponse.json({ error: 'Failed to set primary' }, { status: 500 });
  }
}
