import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  await dbReady;

  // Get all conversations: last message + unread count per other user
  const result = await db.execute({
    sql: `
      SELECT
        other_user.id AS other_id,
        other_user.email AS other_email,
        other_user.display_name AS other_display_name,
        last_msg.content AS last_content,
        last_msg.created_at AS last_created_at,
        last_msg.sender_id AS last_sender_id,
        (
          SELECT COUNT(*) FROM direct_messages unread
          WHERE unread.sender_id = other_user.id
            AND unread.receiver_id = ?
            AND unread.read_at IS NULL
        ) AS unread_count
      FROM (
        SELECT
          CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_user_id,
          MAX(id) AS last_msg_id
        FROM direct_messages
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY other_user_id
      ) convs
      JOIN direct_messages last_msg ON last_msg.id = convs.last_msg_id
      JOIN users other_user ON other_user.id = convs.other_user_id
      ORDER BY last_msg.created_at DESC
    `,
    args: [user.id, user.id, user.id, user.id],
  });

  return NextResponse.json(result.rows.map(r => ({
    otherId: Number(r.other_id),
    otherEmail: String(r.other_email),
    otherDisplayName: r.other_display_name ? String(r.other_display_name) : null,
    lastContent: String(r.last_content),
    lastCreatedAt: String(r.last_created_at),
    lastSenderId: Number(r.last_sender_id),
    unreadCount: Number(r.unread_count),
  })));
}
