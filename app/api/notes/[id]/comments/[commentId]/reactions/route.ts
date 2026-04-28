import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, notifyCommentReaction } from '@/lib/notifications';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;
    const noteId = Number(params.id);
    const commentId = Number(params.commentId);
    const { reaction_type } = await request.json() as { reaction_type: 'like' | 'dislike' };

    if (reaction_type !== 'like' && reaction_type !== 'dislike') {
      return NextResponse.json({ error: 'reaction_type must be like or dislike' }, { status: 400 });
    }

    const commentRes = await db.execute({
      sql: `SELECT nc.user_id, en.entity_type, en.entity_id
            FROM note_comments nc
            JOIN entity_notes en ON en.id = nc.note_id
            WHERE nc.id = ?`,
      args: [commentId],
    });
    if (!commentRes.rows.length) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    const comment = commentRes.rows[0];

    // Check existing reaction
    const existing = await db.execute({
      sql: 'SELECT id, reaction_type FROM comment_reactions WHERE comment_id = ? AND user_id = ?',
      args: [commentId, user.id],
    });

    let newReaction: string | null = reaction_type;
    if (existing.rows.length) {
      if (String(existing.rows[0].reaction_type) === reaction_type) {
        // Same type → toggle off
        await db.execute({ sql: 'DELETE FROM comment_reactions WHERE id = ?', args: [existing.rows[0].id] });
        newReaction = null;
      } else {
        // Different type → replace
        await db.execute({
          sql: 'UPDATE comment_reactions SET reaction_type = ? WHERE id = ?',
          args: [reaction_type, existing.rows[0].id],
        });
      }
    } else {
      await db.execute({
        sql: 'INSERT INTO comment_reactions (comment_id, user_id, reaction_type) VALUES (?, ?, ?)',
        args: [commentId, user.id, reaction_type],
      });
    }

    // Return updated counts
    const countsRes = await db.execute({
      sql: `SELECT reaction_type, COUNT(*) AS cnt FROM comment_reactions WHERE comment_id = ? GROUP BY reaction_type`,
      args: [commentId],
    });
    let likes = 0, dislikes = 0;
    for (const r of countsRes.rows) {
      if (r.reaction_type === 'like') likes = Number(r.cnt);
      else dislikes = Number(r.cnt);
    }

    // Notify comment author (best-effort, opt-in)
    if (newReaction && Number(comment.user_id) !== user.id) {
      try {
        let recordName = `Note #${noteId}`;
        const entityType = String(comment.entity_type);
        const entityId = Number(comment.entity_id);
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
        notifyCommentReaction({
          commentAuthorUserId: Number(comment.user_id),
          reactorUserId: user.id,
          reactorName,
          reactorEmail: user.email,
          reactorConfigId,
          reactionType: reaction_type,
          recordName,
          entityType,
          entityId,
          noteId,
        });
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ likes, dislikes, my_reaction: newReaction });
  } catch (err) {
    console.error('POST comment reactions error:', err);
    return NextResponse.json({ error: 'Failed to react' }, { status: 500 });
  }
}
