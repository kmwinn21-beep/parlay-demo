import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const commentId = Number(params.commentId);

    const existing = await db.execute({
      sql: 'SELECT user_id FROM note_comments WHERE id = ?',
      args: [commentId],
    });
    if (!existing.rows.length) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    if (Number(existing.rows[0].user_id) !== user.id) {
      return NextResponse.json({ error: 'Not your comment' }, { status: 403 });
    }

    await db.execute({ sql: 'DELETE FROM note_comments WHERE id = ?', args: [commentId] });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/notes/[id]/comments/[commentId] error:', err);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
