import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials } from '@/lib/initials';

export const dynamic = 'force-dynamic';

const STATUS_ORDER: Record<string, number> = { overdue: 0, in_progress: 1, not_started: 2, completed: 3 };

interface AttendeeEntry {
  attendeeId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniorityLabel: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  activityCount: number;
  activityCounts: { phone: number; email: number; linkedin: number; text: number };
  meetingId: number | null;
  /** The reps assigned outreach to this person specifically. */
  assignees: { userId: number; displayName: string; initials: string }[];
}

interface CompanyAgg {
  companyId: number;
  companyName: string;
  companyType: string | null;
  icp: string | null;
  wse: number | null;
  status: string;
  /**
   * The company's own assigned rep(s) — companies.assigned_user, the same field
   * the SF Owner column reads. Deliberately not the outreach assignees: those
   * are per attendee now and ride on the attendee rows.
   */
  companyReps: { userId: number; displayName: string; initials: string }[];
  territory: { id: number; name: string; color: string } | null;
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

    // One row per (attendee, rep). A company appears here because at least one
    // of its attendees is assigned — not the other way round.
    const assignRows = await db.execute({
      sql: `SELECT oa.company_id, oa.attendee_id, oa.status, oa.assigned_user_id,
                   c.name as company_name, c.company_type, c.icp, c.wse, c.territory_id,
                   c.assigned_user as company_assigned_user,
                   st.name as territory_name, st.color as territory_color,
                   co.value as rep_name
            FROM outreach_assignments oa
            JOIN companies c ON c.id = oa.company_id
            JOIN config_options co ON co.id = oa.assigned_user_id AND co.category = 'user'
            LEFT JOIN sales_territories st ON st.id = c.territory_id
            WHERE oa.conference_id = ?
            ORDER BY c.name ASC`,
      args: [conferenceId],
    });

    if (assignRows.rows.length === 0) return NextResponse.json({ companies: [] });

    const companyMap = new Map<number, CompanyAgg>();
    // attendeeId -> the reps assigned to that attendee.
    const assigneesByAttendee = new Map<number, { userId: number; displayName: string; initials: string }[]>();
    // companies.assigned_user is a CSV of config_options ids; collect them so
    // the names can be resolved in one query below.
    const companyRepIds = new Map<number, number[]>();

    for (const r of assignRows.rows) {
      const companyId = Number(r.company_id);
      const attendeeId = Number(r.attendee_id);
      const displayName = String(r.rep_name);
      if (!companyMap.has(companyId)) {
        companyMap.set(companyId, {
          companyId,
          companyName: String(r.company_name),
          companyType: r.company_type ? String(r.company_type) : null,
          icp: r.icp ? String(r.icp) : null,
          wse: r.wse != null ? Number(r.wse) : null,
          status: String(r.status),
          companyReps: [],
          territory: r.territory_id != null
            ? { id: Number(r.territory_id), name: String(r.territory_name), color: String(r.territory_color) }
            : null,
        });
        companyRepIds.set(companyId, String(r.company_assigned_user ?? '')
          .split(',')
          .map(v => Number(v.trim()))
          .filter(n => Number.isFinite(n) && n > 0));
      }
      if (!assigneesByAttendee.has(attendeeId)) assigneesByAttendee.set(attendeeId, []);
      assigneesByAttendee.get(attendeeId)!.push({
        userId: Number(r.assigned_user_id),
        displayName,
        initials: getInitials(displayName),
      });
    }

    const allCompanyRepIds = Array.from(new Set(Array.from(companyRepIds.values()).flat()));
    const repNameById = new Map<number, string>();
    if (allCompanyRepIds.length > 0) {
      const repRows = await db.execute({
        sql: `SELECT id, value FROM config_options
              WHERE category = 'user' AND id IN (${allCompanyRepIds.map(() => '?').join(',')})`,
        args: allCompanyRepIds,
      });
      for (const r of repRows.rows) repNameById.set(Number(r.id), String(r.value));
    }
    companyRepIds.forEach((ids, companyId) => {
      const agg = companyMap.get(companyId);
      if (!agg) return;
      for (const id of ids) {
        const displayName = repNameById.get(id);
        if (!displayName) continue;
        agg.companyReps.push({ userId: id, displayName, initials: getInitials(displayName) });
      }
    });

    const companyIds = Array.from(companyMap.keys());
    const placeholders = companyIds.map(() => '?').join(',');
    // Only the assigned attendees are listed — that's the whole point of moving
    // assignment down to the person. A colleague at the same company who hasn't
    // been assigned no longer rides along.
    const assignedAttendeeIds = Array.from(assigneesByAttendee.keys());
    const attendeePlaceholders = assignedAttendeeIds.map(() => '?').join(',');

