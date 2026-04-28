import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, notifyNoteReaction } from '@/lib/notifications';

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
    const { reaction_type } = await request.json() as { reaction_type: 'like' | 'dislike' };

    if (reaction_type !== 'like' && reaction_type !== 'dislike') {
      return NextResponse.json({ error: 'reaction_type must be like or dislike' }, { status: 400 });
    }

    const noteRes = await db.execute({
      sql: 'SELECT author_user_id, entity_type, entity_id FROM entity_notes WHERE id = ?',
      args: [noteId],
    });
    if (!noteRes.rows.length) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    const note = noteRes.rows[0];

    const existing = await db.execute({
      sql: 'SELECT id, reaction_type FROM note_reactions WHERE note_id = ? AND user_id = ?',
      args: [noteId, user.id],
    });

    let newReaction: string | null = reaction_type;
    if (existing.rows.length) {
      if (String(existing.rows[0].reaction_type) === reaction_type) {
        await db.execute({ sql: 'DELETE FROM note_reactions WHERE id = ?', args: [existing.rows[0].id] });
        newReaction = null;
      } else {
        await db.execute({
          sql: 'UPDATE note_reactions SET reaction_type = ? WHERE id = ?',
          args: [reaction_type, existing.rows[0].id],
        });
      }
    } else {
      await db.execute({
        sql: 'INSERT INTO note_reactions (note_id, user_id, reaction_type) VALUES (?, ?, ?)',
        args: [noteId, user.id, reaction_type],
      });
    }

    const countsRes = await db.execute({
      sql: 'SELECT reaction_type, COUNT(*) AS cnt FROM note_reactions WHERE note_id = ? GROUP BY reaction_type',
      args: [noteId],
    });
    let likes = 0, dislikes = 0;
    for (const r of countsRes.rows) {
      if (r.reaction_type === 'like') likes = Number(r.cnt);
      else dislikes = Number(r.cnt);
    }

    // Notify note author (best-effort, opt-in)
    if (newReaction && note.author_user_id != null && Number(note.author_user_id) !== user.id) {
      try {
        let recordName = `Note #${noteId}`;
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
        const nameRow = await db.execute({ sql: 'SELECT COALESCE(display_name, email) AS name FROM users WHERE id = ?', args: [user.id] });
        const reactorName = nameRow.rows.length ? String(nameRow.rows[0].name) : user.email;
        const reactorConfigId = await getConfigIdByEmail(user.email);
        notifyNoteReaction({
          noteId,
          noteAuthorUserId: Number(note.author_user_id),
          reactorUserId: user.id,
          reactorName,
          reactorEmail: user.email,
          reactorConfigId,
          reactionType: reaction_type,
          recordName,
          entityType,
          entityId,
        });
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ likes, dislikes, my_reaction: newReaction });
  } catch (err) {
    console.error('POST /api/notes/[id]/reactions error:', err);
    return NextResponse.json({ error: 'Failed to react' }, { status: 500 });
  }
}
