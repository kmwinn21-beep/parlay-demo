import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials, resolveUserDisplayName } from '@/lib/initials';

// GET/POST /api/conferences/[id]/outreach/[companyId]/notes — a per-company
// outreach notes thread. Modeled on app/api/calendar-intelligence/notes/route.ts
// (join users for author display name, plain insert) minus the reply-threading
// and decision-state snapshotting that feature doesn't need here.

export async function GET(request: NextRequest, { params }: { params: { id: string; companyId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(params.companyId);
  if (!conferenceId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const rows = await db.execute({
      sql: `SELECT n.id, n.body, n.created_at, u.display_name, u.first_name, u.last_name, u.email
            FROM outreach_notes n
            JOIN users u ON u.id = n.user_id
            WHERE n.conference_id = ? AND n.company_id = ?
            ORDER BY n.created_at ASC`,
      args: [conferenceId, companyId],
    });

    const notes = rows.rows.map(r => {
      const userName = resolveUserDisplayName(r);
      return {
        id: Number(r.id),
        body: String(r.body),
        userName,
        userInitials: getInitials(userName),
        createdAt: String(r.created_at),
      };
    });

    return NextResponse.json({ notes });
  } catch (error) {
    console.error('GET /api/conferences/[id]/outreach/[companyId]/notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string; companyId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(params.companyId);
  if (!conferenceId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json();
    const { body: content } = body as { body: string };
    if (!content?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 });

    const [insertRes, userRow] = await Promise.all([
      db.execute({
        sql: `INSERT INTO outreach_notes (conference_id, company_id, user_id, body)
              VALUES (?, ?, ?, ?) RETURNING id, created_at`,
        args: [conferenceId, companyId, authResult.id, content.trim()],
      }),
      db.execute({ sql: `SELECT display_name, first_name, last_name, email FROM users WHERE id = ?`, args: [authResult.id] }),
    ]);

    const userName = userRow.rows.length > 0 ? resolveUserDisplayName(userRow.rows[0]) : authResult.email;

    return NextResponse.json({
      id: Number(insertRes.rows[0].id),
      body: content.trim(),
      userName,
      userInitials: getInitials(userName),
      createdAt: String(insertRes.rows[0].created_at),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences/[id]/outreach/[companyId]/notes error:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}
