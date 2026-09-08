/**
 * The other records this note was also written against.
 *
 * Asked before a delete, so the dialog can say what deleting will reach rather
 * than offering an abstract choice. Returns an empty list — not an error — for
 * a note with no copies, which is the common case and means the caller shows
 * the plain confirmation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { findNoteCopies } from '@/lib/notes/copies';

export async function GET(
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
    const { found, copies } = await findNoteCopies(db, noteId);
    if (!found) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    return NextResponse.json({ copies });
  } catch (error) {
    console.error('GET /api/notes/[id]/copies error:', error);
    // A failure here must not block a delete. An empty list degrades to the
    // single-note confirmation, which is the behaviour that existed before.
    return NextResponse.json({ copies: [] });
  }
}
