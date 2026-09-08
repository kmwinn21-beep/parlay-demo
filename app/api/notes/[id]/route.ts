import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { findNoteCopies } from '@/lib/notes/copies';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const { content } = await request.json();
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 });
    const result = await db.execute({
      sql: 'UPDATE entity_notes SET content = ? WHERE id = ? RETURNING *',
      args: [content, params.id],
    });
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('PATCH /api/notes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const noteId = Number(params.id);
    if (!Number.isInteger(noteId)) {
      return NextResponse.json({ error: 'id must be a note id' }, { status: 400 });
    }

    // One note written against a conference, a company and an attendee is three
    // rows. `scope=all` removes the set; anything else removes this row only,
    // which is what every existing caller gets by not asking.
    const scope = request.nextUrl.searchParams.get('scope');
    let ids = [noteId];
    if (scope === 'all') {
      const { copies } = await findNoteCopies(db, noteId);
      ids = [noteId, ...copies.map(c => c.id)];
    }

    const placeholders = ids.map(() => '?').join(',');
    // Explicitly, not by cascade. pinned_notes declares ON DELETE CASCADE but
    // `PRAGMA foreign_keys` is not set on these connections, so the pin would
    // outlive its note and the feed would draw a pinned card with no text.
    await db.execute({
      sql: `DELETE FROM pinned_notes WHERE note_id IN (${placeholders})`,
      args: ids,
    }).catch(() => { /* the note is the thing that must go */ });
    await db.execute({
      sql: `DELETE FROM entity_notes WHERE id IN (${placeholders})`,
      args: ids,
    });
    return NextResponse.json({ success: true, deleted: ids.length, ids });
  } catch (error) {
    console.error('DELETE /api/notes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
