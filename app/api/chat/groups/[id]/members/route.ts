import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const groupId = parseInt(params.id, 10);
  if (isNaN(groupId)) return NextResponse.json({ error: 'Invalid group id' }, { status: 400 });

  await dbReady;

  const membership = await db.execute({
    sql: `SELECT 1 FROM group_conversation_members WHERE group_id = ? AND user_id = ?`,
    args: [groupId, user.id],
  });
  if (membership.rows.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await db.execute({
    sql: `
      SELECT u.id, u.email, u.display_name
      FROM group_conversation_members gcm
      JOIN users u ON u.id = gcm.user_id
      WHERE gcm.group_id = ?
      ORDER BY COALESCE(u.display_name, u.email)
    `,
    args: [groupId],
  });

  return NextResponse.json(result.rows.map(r => ({
    id: Number(r.id),
    email: String(r.email),
    displayName: r.display_name ? String(r.display_name) : null,
  })));
}
