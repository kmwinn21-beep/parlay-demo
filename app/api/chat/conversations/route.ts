import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;

    const result = await db.execute({
      sql: `SELECT cc.id, cc.user1_id, cc.user2_id, cc.created_at,
                   CASE WHEN cc.user1_id = ? THEN cc.user2_id ELSE cc.user1_id END AS partner_id,
                   COALESCE(u.display_name, u.email) AS partner_name,
                   u.email AS partner_email,
                   lm.content AS last_message,
                   lm.created_at AS last_message_at,
                   lm.sender_id AS last_sender_id
            FROM chat_conversations cc
            JOIN users u ON u.id = (CASE WHEN cc.user1_id = ? THEN cc.user2_id ELSE cc.user1_id END)
            LEFT JOIN chat_messages lm ON lm.id = (
              SELECT MAX(id) FROM chat_messages WHERE conversation_id = cc.id
            )
            WHERE cc.user1_id = ? OR cc.user2_id = ?
            ORDER BY COALESCE(lm.created_at, cc.created_at) DESC`,
      args: [user.id, user.id, user.id, user.id],
    });

    return NextResponse.json(
      result.rows.map((r) => ({
        id: Number(r.id),
        partner_id: Number(r.partner_id),
        partner_name: String(r.partner_name),
        partner_email: String(r.partner_email),
        last_message: r.last_message != null ? String(r.last_message) : null,
        last_message_at: r.last_message_at != null ? String(r.last_message_at) : null,
        last_sender_id: r.last_sender_id != null ? Number(r.last_sender_id) : null,
        created_at: String(r.created_at),
      }))
    );
  } catch (error) {
    console.error('GET /api/chat/conversations error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;

    const { partner_id } = await request.json();
    if (!partner_id || typeof partner_id !== 'number') {
      return NextResponse.json({ error: 'partner_id is required' }, { status: 400 });
    }
    if (partner_id === user.id) {
      return NextResponse.json({ error: 'Cannot start a conversation with yourself' }, { status: 400 });
    }

    // Verify partner exists
    const partnerRow = await db.execute({
      sql: 'SELECT id, email, COALESCE(display_name, email) AS name FROM users WHERE id = ?',
      args: [partner_id],
    });
    if (partnerRow.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Always store with lower id as user1 to enforce uniqueness
    const u1 = Math.min(user.id, partner_id);
    const u2 = Math.max(user.id, partner_id);

    // Upsert — get existing or create new
    const existing = await db.execute({
      sql: 'SELECT id FROM chat_conversations WHERE user1_id = ? AND user2_id = ?',
      args: [u1, u2],
    });

    let convId: number;
    if (existing.rows.length > 0) {
      convId = Number(existing.rows[0].id);
    } else {
      const created = await db.execute({
        sql: 'INSERT INTO chat_conversations (user1_id, user2_id) VALUES (?, ?) RETURNING id',
        args: [u1, u2],
      });
      convId = Number(created.rows[0].id);
    }

    const partner = partnerRow.rows[0];
    return NextResponse.json({
      id: convId,
      partner_id,
      partner_name: String(partner.name),
      partner_email: String(partner.email),
      last_message: null,
      last_message_at: null,
      last_sender_id: null,
      created_at: new Date().toISOString(),
    }, { status: existing.rows.length > 0 ? 200 : 201 });
  } catch (error) {
    console.error('POST /api/chat/conversations error:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
