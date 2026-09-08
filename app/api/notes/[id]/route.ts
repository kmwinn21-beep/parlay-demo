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
    const noteId = Number(params.id);
    if (!Number.isInteger(noteId)) {
      return NextResponse.json({ error: 'id must be a note id' }, { status: 400 });
    }

    // An edit reaches every copy by default, where a delete asks first.
    //
    // The asymmetry is deliberate. A delete is destructive and irreversible, so
    // guessing the set wrongly costs somebody their writing and the dialog is
    // worth the friction. An edit is corrective, and letting the copies diverge
    // is itself a bug with a visible consequence: the feed recognises copies BY
    // THEIR TEXT, so a note edited on one record stops matching its siblings and
    // comes back as three cards. `scope=one` is the escape hatch, not the
    // default.
    //
    // The set is resolved BEFORE the write, while the rows still share the old
    // content — afterwards there would be nothing left to match on.
    const scope = request.nextUrl.searchParams.get('scope');
    let ids = [noteId];
    if (scope !== 'one') {
      const { copies } = await findNoteCopies(db, noteId);
      ids = [noteId, ...copies.map(c => c.id)];
    }

    // One batch, so the set is never left half-edited. A partial write would
    // permanently break the copy set: the rows would no longer share text, and
    // no later edit could find them again.
    const result = await db.batch(
      ids.map(id => ({
        sql: 'UPDATE entity_notes SET content = ? WHERE id = ?',
        args: [content, id] as (string | number)[],
      })),
      'write',
    );
    if (result.length > 0 && result[0].rowsAffected === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    const updated = await db.execute({
      sql: 'SELECT * FROM entity_notes WHERE id = ?',
      args: [noteId],
    });
    return NextResponse.json({ ...updated.rows[0], updated: ids.length });
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
