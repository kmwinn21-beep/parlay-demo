import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, resolveUserIds, notifyNoteLetsTalk } from '@/lib/notifications';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const noteId = Number(params.id);

    const noteRes = await db.execute({
      sql: 'SELECT author_user_id, lets_talk, entity_type, entity_id, tagged_users FROM entity_notes WHERE id = ?',
      args: [noteId],
    });
    if (!noteRes.rows.length) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    const note = noteRes.rows[0];

    if (Number(note.lets_talk)) {
      return NextResponse.json({ error: 'Let\'s Talk already triggered' }, { status: 409 });
    }

    // Set lets_talk = 1
    await db.execute({ sql: 'UPDATE entity_notes SET lets_talk = 1 WHERE id = ?', args: [noteId] });

    // Resolve recipients: tagged users + previous commenters
    const taggedUserIds = await resolveUserIds(
      note.tagged_users != null ? String(note.tagged_users) : null,
      null,
    );
    const commenterRes = await db.execute({
      sql: 'SELECT DISTINCT user_id FROM note_comments WHERE note_id = ?',
      args: [noteId],
    });
    const commenterUserIds = commenterRes.rows.map(r => Number(r.user_id));
    const recipientSet = new Set([...taggedUserIds, ...commenterUserIds]);
    // Also include note author
    if (note.author_user_id != null) recipientSet.add(Number(note.author_user_id));
    const recipientUserIds = Array.from(recipientSet);

    // Resolve entity name
    let recordName = `Note #${noteId}`;
    try {
      const entityType = String(note.entity_type);
      const entityId = Number(note.entity_id);
      if (entityType === 'company') {
        const r = await db.execute({ sql: 'SELECT name FROM companies WHERE id = ?', args: [entityId] });
        if (r.rows.length) recordName = String(r.rows[0].name);
      } else if (entityType === 'attendee') {
        const r = await db.execute({ sql: 'SELECT first_name, last_name FROM attendees WHERE id = ?', args: [entityId] });
        if (r.rows.length) recordName = `${r.rows[0].first_name} ${r.rows[0].last_name}`.trim();
      } else if (entityType === 'conference') {
        const r = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [entityId] });
        if (r.rows.length) recordName = String(r.rows[0].name);
      }
    } catch { /* non-fatal */ }

    const nameRow = await db.execute({ sql: 'SELECT COALESCE(display_name, email) AS name FROM users WHERE id = ?', args: [user.id] });
    const triggerName = nameRow.rows.length ? String(nameRow.rows[0].name) : user.email;
    const triggerConfigId = await getConfigIdByEmail(user.email);

    notifyNoteLetsTalk({
      noteId,
      triggerUserId: user.id,
      triggerName,
      triggerEmail: user.email,
      triggerConfigId,
      recipientUserIds,
      recordName,
      entityType: String(note.entity_type),
      entityId: Number(note.entity_id),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/notes/[id]/lets-talk error:', err);
    return NextResponse.json({ error: 'Failed to trigger Let\'s Talk' }, { status: 500 });
  }
}