    const [attendeeRows, activityRows, noteRows, meetingRows, excludedRows] = await Promise.all([
      db.execute({
        sql: `SELECT a.id as attendee_id, a.company_id, a.first_name, a.last_name, a.title, a.seniority,
                     a.email, a.phone, a.linkedin_url, a.photo_url
              FROM conference_attendees ca
              JOIN attendees a ON a.id = ca.attendee_id
              WHERE ca.conference_id = ? AND a.id IN (${attendeePlaceholders})
              ORDER BY a.last_name, a.first_name`,
        args: [conferenceId, ...assignedAttendeeIds],
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
      // Most-recent non-superseded meeting per attendee at this conference — used
      // to flip the outreach card's schedule-meeting icon into its "scheduled"
      // (green, edit-on-click) state.
      db.execute({
        sql: `SELECT m.id, m.attendee_id
              FROM meetings m
              JOIN attendees a ON a.id = m.attendee_id
              WHERE m.conference_id = ? AND a.company_id IN (${placeholders}) AND m.superseded_by_id IS NULL
              ORDER BY m.id DESC`,
        args: [conferenceId, ...companyIds],
      }),
      db.execute({
        sql: `SELECT company_id, attendee_id FROM outreach_excluded_attendees
              WHERE conference_id = ? AND company_id IN (${placeholders})`,
        args: [conferenceId, ...companyIds],
      }),
    ]);

    const excludedByCompany = new Map<number, Set<number>>();
    for (const r of excludedRows.rows) {
      const companyId = Number(r.company_id);
      if (!excludedByCompany.has(companyId)) excludedByCompany.set(companyId, new Set());
      excludedByCompany.get(companyId)!.add(Number(r.attendee_id));
    }

    const activityByAttendee = new Map<number, number>();
    const activityByCompany = new Map<number, number>();
    const activityByAttendeeType = new Map<number, { phone: number; text: number; email: number; linkedin: number }>();
    for (const r of activityRows.rows) {
      const cnt = Number(r.cnt);
      const companyId = Number(r.company_id);
      const activityType = String(r.activity_type) as 'phone' | 'text' | 'email' | 'linkedin';
      activityByCompany.set(companyId, (activityByCompany.get(companyId) || 0) + cnt);
      if (r.attendee_id != null) {
        const attendeeId = Number(r.attendee_id);
        activityByAttendee.set(attendeeId, (activityByAttendee.get(attendeeId) || 0) + cnt);
        if (!activityByAttendeeType.has(attendeeId)) {
          activityByAttendeeType.set(attendeeId, { phone: 0, text: 0, email: 0, linkedin: 0 });
        }
        activityByAttendeeType.get(attendeeId)![activityType] = cnt;
      }
    }

    const noteCountByCompany = new Map<number, number>();
    for (const r of noteRows.rows) noteCountByCompany.set(Number(r.company_id), Number(r.cnt));

    // Rows are ordered by id DESC, so the first one seen per attendee is the
    // current (most recent, non-superseded) meeting.
    const meetingIdByAttendee = new Map<number, number>();
    for (const r of meetingRows.rows) {
      const attendeeId = Number(r.attendee_id);
      if (!meetingIdByAttendee.has(attendeeId)) meetingIdByAttendee.set(attendeeId, Number(r.id));
    }

    const attendeesByCompany = new Map<number, AttendeeEntry[]>();
    for (const r of attendeeRows.rows) {
      const companyId = Number(r.company_id);
      const attendeeId = Number(r.attendee_id);
      if (excludedByCompany.get(companyId)?.has(attendeeId)) continue;
      if (!attendeesByCompany.has(companyId)) attendeesByCompany.set(companyId, []);
      attendeesByCompany.get(companyId)!.push({
        attendeeId,
        firstName: String(r.first_name),
        lastName: String(r.last_name),
        title: r.title ? String(r.title) : null,
        seniorityLabel: r.seniority ? String(r.seniority) : null,
        email: r.email ? String(r.email) : null,
        phone: r.phone ? String(r.phone) : null,
        linkedinUrl: r.linkedin_url ? String(r.linkedin_url) : null,
        photoUrl: r.photo_url ? String(r.photo_url) : null,
        activityCount: activityByAttendee.get(attendeeId) || 0,
        activityCounts: activityByAttendeeType.get(attendeeId) || { phone: 0, text: 0, email: 0, linkedin: 0 },
        meetingId: meetingIdByAttendee.get(attendeeId) ?? null,
        assignees: assigneesByAttendee.get(attendeeId) ?? [],
      });
    }

    const companies = Array.from(companyMap.values()).map(c => ({
      companyId: c.companyId,
      companyName: c.companyName,
      companyType: c.companyType,
      icp: c.icp,
      wse: c.wse,
      status: c.status === 'not_started' && isPastEnd ? 'overdue' : c.status,
      companyReps: c.companyReps,
      territory: c.territory,
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
