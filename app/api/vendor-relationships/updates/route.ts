import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

/**
 * Adding to a relationship's thread, and saying whether it still holds.
 *
 * A relationship goes out of date quietly — nobody deletes it, because the
 * history is the point. This is the only way to say "I looked at this": every
 * entry either confirms the relationship as of today or flags that it may have
 * moved on. The entry itself is never edited or removed, so the thread stays a
 * record of what was believed when.
 *
 * Kept apart from the relationship's own PUT deliberately. PUT is a correction
 * — the rep was wrong, fix the row. This is an observation, which is a
 * different thing even when it changes the same status column, and collapsing
 * the two would lose the distinction that makes the thread worth reading.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const { relationship_id, body: text, status_after, mark_stale } = await request.json();

    const relId = Number(relationship_id);
    if (!relId) return NextResponse.json({ error: 'relationship_id is required' }, { status: 400 });

    const comment = String(text ?? '').trim();
    if (!comment) return NextResponse.json({ error: 'An update needs a note.' }, { status: 400 });

    // The status before this entry, read from the row rather than taken from
    // the client. Two people updating the same card a minute apart would
    // otherwise both record the status they loaded, and the older of the two
    // would claim a transition that never happened.
    const current = await db.execute({
      sql: 'SELECT relationship_status FROM vendor_relationships WHERE id = ?',
      args: [relId],
    });
    if (current.rows.length === 0) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }
    const before = current.rows[0].relationship_status ? String(current.rows[0].relationship_status) : null;

    const after = Array.isArray(status_after)
      ? status_after.map(v => String(v).trim()).filter(Boolean).join(',')
      : null;
    // An empty array is somebody clearing the field, which the form does not
    // allow — a relationship with no status is what the create form already
    // refuses. Treated as "no change" rather than as a wipe.
    const changed = after !== null && after !== '' && after !== before;
    const stale = mark_stale === true;

    const inserted = await db.execute({
      sql: `INSERT INTO relationship_updates
              (relationship_id, body, status_before, status_after, marked_stale, author_user_id)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id, created_at`,
      // authResult.id, not anything out of the body: the thread's value is
      // that each entry is attributable, and an author the client can name is
      // not attribution.
      args: [relId, comment, before, changed ? after : null, stale ? 1 : 0, authResult.id],
    });

    // What the entry does to the relationship itself.
    //
    // status_as_of moves only when somebody confirms the relationship — that
    // is the whole point of keeping it apart from updated_at, which this write
    // does bump. Marking stale leaves it alone: the reason to flag a card is
    // that you do NOT know it is current, and stamping today's date on it
    // would say the opposite.
    if (stale) {
      await db.execute({
        sql: `UPDATE vendor_relationships
              SET stale = 1, relationship_status = COALESCE(?, relationship_status),
                  updated_at = datetime('now')
              WHERE id = ?`,
        args: [changed ? after : null, relId],
      });
    } else {
      await db.execute({
        sql: `UPDATE vendor_relationships
              SET stale = 0, status_as_of = datetime('now'),
                  relationship_status = COALESCE(?, relationship_status),
                  updated_at = datetime('now')
              WHERE id = ?`,
        args: [changed ? after : null, relId],
      });
    }

    // The written entry goes back to the caller so the card can show it
    // without reloading. Most surfaces that render the card — the
    // pre-conference views, the relationship map — load their data once at the
    // top of the page and have no way to refetch one relationship, and an
    // update that appears to do nothing is worse than no button at all.
    const me = await db.execute({
      sql: `SELECT COALESCE(NULLIF(display_name, ''), email) AS author_name FROM users WHERE id = ?`,
      args: [authResult.id],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    return NextResponse.json({
      success: true,
      update: {
        id: Number(inserted.rows[0]?.id ?? 0),
        body: comment,
        status_before: before ? before.split(',').map(v => v.trim()).filter(Boolean) : [],
        status_after: changed && after ? after.split(',').map(v => v.trim()).filter(Boolean) : [],
        marked_stale: stale,
        author_name: me.rows[0]?.author_name ? String(me.rows[0].author_name) : authResult.email,
        created_at: String(inserted.rows[0]?.created_at ?? ''),
      },
      stale,
      // Empty when flagged: the row's confirmation date deliberately did not
      // move, and the card must not show today's date for it.
      status_as_of: stale ? '' : new Date().toISOString().replace('T', ' ').slice(0, 19),
      relationship_status: changed && after
        ? after.split(',').map(v => v.trim()).filter(Boolean)
        : null,
    });
  } catch (error) {
    console.error('POST /api/vendor-relationships/updates error:', error);
    return NextResponse.json({ error: 'Failed to save update' }, { status: 500 });
  }
}
