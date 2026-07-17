import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials, resolveUserDisplayName } from '@/lib/initials';

export const dynamic = 'force-dynamic';

const STATUS_ORDER: Record<string, number> = { overdue: 0, in_progress: 1, not_started: 2, completed: 3 };

interface AttendeeEntry {
  attendeeId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniorityLabel: string | null;
  activityCount: number;
  activityCounts: { phone: number; email: number; linkedin: number };
}

interface CompanyAgg {
  companyId: number;
  companyName: string;
  companyType: string | null;
  icp: string | null;
  status: string;
  assignees: { userId: number; displayName: string; initials: string }[];
}

// GET /api/conferences/[id]/outreach — companies assigned for outreach at this
// conference, with their attendees, assignment info, and activity/note counts.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  if (!conferenceId) return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });

  try {
    const confRow = await db.execute({ sql: `SELECT end_date FROM conferences WHERE id = ?`, args: [conferenceId] });
    const endDate = confRow.rows[0]?.end_date ? String(confRow.rows[0].end_date) : null;
    // Compare by calendar day only — a conference ending "today" shouldn't flip to
    // overdue mid-day.
    const isPastEnd = endDate ? new Date(endDate) < new Date(new Date().toISOString().slice(0, 10)) : false;

    const assignRows = await db.execute({
      sql: `SELECT oa.company_id, oa.status, oa.assigned_user_id,
                   c.name as company_name, c.company_type, c.icp,
                   u.display_name, u.first_name, u.last_name, u.email
            FROM outreach_assignments oa
            JOIN companies c ON c.id = oa.company_id
            JOIN users u ON u.id = oa.assigned_user_id
            WHERE oa.conference_id = ?
            ORDER BY c.name ASC`,
      args: [conferenceId],
    });

    if (assignRows.rows.length === 0) return NextResponse.json({ companies: [] });

    const companyMap = new Map<number, CompanyAgg>();
    for (const r of assignRows.rows) {
      const companyId = Number(r.company_id);
      const displayName = resolveUserDisplayName(r);
      if (!companyMap.has(companyId)) {
        companyMap.set(companyId, {
          companyId,
          companyName: String(r.company_name),
          companyType: r.company_type ? String(r.company_type) : null,
          icp: r.icp ? String(r.icp) : null,
          status: String(r.status),
          assignees: [],
        });
      }
      companyMap.get(companyId)!.assignees.push({
        userId: Number(r.assigned_user_id),
        displayName,
        initials: getInitials(displayName),
      });
    }

    const companyIds = Array.from(companyMap.keys());
    const placeholders = companyIds.map(() => '?').join(',');

    const [attendeeRows, activityRows, noteRows] = await Promise.all([
      db.execute({
        sql: `SELECT a.id as attendee_id, a.company_id, a.first_name, a.last_name, a.title, a.seniority
              FROM conference_attendees ca
              JOIN attendees a ON a.id = ca.attendee_id
              WHERE ca.conference_id = ? AND a.company_id IN (${placeholders})
              ORDER BY a.last_name, a.first_name`,
        args: [conferenceId, ...companyIds],
      }),
      db.execute({
        sql: `SELECT company_id, attendee_id, activity_type, COUNT(*) as cnt
              FROM outreach_activity
              WHERE conference_id = ? AND company_id IN (${placeholders})
              GROUP BY company_id, attendee_id, activity_type`,
        args: [conferenceId, ...companyIds],
      }),
      db.execute({
        sql: `SELECT company_id, COUNT(*) as cnt FROM outreach_notes
              WHERE conference_id = ? AND company_id IN (${placeholders})
              GROUP BY company_id`,
        args: [conferenceId, ...companyIds],
      }),
    ]);

    const activityByAttendee = new Map<number, number>();
    const activityByCompany = new Map<number, number>();
    const activityByAttendeeType = new Map<number, { phone: number; email: number; linkedin: number }>();
    for (const r of activityRows.rows) {
      const cnt = Number(r.cnt);
      const companyId = Number(r.company_id);
      const activityType = String(r.activity_type) as 'phone' | 'email' | 'linkedin';
      activityByCompany.set(companyId, (activityByCompany.get(companyId) || 0) + cnt);
      if (r.attendee_id != null) {
        const attendeeId = Number(r.attendee_id);
        activityByAttendee.set(attendeeId, (activityByAttendee.get(attendeeId) || 0) + cnt);
        if (!activityByAttendeeType.has(attendeeId)) {
          activityByAttendeeType.set(attendeeId, { phone: 0, email: 0, linkedin: 0 });
        }
        activityByAttendeeType.get(attendeeId)![activityType] = cnt;
      }
    }

    const noteCountByCompany = new Map<number, number>();
    for (const r of noteRows.rows) noteCountByCompany.set(Number(r.company_id), Number(r.cnt));

    const attendeesByCompany = new Map<number, AttendeeEntry[]>();
    for (const r of attendeeRows.rows) {
      const companyId = Number(r.company_id);
      const attendeeId = Number(r.attendee_id);
      if (!attendeesByCompany.has(companyId)) attendeesByCompany.set(companyId, []);
      attendeesByCompany.get(companyId)!.push({
        attendeeId,
        firstName: String(r.first_name),
        lastName: String(r.last_name),
        title: r.title ? String(r.title) : null,
        seniorityLabel: r.seniority ? String(r.seniority) : null,
        activityCount: activityByAttendee.get(attendeeId) || 0,
        activityCounts: activityByAttendeeType.get(attendeeId) || { phone: 0, email: 0, linkedin: 0 },
      });
    }

    const companies = Array.from(companyMap.values()).map(c => ({
      companyId: c.companyId,
      companyName: c.companyName,
      companyType: c.companyType,
      icp: c.icp,
      status: c.status === 'not_started' && isPastEnd ? 'overdue' : c.status,
      assignees: c.assignees,
      attendees: attendeesByCompany.get(c.companyId) || [],
      totalActivityCount: activityByCompany.get(c.companyId) || 0,
      noteCount: noteCountByCompany.get(c.companyId) || 0,
    }));

    companies.sort((a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.companyName.localeCompare(b.companyName)
    );

    return NextResponse.json({ companies });
  } catch (error) {
    console.error('GET /api/conferences/[id]/outreach error:', error);
    return NextResponse.json({ error: 'Failed to fetch outreach data' }, { status: 500 });
  }
}
