import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function DELETE(request: NextRequest, { params }: { params: { id: string; companyId: string; noteId: string; commentId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const commentId = Number(params.commentId);
  if (!commentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const result = await db.execute({
      sql: `DELETE FROM outreach_note_comments WHERE id = ? AND user_id = ?`,
      args: [commentId, authResult.id],
    });
    if (Number(result.rowsAffected ?? 0) === 0) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id]/outreach/[companyId]/notes/[noteId]/comments/[commentId] error:', error);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
