import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entity_type');
    const entityId = searchParams.get('entity_id');
    const noteIds = searchParams.get('note_ids');

    if (noteIds) {
      // Check which note IDs are pinned (used in conference details)
      const ids = noteIds.split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length === 0) return NextResponse.json([]);
      const result = await db.execute({
        sql: `SELECT DISTINCT note_id FROM pinned_notes WHERE note_id IN (${ids.map(() => '?').join(',')})`,
        args: ids,
      });
      return NextResponse.json(result.rows.map(r => Number(r.note_id)));
    }

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entity_type and entity_id are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `SELECT pn.id, pn.note_id, pn.entity_type, pn.entity_id, pn.pinned_by,
                   pn.conference_name, pn.attendee_name, pn.attendee_id, pn.created_at,
                   en.content, en.created_at AS note_created_at, en.rep, en.conference_name AS note_conference_name
            FROM pinned_notes pn
            JOIN entity_notes en ON pn.note_id = en.id
            WHERE pn.entity_type = ? AND pn.entity_id = ?
            ORDER BY pn.created_at DESC`,
      args: [entityType, entityId],
    });

    return NextResponse.json(
      result.rows.map((r) => ({
        id: Number(r.id),
        note_id: Number(r.note_id),
        entity_type: String(r.entity_type),
        entity_id: Number(r.entity_id),
        pinned_by: String(r.pinned_by),
        conference_name: r.conference_name != null ? String(r.conference_name) : null,
        attendee_name: r.attendee_name != null ? String(r.attendee_name) : null,
        attendee_id: r.attendee_id != null ? Number(r.attendee_id) : null,
        created_at: String(r.created_at),
        content: String(r.content),
        note_created_at: String(r.note_created_at),
        rep: r.rep != null ? String(r.rep) : null,
        note_conference_name: r.note_conference_name != null ? String(r.note_conference_name) : null,
      }))
    );
  } catch (error) {
    console.error('GET /api/pinned-notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch pinned notes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { note_id, entity_type, entity_id, pinned_by, conference_name, attendee_name, attendee_id } = await request.json();

    if (!note_id || !entity_type || !entity_id || !pinned_by) {
      return NextResponse.json({ error: 'note_id, entity_type, entity_id, and pinned_by are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `INSERT INTO pinned_notes (note_id, entity_type, entity_id, pinned_by, conference_name, attendee_name, attendee_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id, note_id, entity_type, entity_id, pinned_by, conference_name, attendee_name, attendee_id, created_at`,
      args: [note_id, entity_type, entity_id, pinned_by, conference_name || null, attendee_name || null, attendee_id || null],
    });

    const row = result.rows[0];
    return NextResponse.json({
      id: Number(row.id),
      note_id: Number(row.note_id),
      entity_type: String(row.entity_type),
      entity_id: Number(row.entity_id),
      pinned_by: String(row.pinned_by),
      conference_name: row.conference_name != null ? String(row.conference_name) : null,
      attendee_name: row.attendee_name != null ? String(row.attendee_name) : null,
      attendee_id: row.attendee_id != null ? Number(row.attendee_id) : null,
      created_at: String(row.created_at),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/pinned-notes error:', error);
    return NextResponse.json({ error: 'Failed to pin note' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await db.execute({ sql: 'DELETE FROM pinned_notes WHERE id = ?', args: [id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/pinned-notes error:', error);
    return NextResponse.json({ error: 'Failed to unpin note' }, { status: 500 });
  }
}
