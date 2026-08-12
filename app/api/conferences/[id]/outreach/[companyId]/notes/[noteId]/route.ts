import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// PUT/DELETE a single outreach note — ownership-checked (only the user who
// logged the note can edit or delete it), mirroring
// app/api/quick-notes/[id]/route.ts's WHERE id = ? AND <owner column> = ?
// pattern (owner column here is outreach_notes.user_id, not created_by).

export async function PUT(request: NextRequest, { params }: { params: { id: string; companyId: string; noteId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const noteId = Number(params.noteId);
  if (!noteId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const { body: content } = await request.json() as { body?: string };
    if (!content?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 });

    const result = await db.execute({
      sql: `UPDATE outreach_notes SET body = ? WHERE id = ? AND user_id = ? RETURNING id, body`,
      args: [content.trim(), noteId, authResult.id],
    });
    if (result.rows.length === 0) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

    return NextResponse.json({ id: noteId, body: content.trim() });
  } catch (error) {
    console.error('PUT /api/conferences/[id]/outreach/[companyId]/notes/[noteId] error:', error);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; companyId: string; noteId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const noteId = Number(params.noteId);
  if (!noteId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const result = await db.execute({
      sql: `DELETE FROM outreach_notes WHERE id = ? AND user_id = ?`,
      args: [noteId, authResult.id],
    });
    if (Number(result.rowsAffected ?? 0) === 0) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id]/outreach/[companyId]/notes/[noteId] error:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
