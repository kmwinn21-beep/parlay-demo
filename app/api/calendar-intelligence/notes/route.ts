import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const conferenceId = Number(request.nextUrl.searchParams.get('conferenceId'));
  if (!conferenceId) return NextResponse.json({ error: 'conferenceId required' }, { status: 400 });

  const notesRes = await db.execute({
    sql: `SELECT cn.id, cn.conference_id, cn.author_user_id, cn.content, cn.decision_state, cn.parent_note_id, cn.created_at,
                 u.first_name, u.last_name, u.email, u.display_name,
                 ucd.decision AS current_decision
          FROM calendar_notes cn
          JOIN users u ON u.id = cn.author_user_id
          LEFT JOIN user_conference_decisions ucd
            ON ucd.user_id = cn.author_user_id AND ucd.conference_id = cn.conference_id
          WHERE cn.conference_id = ?
          ORDER BY cn.created_at ASC`,
    args: [conferenceId],
  });

  const allNotes = notesRes.rows as Row[];
  const topLevel: Row[] = [];
  const byParent = new Map<number, Row[]>();

  for (const note of allNotes) {
    if (note.parent_note_id == null) {
      topLevel.push(note);
    } else {
      const pid = Number(note.parent_note_id);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(note);
    }
  }

  const formatNote = (n: Row) => ({
    id: Number(n.id),
    conferenceId: Number(n.conference_id),
    authorUserId: Number(n.author_user_id),
    authorName: n.display_name ? String(n.display_name) : [n.first_name, n.last_name].filter(Boolean).join(' ') || String(n.email),
    authorEmail: String(n.email),
    content: String(n.content),
    decisionState: n.current_decision ? String(n.current_decision) : (n.decision_state ? String(n.decision_state) : null),
    parentNoteId: n.parent_note_id != null ? Number(n.parent_note_id) : null,
    createdAt: String(n.created_at ?? ''),
  });

  const notes = topLevel.map(n => ({
    ...formatNote(n),
    replies: (byParent.get(Number(n.id)) ?? []).map(formatNote),
  }));

  return NextResponse.json({ notes });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const body = await request.json() as { conferenceId: number; content: string; parentNoteId?: number };
  const { conferenceId, content, parentNoteId } = body;

  if (!conferenceId || !content?.trim()) {
    return NextResponse.json({ error: 'conferenceId and content are required' }, { status: 400 });
  }

  // Snapshot current user's decision state at time of posting
  const decisionRes = await db.execute({
    sql: `SELECT decision FROM user_conference_decisions WHERE user_id = ? AND conference_id = ?`,
    args: [authResult.id, conferenceId],
  }).catch(() => ({ rows: [] }));
  const decisionState = (decisionRes.rows[0] as Row | undefined)?.decision
    ? String((decisionRes.rows[0] as Row).decision)
    : null;

  const result = await db.execute({
    sql: `INSERT INTO calendar_notes (conference_id, author_user_id, content, decision_state, parent_note_id)
          VALUES (?, ?, ?, ?, ?)`,
    args: [conferenceId, authResult.id, content.trim(), decisionState, parentNoteId ?? null],
  });

  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}
