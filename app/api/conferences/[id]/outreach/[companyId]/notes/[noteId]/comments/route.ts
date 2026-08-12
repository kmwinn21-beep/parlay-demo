import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials, resolveUserDisplayName } from '@/lib/initials';
import { getConfigIdByEmail, notifyMentionedUsers } from '@/lib/notifications';

// GET/POST /api/conferences/[id]/outreach/[companyId]/notes/[noteId]/comments
// — a comment thread for one outreach note. Modeled on
// app/api/notes/[id]/comments/route.ts minus reactions/lets_talk, which are
// entity_notes-only concepts that don't apply to outreach notes.

export async function GET(request: NextRequest, { params }: { params: { id: string; companyId: string; noteId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const noteId = Number(params.noteId);
  if (!noteId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const rows = await db.execute({
      sql: `SELECT c.id, c.body, c.created_at, c.user_id,
                   u.display_name, u.first_name, u.last_name, u.email
            FROM outreach_note_comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.note_id = ?
            ORDER BY c.created_at ASC`,
      args: [noteId],
    });

    const comments = rows.rows.map(r => {
      const userName = resolveUserDisplayName(r);
      return {
        id: Number(r.id),
        body: String(r.body),
        userName,
        userInitials: getInitials(userName),
        createdAt: String(r.created_at),
        userId: Number(r.user_id),
        isMine: Number(r.user_id) === authResult.id,
      };
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('GET /api/conferences/[id]/outreach/[companyId]/notes/[noteId]/comments error:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string; companyId: string; noteId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const noteId = Number(params.noteId);
  const companyId = Number(params.companyId);
  if (!noteId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const { body: content, taggedUsers } = await request.json() as { body?: string; taggedUsers?: string | null };
    if (!content?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 });

    const [insertRes, userRow, companyRow] = await Promise.all([
      db.execute({
        sql: `INSERT INTO outreach_note_comments (note_id, user_id, body, tagged_users)
              VALUES (?, ?, ?, ?) RETURNING id, created_at`,
        args: [noteId, authResult.id, content.trim(), taggedUsers || null],
      }),
      db.execute({ sql: `SELECT display_name, first_name, last_name, email FROM users WHERE id = ?`, args: [authResult.id] }),
      db.execute({ sql: `SELECT name FROM companies WHERE id = ?`, args: [companyId] }),
    ]);

    const userName = userRow.rows.length > 0 ? resolveUserDisplayName(userRow.rows[0]) : authResult.email;
    const companyName = companyRow.rows.length > 0 ? String(companyRow.rows[0].name) : `Company #${companyId}`;

    const taggedConfigIds = String(taggedUsers || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);
    if (taggedConfigIds.length > 0) {
      const changedByConfigId = await getConfigIdByEmail(authResult.email, db);
      notifyMentionedUsers({
        taggedConfigIds,
        mentionerName: userName,
        mentionerEmail: authResult.email,
        mentionerConfigId: changedByConfigId,
        entityName: companyName,
        entityType: 'company',
        entityId: companyId,
      });
    }

    return NextResponse.json({
      id: Number(insertRes.rows[0].id),
      body: content.trim(),
      userName,
      userInitials: getInitials(userName),
      createdAt: String(insertRes.rows[0].created_at),
      userId: authResult.id,
      isMine: true,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences/[id]/outreach/[companyId]/notes/[noteId]/comments error:', error);
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
  }
}
