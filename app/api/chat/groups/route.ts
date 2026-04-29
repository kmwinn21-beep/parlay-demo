import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  await dbReady;

  const result = await db.execute({
    sql: `
      SELECT
        gc.id,
        gc.name,
        gc.created_by,
        gc.created_at,
        lm.content    AS last_content,
        lm.created_at AS last_created_at,
        lm.sender_id  AS last_sender_id,
        (
          SELECT COUNT(*) FROM group_messages gm2
          WHERE gm2.group_id = gc.id
            AND gm2.created_at > COALESCE(gcm.last_read_at, '1970-01-01')
            AND gm2.sender_id != ?
        ) AS unread_count
      FROM group_conversations gc
      JOIN group_conversation_members gcm
        ON gcm.group_id = gc.id AND gcm.user_id = ?
      LEFT JOIN group_messages lm
        ON lm.id = (
          SELECT id FROM group_messages
          WHERE group_id = gc.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        )
      ORDER BY COALESCE(lm.created_at, gc.created_at) DESC
    `,
    args: [user.id, user.id],
  });

  return NextResponse.json(result.rows.map(r => ({
    id: Number(r.id),
    name: String(r.name),
    createdBy: Number(r.created_by),
    createdAt: String(r.created_at),
    lastContent: r.last_content ? String(r.last_content) : null,
    lastCreatedAt: r.last_created_at ? String(r.last_created_at) : null,
    lastSenderId: r.last_sender_id ? Number(r.last_sender_id) : null,
    unreadCount: Number(r.unread_count),
  })));
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  await dbReady;

  const { name, memberIds, conferenceId } = await request.json() as {
    name: string;
    memberIds: number[];
    conferenceId?: number;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
  }
  if (!Array.isArray(memberIds)) {
    return NextResponse.json({ error: 'memberIds must be an array' }, { status: 400 });
  }

  const memberSet = new Set<number>(memberIds);
  memberSet.add(user.id);

  // If a conference is specified, resolve its internal_attendees to user IDs
  if (conferenceId) {
    const confResult = await db.execute({
      sql: `SELECT internal_attendees FROM conferences WHERE id = ?`,
      args: [conferenceId],
    });
    if (confResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 400 });
    }
    const raw = confResult.rows[0].internal_attendees;
    if (raw && String(raw).trim()) {
      const configIds = String(raw).split(',').map(s => s.trim()).filter(Boolean);
      if (configIds.length > 0) {
        const placeholders = configIds.map(() => '?').join(',');
        const userResult = await db.execute({
          sql: `SELECT id FROM users WHERE config_id IN (${placeholders}) AND email_verified = 1`,
          args: configIds,
        });
        for (const row of userResult.rows) memberSet.add(Number(row.id));
      }
    }
  }

  // Create the group
  const groupResult = await db.execute({
    sql: `INSERT INTO group_conversations (name, created_by) VALUES (?, ?) RETURNING id`,
    args: [name.trim(), user.id],
  });
  const groupId = Number(groupResult.rows[0].id);

  // Add all members
  for (const uid of Array.from(memberSet)) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO group_conversation_members (group_id, user_id) VALUES (?, ?)`,
      args: [groupId, uid],
    });
  }

  return NextResponse.json({ id: groupId, name: name.trim(), memberCount: memberSet.size }, { status: 201 });
}
