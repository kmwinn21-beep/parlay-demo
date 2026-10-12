import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { groupText, groupsFrom, ownGroups, reassembles, segmentsFrom, validAssignment } from '@/lib/noteSplit';

export const dynamic = 'force-dynamic';

/**
 * Cut one floor note into the several it is made of.
 *
 * Takes POSITIONS and a grouping, never text. The caller says where the cuts
 * go and which note each resulting piece belongs to; the server reads the note
 * out of the database and slices it. So a client — or, later, a model placing
 * the cuts — cannot reword a sentence, drop one, or add one that was never
 * written: the worst it can do is cut or group wrongly, which is visible and
 * undoable.
 *
 * Two checks before anything is written, and between them they are the whole
 * guarantee. The pieces must tile the original character for character, and
 * every piece must carry exactly one note number. The first is redundant for
 * cuts this codebase produces, since slicing at sorted offsets partitions the
 * string by construction; it is here for the source that is not written yet,
 * and it is cheap.
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
    const body = await request.json() as { breaks?: unknown; assign?: unknown };
    const breaks = Array.isArray(body.breaks) ? body.breaks.map(Number).filter(Number.isInteger) : [];
    const sentAssign = Array.isArray(body.assign) ? body.assign.map(Number) : null;

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
     * Which piece goes to which note. Absent means the old shape — every piece
     * its own note — which is what the splitter proposes before anybody joins
     * anything.
     */
    const assign = sentAssign ?? ownGroups(segments.length);
    if (!validAssignment(segments, assign)) {
      return NextResponse.json(
        { error: 'That grouping does not account for every piece exactly once. Nothing was changed.' },
        { status: 400 },
      );
    }

    /*
     * Groups with nothing in them once trimmed are dropped by groupsFrom — a
     * blank run between two leads is kept by the slicing so the note can be
     * rebuilt, and is no use as a note of its own.
     */
    const keep = groupsFrom(segments, assign);
    if (keep.length === 0) {
      return NextResponse.json({ error: 'Every piece was dropped.' }, { status: 400 });
    }

    /*
     * One batch, so a split either happens or does not. Half a split — some
     * pieces written, the original still sitting in the queue — would be
     * read as the note having been duplicated.
     */
    const written = await db.batch([
      ...keep.map(group => ({
        sql: `INSERT INTO quick_notes (content, created_by, tag, secondary_tag, conference_id)
              VALUES (?, ?, ?, ?, ?)
              RETURNING id`,
        args: [
          groupText(group),
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
