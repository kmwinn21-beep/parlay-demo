import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function DELETE(request: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const itemId = Number(params.itemId);

    // Get entity_note_ids before deleting so we can clean up
    const row = await db.execute({
      sql: 'SELECT entity_note_ids FROM conference_my_agenda_items WHERE id = ? AND user_email = ?',
      args: [itemId, user.email],
    });
    if (row.rows.length === 0) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const noteIds = (String(row.rows[0].entity_note_ids ?? ''))
      .split(',').map(s => Number(s.trim())).filter(n => n > 0);

    if (noteIds.length > 0) {
      await Promise.all(noteIds.map(noteId =>
        db.execute({ sql: 'DELETE FROM entity_notes WHERE id = ?', args: [noteId] }).catch(() => {})
      ));
    }

    await db.execute({
      sql: 'DELETE FROM conference_my_agenda_items WHERE id = ? AND user_email = ?',
      args: [itemId, user.email],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id]/my-agenda/[itemId] error:', error);
    return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 });
  }
}
