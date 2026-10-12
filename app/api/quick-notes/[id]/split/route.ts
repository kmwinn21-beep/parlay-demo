import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { reassembles, segmentsFrom } from '@/lib/noteSplit';

export const dynamic = 'force-dynamic';

/**
 * Cut one floor note into the several it is made of.
 *
 * Takes POSITIONS, never text. The caller says where the cuts go and which of
 * the resulting pieces to throw away; the server reads the note out of the
 * database and slices it. So a client — or, later, a model placing the cuts —
 * cannot reword a sentence, drop one, or add one that was never written: the
 * worst it can do is cut in the wrong place, which is visible and undoable.
 *
 * The pieces are checked against the original before anything is written. That
 * check is redundant for cuts this codebase produces, because slicing at
 * sorted offsets partitions the string by construction. It is here for the
 * source that is not written yet, and it is cheap.
 *
 * The parent is deleted and its pieces take its place, in one batch. The note
 * is not duplicated into a parent and eleven children, and the queue does not
 * grow a copy of something already in it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  const { id } = await params;

  try {
    const body = await request.json() as { breaks?: unknown; drop?: unknown };
    const breaks = Array.isArray(body.breaks) ? body.breaks.map(Number).filter(Number.isInteger) : [];
    const drop = new Set(Array.isArray(body.drop) ? body.drop.map(Number).filter(Number.isInteger) : []);

    /*
     * Scoped to the caller's own notes, like every other quick-note route: a
     * floor note is private until it is assigned, so the id in the path is
     * never enough on its own.
     */
    const existing = await db.execute({
      sql: `SELECT id, content, tag, secondary_tag, conference_id
            FROM quick_notes WHERE id = ? AND created_by = ?`,
      args: [id, user.email],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    const note = existing.rows[0];
    const content = String(note.content ?? '');

    const segments = segmentsFrom(content, breaks);
    if (segments.length < 2) {
      return NextResponse.json({ error: 'That is one note, not several.' }, { status: 400 });
    }
    if (!reassembles(content, segments)) {
      return NextResponse.json(
        { error: 'Those cuts do not rebuild the note. Nothing was changed.' },
        { status: 400 },
      );
    }

    /*
     * Empty once trimmed is a piece with nothing in it — the blank run between
     * two leads, kept by the slicing so the note could be rebuilt, and of no
     * use as a note of its own.
     */
    const keep = segments
      .map((s, i) => ({ ...s, i }))
      .filter(s => !drop.has(s.i) && s.text.trim().length > 0);

    if (keep.length === 0) {
      return NextResponse.json({ error: 'Every piece was dropped.' }, { status: 400 });
    }

    /*
     * One batch, so a split either happens or does not. Half a split — some
     * pieces written, the original still sitting in the queue — would be
     * read as the note having been duplicated.
     */
    const written = await db.batch([
      ...keep.map(s => ({
        sql: `INSERT INTO quick_notes (content, created_by, tag, secondary_tag, conference_id)
              VALUES (?, ?, ?, ?, ?)
              RETURNING id`,
        args: [
          s.text.trim(),
          user.email ?? null,
          note.tag != null ? String(note.tag) : null,
          note.secondary_tag != null ? String(note.secondary_tag) : null,
          note.conference_id != null ? Number(note.conference_id) : null,
        ],
      })),
      { sql: 'DELETE FROM quick_notes WHERE id = ? AND created_by = ?', args: [id, user.email] },
    ], 'write');

    /*
     * The ids the inserts themselves returned.
     *
     * Not "the rows after the parent's id": the caller may have saved another
     * note while this one was open, and that note would land in the range and
     * come back as a piece of a split it had nothing to do with.
     */
    const newIds = written
      .slice(0, keep.length)
      .map(r => Number(r.rows?.[0]?.id))
      .filter(n => Number.isFinite(n));

    const created = newIds.length === 0 ? { rows: [] as Record<string, unknown>[] } : await db.execute({
      sql: `SELECT qn.id, qn.content, qn.created_at, qn.created_by, qn.tag, qn.secondary_tag,
                   qn.product_suggestions, qn.conference_id, c.name as conference_name
            FROM quick_notes qn
            LEFT JOIN conferences c ON c.id = qn.conference_id
            WHERE qn.id IN (${newIds.map(() => '?').join(',')})
            ORDER BY qn.id ASC`,
      args: newIds,
    });

    return NextResponse.json({
      notes: created.rows.map(r => ({
        id: Number(r.id),
        content: String(r.content),
        created_at: String(r.created_at),
        created_by: r.created_by ? String(r.created_by) : null,
        tag: r.tag ? String(r.tag) : null,
        secondary_tag: r.secondary_tag ? String(r.secondary_tag) : null,
        product_suggestions: r.product_suggestions ? String(r.product_suggestions) : null,
        conference_id: r.conference_id != null ? Number(r.conference_id) : null,
        conference_name: r.conference_name ? String(r.conference_name) : null,
      })),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/quick-notes/[id]/split error:', error);
    return NextResponse.json({ error: 'Failed to split note' }, { status: 500 });
  }
}
