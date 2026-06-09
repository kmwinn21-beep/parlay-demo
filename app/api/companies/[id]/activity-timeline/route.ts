import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { resolvePlanState } from '@/lib/trialState';
import { hasCapability } from '@/lib/capabilities';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid company ID' }, { status: 400 });

  const db = await getDb(authResult.accountId);

  const { planCapabilities } = await resolvePlanState(db);
  if (!hasCapability(planCapabilities, 'intelligence_core.activity_timeline')) {
    return NextResponse.json({ error: 'Upgrade required' }, { status: 403 });
  }

  try {
    // Step 1 — All conferences this company has appeared in
    const confsResult = await db.execute({
      sql: `SELECT DISTINCT c.id, c.name, c.start_date, c.end_date, c.series_id
            FROM conferences c
            JOIN conference_attendees ca ON ca.conference_id = c.id
            JOIN attendees a ON a.id = ca.attendee_id
            WHERE a.company_id = ?
            ORDER BY c.start_date ASC`,
      args: [companyId],
    });

    const companyResult = await db.execute({
      sql: `SELECT id, name FROM companies WHERE id = ?`,
      args: [companyId],
    });
    if (!companyResult.rows.length) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const companyName = String(companyResult.rows[0].name ?? '');

    const conferenceIds = confsResult.rows.map(r => Number(r.id));

    if (conferenceIds.length === 0) {
      return NextResponse.json({
        companyId,
        companyName,
        conferences: [],
        attendees: [],
        activity: { meetings: [], followUps: [], touchpoints: [], hostedEvents: [], firstContacts: [] },
        healthByConference: [],
      });
    }

    // Step 2 — All attendees from this company
    const attendeesResult = await db.execute({
      sql: `SELECT DISTINCT a.id, a.first_name, a.last_name, a.title, a.seniority, a.health_score
            FROM attendees a
            WHERE a.company_id = ?`,
      args: [companyId],
    });

    // Step 3 — All meetings
    const meetingsResult = await db.execute({
      sql: `SELECT m.id, m.attendee_id, m.conference_id, m.outcome, m.meeting_date, m.source
            FROM meetings m
            JOIN attendees a ON a.id = m.attendee_id
            WHERE a.company_id = ?`,
      args: [companyId],
    });

    // Step 4 — All follow-ups
    const followUpsResult = await db.execute({
      sql: `SELECT f.id, f.attendee_id, f.conference_id, f.completed, f.source
            FROM follow_ups f
            JOIN attendees a ON a.id = f.attendee_id
            WHERE a.company_id = ?`,
      args: [companyId],
    });

    // Step 5 — All touchpoints
    const touchpointsResult = await db.execute({
      sql: `SELECT t.id, t.attendee_id, t.conference_id, t.option_id
            FROM attendee_touchpoints t
            JOIN attendees a ON a.id = t.attendee_id
            WHERE a.company_id = ?`,
      args: [companyId],
    });

    // Step 6 — Hosted events attended (rsvp_status = 'attended')
    // social_event_rsvps links attendee_id to social_event_id; social_events has conference_id
    const hostedEventsResult = await db.execute({
      sql: `SELECT r.attendee_id, se.conference_id
            FROM social_event_rsvps r
            JOIN social_events se ON se.id = r.social_event_id
            JOIN attendees a ON a.id = r.attendee_id
            WHERE a.company_id = ? AND r.rsvp_status = 'attended'`,
      args: [companyId],
    });

    // Step 7 — First contact per attendee: earliest conference by start_date via conference_attendees
    const attendeeIds = attendeesResult.rows.map(r => Number(r.id));
    let firstContacts: Array<{ attendeeId: number; conferenceId: number }> = [];

    if (attendeeIds.length > 0) {
      const placeholders = attendeeIds.map(() => '?').join(',');
      const firstContactResult = await db.execute({
        sql: `SELECT ca.attendee_id, ca.conference_id
              FROM conference_attendees ca
              JOIN conferences c ON c.id = ca.conference_id
              WHERE ca.attendee_id IN (${placeholders})
                AND c.start_date = (
                  SELECT MIN(c2.start_date)
                  FROM conference_attendees ca2
                  JOIN conferences c2 ON c2.id = ca2.conference_id
                  WHERE ca2.attendee_id = ca.attendee_id
                )`,
        args: attendeeIds,
      });

      // Deduplicate — keep one first contact per attendee (earliest conference)
      const seen = new Set<number>();
      firstContacts = firstContactResult.rows
        .map(r => ({ attendeeId: Number(r.attendee_id), conferenceId: Number(r.conference_id) }))
        .filter(r => {
          if (seen.has(r.attendeeId)) return false;
          seen.add(r.attendeeId);
          return true;
        });
    }

    // Step 7b — Avg health score per conference: SQL AVG over all company attendees present at each conference
    const placeholders7b = conferenceIds.map(() => '?').join(',');
    const healthResult = await db.execute({
      sql: `SELECT ca.conference_id, ROUND(AVG(a.health_score)) as avg_hs
            FROM conference_attendees ca
            JOIN attendees a ON a.id = ca.attendee_id
            WHERE a.company_id = ?
              AND a.health_score IS NOT NULL
              AND ca.conference_id IN (${placeholders7b})
            GROUP BY ca.conference_id`,
      args: [companyId, ...conferenceIds],
    });

    const healthScoreMap = new Map<number, number>();
    for (const row of healthResult.rows) {
      if (row.avg_hs != null) healthScoreMap.set(Number(row.conference_id), Math.round(Number(row.avg_hs)));
    }

    const healthByConference = conferenceIds.map(cid => ({
      conferenceId: cid,
      healthScore: healthScoreMap.get(cid) ?? null,
    }));

    // Shape response
    return NextResponse.json({
      companyId,
      companyName,
      conferences: confsResult.rows.map(r => ({
        conferenceId: Number(r.id),
        conferenceName: String(r.name ?? ''),
        startDate: String(r.start_date ?? ''),
        endDate: String(r.end_date ?? ''),
        seriesId: r.series_id != null ? String(r.series_id) : null,
        isCurrent: false, // determined client-side via currentConferenceId prop
      })),
      attendees: attendeesResult.rows.map(r => ({
        attendeeId: Number(r.id),
        firstName: String(r.first_name ?? ''),
        lastName: String(r.last_name ?? ''),
        title: r.title != null ? String(r.title) : null,
        seniority: r.seniority != null ? String(r.seniority) : null,
        healthScore: r.health_score != null ? Number(r.health_score) : null,
      })),
      activity: {
        meetings: meetingsResult.rows.map(r => ({
          attendeeId: Number(r.attendee_id),
          conferenceId: Number(r.conference_id),
          outcome: r.outcome != null ? String(r.outcome) : null,
        })),
        followUps: followUpsResult.rows.map(r => ({
          attendeeId: Number(r.attendee_id),
          conferenceId: Number(r.conference_id),
          completed: Number(r.completed) === 1,
        })),
        touchpoints: touchpointsResult.rows.map(r => ({
          attendeeId: Number(r.attendee_id),
          conferenceId: Number(r.conference_id),
        })),
        hostedEvents: hostedEventsResult.rows.map(r => ({
          attendeeId: Number(r.attendee_id),
          conferenceId: Number(r.conference_id),
        })),
        firstContacts,
      },
      healthByConference,
    });
  } catch (err) {
    console.error('[activity-timeline] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
