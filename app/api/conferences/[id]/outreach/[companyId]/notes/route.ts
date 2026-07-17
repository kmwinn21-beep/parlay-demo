import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials, resolveUserDisplayName } from '@/lib/initials';

// GET/POST /api/conferences/[id]/outreach/[companyId]/notes — a per-company
// outreach notes thread. Modeled on app/api/calendar-intelligence/notes/route.ts
// (join users for author display name, plain insert) minus the reply-threading
// and decision-state snapshotting that feature doesn't need here. A note can
// optionally be tagged with the activity (type + attendee) it's about, so the
// thread can prefix it with that activity's colored dot + label.

export async function GET(request: NextRequest, { params }: { params: { id: string; companyId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(params.companyId);
  if (!conferenceId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const rows = await db.execute({
      sql: `SELECT n.id, n.body, n.created_at, n.activity_type, n.attendee_id,
                   u.display_name, u.first_name, u.last_name, u.email,
                   a.first_name as attendee_first_name, a.last_name as attendee_last_name
            FROM outreach_notes n
            JOIN users u ON u.id = n.user_id
            LEFT JOIN attendees a ON a.id = n.attendee_id
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
        activityType: r.activity_type ? String(r.activity_type) : null,
        attendeeId: r.attendee_id != null ? Number(r.attendee_id) : null,
        attendeeName: r.attendee_first_name ? `${r.attendee_first_name} ${r.attendee_last_name}` : null,
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
    const { body: content, activityType, attendeeId } = body as { body: string; activityType?: string; attendeeId?: number };
    if (!content?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 });

    const [insertRes, userRow, attendeeRow] = await Promise.all([
      db.execute({
        sql: `INSERT INTO outreach_notes (conference_id, company_id, user_id, body, activity_type, attendee_id)
              VALUES (?, ?, ?, ?, ?, ?) RETURNING id, created_at`,
        args: [conferenceId, companyId, authResult.id, content.trim(), activityType || null, attendeeId ?? null],
      }),
      db.execute({ sql: `SELECT display_name, first_name, last_name, email FROM users WHERE id = ?`, args: [authResult.id] }),
      attendeeId
        ? db.execute({ sql: `SELECT first_name, last_name FROM attendees WHERE id = ?`, args: [attendeeId] })
        : Promise.resolve({ rows: [] as { first_name?: unknown; last_name?: unknown }[] }),
    ]);

    const userName = userRow.rows.length > 0 ? resolveUserDisplayName(userRow.rows[0]) : authResult.email;
    const attendeeName = attendeeRow.rows.length > 0 ? `${attendeeRow.rows[0].first_name} ${attendeeRow.rows[0].last_name}` : null;

    return NextResponse.json({
      id: Number(insertRes.rows[0].id),
      body: content.trim(),
      userName,
      userInitials: getInitials(userName),
      createdAt: String(insertRes.rows[0].created_at),
      activityType: activityType || null,
      attendeeId: attendeeId ?? null,
      attendeeName,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences/[id]/outreach/[companyId]/notes error:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}
