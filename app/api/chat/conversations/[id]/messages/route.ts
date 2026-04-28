import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getConversation(convId: number, userId: number) {
  const result = await db.execute({
    sql: 'SELECT id, user1_id, user2_id FROM chat_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
    args: [convId, userId, userId],
  });
  return result.rows[0] ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;

    const convId = parseInt(params.id, 10);
    if (isNaN(convId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const conv = await getConversation(convId, user.id);
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const before = searchParams.get('before'); // cursor for pagination (message id)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);

    const result = await db.execute({
      sql: `SELECT cm.id, cm.conversation_id, cm.sender_id, cm.content, cm.created_at,
                   u.email AS sender_email, COALESCE(u.display_name, u.email) AS sender_name
            FROM chat_messages cm
            JOIN users u ON cm.sender_id = u.id
            WHERE cm.conversation_id = ?
              ${before ? 'AND cm.id < ?' : ''}
            ORDER BY cm.id DESC
            LIMIT ?`,
      args: before ? [convId, parseInt(before, 10), limit] : [convId, limit],
    });

    // Return oldest-first for the client to render top-to-bottom
    const messages = result.rows.reverse().map((r) => ({
      id: Number(r.id),
      conversation_id: Number(r.conversation_id),
      sender_id: Number(r.sender_id),
      content: String(r.content),
      created_at: String(r.created_at),
      sender_email: String(r.sender_email),
      sender_name: String(r.sender_name),
    }));

    return NextResponse.json(messages);
  } catch (error) {
    console.error('GET /api/chat/conversations/[id]/messages error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;

    const convId = parseInt(params.id, 10);
    if (isNaN(convId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const conv = await getConversation(convId, user.id);
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const { content } = await request.json();
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `INSERT INTO chat_messages (conversation_id, sender_id, content)
            VALUES (?, ?, ?)
            RETURNING id, conversation_id, sender_id, content, created_at`,
      args: [convId, user.id, content.trim()],
    });

    const row = result.rows[0];
    return NextResponse.json({
      id: Number(row.id),
      conversation_id: Number(row.conversation_id),
      sender_id: Number(row.sender_id),
      content: String(row.content),
      created_at: String(row.created_at),
      sender_email: user.email,
      sender_name: user.email,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/chat/conversations/[id]/messages error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
