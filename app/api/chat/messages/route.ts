import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const withId = request.nextUrl.searchParams.get('with');
  if (!withId) return NextResponse.json({ error: 'Missing ?with param' }, { status: 400 });
  const otherId = parseInt(withId, 10);
  if (isNaN(otherId)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  await dbReady;

  const [messages] = await Promise.all([
    db.execute({
      sql: `SELECT id, sender_id, receiver_id, content, created_at, read_at
            FROM direct_messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at ASC, id ASC
            LIMIT 200`,
      args: [user.id, otherId, otherId, user.id],
    }),
    // Mark messages from other user as read
    db.execute({
      sql: `UPDATE direct_messages SET read_at = datetime('now')
            WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL`,
      args: [otherId, user.id],
    }),
  ]);

  return NextResponse.json(messages.rows.map(r => ({
    id: Number(r.id),
    senderId: Number(r.sender_id),
    receiverId: Number(r.receiver_id),
    content: String(r.content),
    createdAt: String(r.created_at),
    readAt: r.read_at ? String(r.read_at) : null,
    mine: Number(r.sender_id) === user.id,
  })));
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  await dbReady;
  const { receiverId, content } = await request.json() as { receiverId: number; content: string };
  if (!receiverId || !content?.trim()) {
    return NextResponse.json({ error: 'receiverId and content are required' }, { status: 400 });
  }

  const result = await db.execute({
    sql: `INSERT INTO direct_messages (sender_id, receiver_id, content)
          VALUES (?, ?, ?)
          RETURNING id, sender_id, receiver_id, content, created_at`,
    args: [user.id, receiverId, content.trim()],
  });

  const row = result.rows[0];
  return NextResponse.json({
    id: Number(row.id),
    senderId: Number(row.sender_id),
    receiverId: Number(row.receiver_id),
    content: String(row.content),
    createdAt: String(row.created_at),
    readAt: null,
    mine: true,
  }, { status: 201 });
}
