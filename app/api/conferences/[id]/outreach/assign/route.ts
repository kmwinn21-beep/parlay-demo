import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { createNotifications, resolveUserIds } from '@/lib/notifications';
import { resolveUserDisplayName } from '@/lib/initials';

interface AssignmentInput { attendeeId: number; userIds: number[] }

// GET /api/conferences/[id]/outreach/assign?companyId=N — the company's
// attendees at this conference and who is currently assigned to each, which is
// what the assign modal checks boxes from.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(new URL(request.url).searchParams.get('companyId'));
  if (!conferenceId || !companyId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const [attendeeRes, assignedRes] = await Promise.all([
      db.execute({
        sql: `SELECT a.id, a.first_name, a.last_name, a.title
              FROM conference_attendees ca
              JOIN attendees a ON a.id = ca.attendee_id
              WHERE ca.conference_id = ? AND a.company_id = ?
              ORDER BY a.last_name, a.first_name`,
        args: [conferenceId, companyId],
      }),
      db.execute({
        sql: `SELECT attendee_id, assigned_user_id FROM outreach_assignments
              WHERE conference_id = ? AND company_id = ?`,
        args: [conferenceId, companyId],
      }),
    ]);

    const byAttendee = new Map<number, number[]>();
    for (const r of assignedRes.rows) {
      const id = Number(r.attendee_id);
      if (!byAttendee.has(id)) byAttendee.set(id, []);
      byAttendee.get(id)!.push(Number(r.assigned_user_id));
    }

    return NextResponse.json({
      attendees: attendeeRes.rows.map(r => ({
        attendeeId: Number(r.id),
        name: `${String(r.first_name ?? '')} ${String(r.last_name ?? '')}`.trim(),
        title: r.title ? String(r.title) : null,
        assignedUserIds: byAttendee.get(Number(r.id)) ?? [],
      })),
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/outreach/assign error:', error);
    return NextResponse.json({ error: 'Failed to load attendees' }, { status: 500 });
  }
}

// POST /api/conferences/[id]/outreach/assign — sets who is assigned outreach to
// each of a company's attendees at this conference.
//
// Declarative, and scoped to exactly the attendees named in the body: each
// entry's userIds becomes that attendee's full rep list, so unchecking a rep
// un-assigns them and an empty userIds drops that attendee from the outreach
// list. An attendee the caller doesn't mention is left alone — that's what lets
// the same endpoint serve both the whole-company modal (which sends every
// attendee) and a single-attendee edit.
//
// userIds are config_options ids (category='user' — the Admin > Types rep
// roster), not users.id — most reps don't have a real login account, so
// notifications below resolve whichever of them do via resolveUserIds and
// silently skip the rest.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  if (!conferenceId) return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });

  try {
    const body = await request.json();
    const { companyId, assignments } = body as { companyId: number; assignments: AssignmentInput[] };
    if (!companyId || !Array.isArray(assignments)) {
      return NextResponse.json({ error: 'companyId and assignments required' }, { status: 400 });
    }

    const companyRow = await db.execute({ sql: `SELECT name FROM companies WHERE id = ?`, args: [companyId] });
    if (companyRow.rows.length === 0) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    // A new assignment inherits the company's current outreach status rather
    // than resetting to not_started — a company already marked In Progress
    // shouldn't flip back because one more person was added to it.
    const statusRow = await db.execute({
      sql: `SELECT status FROM outreach_assignments WHERE conference_id = ? AND company_id = ? LIMIT 1`,
      args: [conferenceId, companyId],
    });
    const inheritedStatus = statusRow.rows[0]?.status ? String(statusRow.rows[0].status) : 'not_started';

    const existingRes = await db.execute({
      sql: `SELECT attendee_id, assigned_user_id FROM outreach_assignments
            WHERE conference_id = ? AND company_id = ?`,
      args: [conferenceId, companyId],
    });
    const existingPairs = new Set(existingRes.rows.map(r => `${Number(r.attendee_id)}-${Number(r.assigned_user_id)}`));

    const newlyAddedUserIds = new Set<number>();

    for (const entry of assignments) {
      const attendeeId = Number(entry.attendeeId);
      const userIds = Array.isArray(entry.userIds) ? entry.userIds.map(Number).filter(Boolean) : [];
      if (!attendeeId) continue;

      if (userIds.length > 0) {
        await db.execute({
          sql: `DELETE FROM outreach_assignments
                WHERE conference_id = ? AND attendee_id = ?
                  AND assigned_user_id NOT IN (${userIds.map(() => '?').join(',')})`,
          args: [conferenceId, attendeeId, ...userIds],
        });
      } else {
        await db.execute({
          sql: `DELETE FROM outreach_assignments WHERE conference_id = ? AND attendee_id = ?`,
          args: [conferenceId, attendeeId],
        });
      }

      for (const userId of userIds) {
        await db.execute({
          sql: `INSERT INTO outreach_assignments
                  (conference_id, company_id, attendee_id, assigned_user_id, assigned_by_user_id, status)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (conference_id, attendee_id, assigned_user_id)
                DO UPDATE SET updated_at = datetime('now')`,
          args: [conferenceId, companyId, attendeeId, userId, authResult.id, inheritedStatus],
        });
        if (!existingPairs.has(`${attendeeId}-${userId}`)) newlyAddedUserIds.add(userId);
      }

      // Assigning someone explicitly overrides an earlier removal, so the row
      // that hides them can't outlive the decision to put them back.
      if (userIds.length > 0) {
        await db.execute({
          sql: `DELETE FROM outreach_excluded_attendees
                WHERE conference_id = ? AND company_id = ? AND attendee_id = ?`,
          args: [conferenceId, companyId, attendeeId],
        }).catch(() => {});
      }
    }

    if (newlyAddedUserIds.size > 0) {
      const added = Array.from(newlyAddedUserIds);
      const [conferenceRow, assignerRow, notifyUserIds] = await Promise.all([
        db.execute({ sql: `SELECT name FROM conferences WHERE id = ?`, args: [conferenceId] }),
        db.execute({ sql: `SELECT display_name, first_name, last_name, email FROM users WHERE id = ?`, args: [authResult.id] }),
        resolveUserIds(added.join(',')),
      ]);
      const companyName = String(companyRow.rows[0].name);
      const conferenceName = conferenceRow.rows.length > 0 ? String(conferenceRow.rows[0].name) : 'this conference';
      const assignerName = assignerRow.rows.length > 0 ? resolveUserDisplayName(assignerRow.rows[0]) : authResult.email;

      // Only newly-added reps are notified — editing an existing assignment
      // (e.g. adding one more rep) shouldn't re-notify reps who were already
      // assigned and unaffected by the change. Reps with no linked login
      // account (resolveUserIds drops them) just don't get one.
      if (notifyUserIds.length > 0) {
        await createNotifications({
          userIds: notifyUserIds,
          type: 'conference',
          recordId: conferenceId,
          recordName: conferenceName,
          message: `${assignerName} assigned you to outreach for ${companyName} at ${conferenceName}`,
          changedByEmail: authResult.email,
          changedByConfigId: null,
          entityType: 'conference',
          entityId: conferenceId,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/conferences/[id]/outreach/assign error:', error);
    return NextResponse.json({ error: 'Failed to assign outreach' }, { status: 500 });
  }
}
