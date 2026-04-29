import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

async function checkMembership(groupId: number, userId: number): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT 1 FROM group_conversation_members WHERE group_id = ? AND user_id = ?`,
    args: [groupId, userId],
  });
  return result.rows.length > 0;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const groupId = parseInt(params.id, 10);
  if (isNaN(groupId)) return NextResponse.json({ error: 'Invalid group id' }, { status: 400 });

  await dbReady;

  if (!(await checkMembership(groupId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [messages] = await Promise.all([
    db.execute({
      sql: `
        SELECT
          gm.id,
          gm.group_id,
          gm.sender_id,
          gm.content,
          gm.created_at,
          u.display_name AS sender_display_name,
          u.email        AS sender_email
        FROM group_messages gm
        JOIN users u ON u.id = gm.sender_id
        WHERE gm.group_id = ?
        ORDER BY gm.created_at ASC, gm.id ASC
        LIMIT 200
      `,
      args: [groupId],
    }),
    db.execute({
      sql: `UPDATE group_conversation_members SET last_read_at = datetime('now') WHERE group_id = ? AND user_id = ?`,
      args: [groupId, user.id],
    }),
  ]);

  return NextResponse.json(messages.rows.map(r => {
    const displayName = r.sender_display_name ? String(r.sender_display_name) : String(r.sender_email).split('@')[0];
    return {
      id: Number(r.id),
      groupId: Number(r.group_id),
      senderId: Number(r.sender_id),
      senderName: displayName,
      content: String(r.content),
      createdAt: String(r.created_at),
      mine: Number(r.sender_id) === user.id,
    };
  }));
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const groupId = parseInt(params.id, 10);
  if (isNaN(groupId)) return NextResponse.json({ error: 'Invalid group id' }, { status: 400 });

  await dbReady;

  if (!(await checkMembership(groupId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { content } = await request.json() as { content: string };
  if (!content?.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const userResult = await db.execute({
    sql: `SELECT display_name, email FROM users WHERE id = ?`,
    args: [user.id],
  });
  const u = userResult.rows[0];
  const senderName = u?.display_name ? String(u.display_name) : String(u?.email ?? '').split('@')[0];

  const result = await db.execute({
    sql: `INSERT INTO group_messages (group_id, sender_id, content) VALUES (?, ?, ?) RETURNING id, group_id, sender_id, content, created_at`,
    args: [groupId, user.id, content.trim()],
  });

  const row = result.rows[0];
  return NextResponse.json({
    id: Number(row.id),
    groupId: Number(row.group_id),
    senderId: Number(row.sender_id),
    senderName,
    content: String(row.content),
    createdAt: String(row.created_at),
    mine: true,
  }, { status: 201 });
}
