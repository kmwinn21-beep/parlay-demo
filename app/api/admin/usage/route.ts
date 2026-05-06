import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await dbReady;

    const [usersResult, sparklineResult] = await Promise.all([
      db.execute({
        sql: `
          SELECT
            u.id,
            u.email,
            u.display_name,
            u.first_name,
            u.last_name,
            u.role,
            u.active,
            u.created_at,
            u.last_seen_at,
            COUNT(DISTINCT s.id)                                                                    AS total_logins,
            COUNT(DISTINCT CASE WHEN s.created_at >= date('now', '-30 days') THEN s.id END)         AS logins_30d,
            COUNT(DISTINCT en.id)                                                                   AS notes_written,
            COUNT(DISTINCT nc.id)                                                                   AS comments_written,
            COUNT(DISTINCT dm.id) + COUNT(DISTINCT gm.id)                                          AS messages_sent
          FROM users u
          LEFT JOIN user_sessions   s  ON s.user_id = u.id
          LEFT JOIN entity_notes    en ON en.author_user_id = u.id
          LEFT JOIN note_comments   nc ON nc.user_id = u.id
          LEFT JOIN direct_messages dm ON dm.sender_id = u.id
          LEFT JOIN group_messages  gm ON gm.sender_id = u.id
          GROUP BY u.id
          ORDER BY logins_30d DESC, u.created_at ASC
        `,
        args: [],
      }),
      db.execute({
        sql: `
          SELECT DATE(created_at) AS day, COUNT(*) AS count
          FROM user_sessions
          WHERE created_at >= date('now', '-30 days')
          GROUP BY DATE(created_at)
          ORDER BY day ASC
        `,
        args: [],
      }),
    ]);

    const users = usersResult.rows.map(r => ({
      id:               Number(r.id),
      email:            String(r.email),
      display_name:     r.display_name ? String(r.display_name) : null,
      first_name:       r.first_name ? String(r.first_name) : null,
      last_name:        r.last_name ? String(r.last_name) : null,
      role:             String(r.role),
      active:           Number(r.active),
      created_at:       String(r.created_at),
      last_seen_at:     r.last_seen_at ? String(r.last_seen_at) : null,
      total_logins:     Number(r.total_logins),
      logins_30d:       Number(r.logins_30d),
      notes_written:    Number(r.notes_written),
      comments_written: Number(r.comments_written),
      messages_sent:    Number(r.messages_sent),
    }));

    const sparkline = sparklineResult.rows.map(r => ({
      day:   String(r.day),
      count: Number(r.count),
    }));

    const totalUsers   = users.length;
    const activeUsers  = users.filter(u => u.logins_30d > 0).length;
    const totalLogins30d = users.reduce((sum, u) => sum + u.logins_30d, 0);

    return NextResponse.json({
      summary: { total_users: totalUsers, active_last_30d: activeUsers, logins_last_30d: totalLogins30d },
      sparkline,
      users,
    });
  } catch (error) {
    console.error('GET /api/admin/usage error:', error);
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 });
  }
}
