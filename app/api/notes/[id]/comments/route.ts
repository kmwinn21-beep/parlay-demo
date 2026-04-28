import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, notifyNoteComment } from '@/lib/notifications';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const noteId = Number(params.id);

    const [noteRes, commentsRes, noteReactionsRes] = await Promise.all([
      db.execute({
        sql: 'SELECT author_user_id, lets_talk, entity_type, entity_id FROM entity_notes WHERE id = ?',
        args: [noteId],
      }),
      db.execute({
        sql: `SELECT nc.id, nc.content, nc.created_at, nc.user_id, nc.tagged_users,
                     COALESCE(u.display_name, u.email) AS commenter_name
              FROM note_comments nc
              JOIN users u ON nc.user_id = u.id
              WHERE nc.note_id = ?
              ORDER BY nc.created_at ASC`,
        args: [noteId],
      }),
      db.execute({
        sql: 'SELECT user_id, reaction_type FROM note_reactions WHERE note_id = ?',
        args: [noteId],
      }),
    ]);

    if (!noteRes.rows.length) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

    // Aggregate note reactions
    let noteLikes = 0, noteDislikes = 0, myNoteReaction: string | null = null;
    for (const r of noteReactionsRes.rows) {
      if (r.reaction_type === 'like') noteLikes++;
      else noteDislikes++;
      if (Number(r.user_id) === user.id) myNoteReaction = String(r.reaction_type);
    }

    // Get comment reactions in one query if there are comments
    const commentIds = commentsRes.rows.map(r => Number(r.id));
    let commentReactionsMap = new Map<number, { likes: number; dislikes: number; myReaction: string | null }>();

    if (commentIds.length > 0) {
      const ph = commentIds.map(() => '?').join(',');
      const crRows = await db.execute({
        sql: `SELECT comment_id, user_id, reaction_type FROM comment_reactions WHERE comment_id IN (${ph})`,
        args: commentIds,
      });
      for (const cid of commentIds) {
        commentReactionsMap.set(cid, { likes: 0, dislikes: 0, myReaction: null });
      }
      for (const r of crRows.rows) {
        const cid = Number(r.comment_id);
        const entry = commentReactionsMap.get(cid);
        if (!entry) continue;
        if (r.reaction_type === 'like') entry.likes++;
        else entry.dislikes++;
        if (Number(r.user_id) === user.id) entry.myReaction = String(r.reaction_type);
      }
    }

    const comments = commentsRes.rows.map(r => ({
      id: Number(r.id),
      content: String(r.content),
      created_at: String(r.created_at),
      user_id: Number(r.user_id),
      commenter_name: String(r.commenter_name),
      tagged_users: r.tagged_users ? String(r.tagged_users) : null,
      is_mine: Number(r.user_id) === user.id,
      reactions: commentReactionsMap.get(Number(r.id)) ?? { likes: 0, dislikes: 0, myReaction: null },
    }));

    return NextResponse.json({
      comments,
      note_reactions: { likes: noteLikes, dislikes: noteDislikes, my_reaction: myNoteReaction },
      lets_talk: Boolean(noteRes.rows[0].lets_talk),
    });
  } catch (err) {
    console.error('GET /api/notes/[id]/comments error:', err);
    return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 });
  }
}

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
    const { content, tagged_users } = await request.json() as { content?: string; tagged_users?: string };

    if (!content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 });

    const noteRes = await db.execute({
      sql: 'SELECT author_user_id, lets_talk, entity_type, entity_id FROM entity_notes WHERE id = ?',
      args: [noteId],
    });
    if (!noteRes.rows.length) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

    const note = noteRes.rows[0];
    if (Number(note.lets_talk)) {
      return NextResponse.json({ error: 'Commenting has been closed — Let\'s Talk was triggered.' }, { status: 403 });
    }

    // Insert comment
    const insertRes = await db.execute({
      sql: `INSERT INTO note_comments (note_id, user_id, content, tagged_users)
            VALUES (?, ?, ?, ?)
            RETURNING id, content, created_at, user_id, tagged_users`,
      args: [noteId, user.id, content.trim(), tagged_users || null],
    });
    const row = insertRes.rows[0];

    // Get commenter display name
    const nameRow = await db.execute({
      sql: 'SELECT COALESCE(display_name, email) AS name FROM users WHERE id = ?',
      args: [user.id],
    });
    const commenterName = nameRow.rows.length ? String(nameRow.rows[0].name) : user.email;

    // Get previous commenters (for thread notification)
    const prevCommentersRes = await db.execute({
      sql: 'SELECT DISTINCT user_id FROM note_comments WHERE note_id = ? AND id != ?',
      args: [noteId, Number(row.id)],
    });
    const previousCommenterUserIds = prevCommentersRes.rows.map(r => Number(r.user_id));

    // Resolve entity name for notifications
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

    const commenterConfigId = await getConfigIdByEmail(user.email);
    notifyNoteComment({
      noteId,
      noteAuthorUserId: note.author_user_id != null ? Number(note.author_user_id) : null,
      commenterUserId: user.id,
      commenterName,
      commenterEmail: user.email,
      commenterConfigId,
      previousCommenterUserIds,
      recordName,
      entityType: String(note.entity_type),
      entityId: Number(note.entity_id),
    });

    return NextResponse.json({
      id: Number(row.id),
      content: String(row.content),
      created_at: String(row.created_at),
      user_id: Number(row.user_id),
      commenter_name: commenterName,
      tagged_users: row.tagged_users ? String(row.tagged_users) : null,
      is_mine: true,
      reactions: { likes: 0, dislikes: 0, myReaction: null },
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/notes/[id]/comments error:', err);
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
  }
}
