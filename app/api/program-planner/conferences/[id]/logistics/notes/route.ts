import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials, resolveUserDisplayName } from '@/lib/initials';
import { getConfigIdByEmail, notifyMentionedUsers } from '@/lib/notifications';

const VALID_SECTIONS = new Set([
  'deadlines', 'registration', 'booth', 'sponsorship', 'speaking',
  'travel', 'hosted', 'shipping', 'postshow', 'files',
]);

// POST /api/program-planner/conferences/[id]/logistics/notes?year= — adds one
// threaded note to a specific Plan Logistics drawer section (see
// components/logistics's per-tab PlanSectionNotes). Reads happen through the
// parent GET /logistics route's own `notes` array (one query covers every
// section plus the new All Notes tab), so this route is POST-only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const { id } = await params;
  const conferenceId = Number(id);
  if (!conferenceId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const url = new URL(request.url);
  const planYear = parseInt(url.searchParams.get('year') ?? '', 10);
  if (isNaN(planYear)) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  try {
    const body = await request.json();
    const { section, body: content, taggedUsers } = body as { section?: string; body?: string; taggedUsers?: string | null };

    if (!section || !VALID_SECTIONS.has(section)) {
      return NextResponse.json({ error: 'section must be one of: ' + Array.from(VALID_SECTIONS).join(', ') }, { status: 400 });
    }
    if (!content?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 });

    const [insertRes, userRow, confRow] = await Promise.all([
      db.execute({
        sql: `INSERT INTO conference_plan_notes (conference_id, plan_year, section, user_id, body, tagged_users)
              VALUES (?, ?, ?, ?, ?, ?) RETURNING id, created_at`,
        args: [conferenceId, planYear, section, authResult.id, content.trim(), taggedUsers || null],
      }),
      db.execute({ sql: `SELECT display_name, first_name, last_name, email FROM users WHERE id = ?`, args: [authResult.id] }),
      db.execute({ sql: `SELECT name FROM conferences WHERE id = ?`, args: [conferenceId] }),
    ]);

    const userName = userRow.rows.length > 0 ? resolveUserDisplayName(userRow.rows[0]) : authResult.email;
    const conferenceName = confRow.rows.length > 0 ? String(confRow.rows[0].name) : `Conference #${conferenceId}`;

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
        entityName: conferenceName,
        entityType: 'conference',
        entityId: conferenceId,
      });
    }

    return NextResponse.json({
      id: Number(insertRes.rows[0].id),
      section,
      body: content.trim(),
      userName,
      userInitials: getInitials(userName),
      createdAt: String(insertRes.rows[0].created_at),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/program-planner/conferences/[id]/logistics/notes error:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}
