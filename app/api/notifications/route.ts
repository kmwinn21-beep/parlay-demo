import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/notifications
// Query params:
//   unread_only=1   — only return unread
//   limit=N         — max rows (default 50)
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread_only') === '1';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

    const where = unreadOnly
      ? 'WHERE n.user_id = ? AND n.is_read = 0'
      : 'WHERE n.user_id = ?';

    const result = await db.execute({
      sql: `SELECT n.*, co.value AS changed_by_name
            FROM notifications n
            LEFT JOIN config_options co
              ON n.changed_by_config_id = co.id AND co.category = 'user'
            ${where}
            ORDER BY n.created_at DESC
            LIMIT ?`,
      args: [user.id, limit],
    });

    return NextResponse.json(
      result.rows.map(r => ({
        id: Number(r.id),
        type: String(r.type),
        record_id: Number(r.record_id),
        record_name: String(r.record_name),
        message: String(r.message),
        changed_by_config_id: r.changed_by_config_id != null ? Number(r.changed_by_config_id) : null,
        changed_by_email: r.changed_by_email ? String(r.changed_by_email) : null,
        changed_by_name: r.changed_by_name ? String(r.changed_by_name) : null,
        entity_type: String(r.entity_type),
        entity_id: Number(r.entity_id),
        is_read: Number(r.is_read) === 1,
        created_at: String(r.created_at),
      }))
    );
  } catch (error) {
    console.error('GET /api/notifications error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// PATCH /api/notifications
// Body: { id } | { ids: number[] } | { all: true }
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const body = await request.json() as { id?: number; ids?: number[]; all?: boolean };

    if (body.all) {
      await db.execute({
        sql: 'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
        args: [user.id],
      });
    } else if (body.ids && body.ids.length > 0) {
      const ph = body.ids.map(() => '?').join(',');
      await db.execute({
        sql: `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${ph})`,
        args: [user.id, ...body.ids],
      });
    } else if (body.id != null) {
      await db.execute({
        sql: 'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?',
        args: [user.id, body.id],
      });
    } else {
      return NextResponse.json({ error: 'id, ids, or all is required' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/notifications error:', error);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
