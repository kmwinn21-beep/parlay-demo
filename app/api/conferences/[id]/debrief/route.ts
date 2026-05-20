import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

const TIER_ORDER: Record<string, number> = { must_target: 0, high_priority: 1, worth_engaging: 2, unassigned: 3 };

function csvContains(col: string): string {
  return `',' || COALESCE(${col}, '') || ',' LIKE '%,' || ? || ',%'`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id } = await params;
  const conferenceId = Number(id);

  try {
    // 1. Get conference
    const confResult = await db.execute({
      sql: 'SELECT id, name, start_date, end_date, location, internal_attendees FROM conferences WHERE id = ?',
      args: [conferenceId],
    });
    if (!confResult.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const conf = confResult.rows[0];

    // 2. Get user config_id and display (rep) name
    const userResult = await db.execute({
      sql: `SELECT u.config_id, co.value as rep_name
            FROM users u LEFT JOIN config_options co ON co.id = u.config_id
            WHERE u.id = ?`,
      args: [user.id],
    });
    const configId = userResult.rows[0]?.config_id != null ? Number(userResult.rows[0].config_id) : null;
    const repName = userResult.rows[0]?.rep_name ? String(userResult.rows[0].rep_name) : null;

    // 3. Internal attendee check
    const internalNames = (conf.internal_attendees as string | null)
      ?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
    if (!repName || !internalNames.includes(repName)) {
      return NextResponse.json({ error: 'Not an internal attendee of this conference' }, { status: 403 });
    }

    if (configId == null) {
      // User has no config entry — can't match scheduled_by / assigned_rep
      return NextResponse.json({
        conference: {
          id: Number(conf.id), name: String(conf.name),
          start_date: String(conf.start_date), end_date: String(conf.end_date ?? conf.start_date),
          location: String(conf.location),
        },
        repName, repFirstName: repName.split(' ')[0],
        configId: null,
        stats: { companiesEngaged: 0, meetingsHeld: 0, touchpoints: 0, followUpsDue: 0, sesScore: null },
        companies: [],
      });
    }

    const cidStr = String(configId);

    // 4. Parallel data fetch
    const [meetingResult, followUpResult, touchpointResult, tierResult] = await Promise.all([
      db.execute({
        sql: `SELECT m.id, m.attendee_id, m.meeting_date, m.meeting_time, m.meeting_type, m.outcome,
                     a.first_name, a.last_name, a.title, a.company_id, c.name as company_name,
                     cop.action_key as outcome_key
              FROM meetings m
              JOIN attendees a ON m.attendee_id = a.id
              LEFT JOIN companies c ON a.company_id = c.id
              LEFT JOIN config_options cop ON cop.category = 'action' AND cop.value = m.outcome
              WHERE m.conference_id = ? AND ${csvContains('m.scheduled_by')}
              ORDER BY m.meeting_date, m.meeting_time`,
        args: [conferenceId, cidStr],
      }),
      db.execute({
        sql: `SELECT fu.id, fu.attendee_id, fu.next_steps, fu.next_steps_notes, fu.completed,
                     fu.assigned_rep, fu.meeting_id,
                     a.first_name, a.last_name, a.company_id, c.name as company_name
              FROM follow_ups fu
              JOIN attendees a ON fu.attendee_id = a.id
              LEFT JOIN companies c ON a.company_id = c.id
              WHERE fu.conference_id = ? AND ${csvContains('fu.assigned_rep')}`,
        args: [conferenceId, cidStr],
      }),
      db.execute({
        sql: `SELECT at.attendee_id, COUNT(*) as cnt, a.company_id
              FROM attendee_touchpoints at
              JOIN attendees a ON at.attendee_id = a.id
              WHERE at.conference_id = ?
              GROUP BY at.attendee_id`,
        args: [conferenceId],
      }),
      db.execute({
        sql: `SELECT ct.attendee_id, ct.tier, a.company_id
              FROM conference_targets ct
              JOIN attendees a ON ct.attendee_id = a.id
              WHERE ct.conference_id = ?`,
        args: [conferenceId],
      }),
    ]);

    const meetingRows = meetingResult.rows as Record<string, unknown>[];
    const followUpRows = followUpResult.rows as Record<string, unknown>[];

    // 5. Fetch notes + insights for rep's meetings
    const meetingIds = meetingRows.map(m => Number(m.id));
    const [notesResult, insightsResult] = meetingIds.length > 0
      ? await Promise.all([
          db.execute({
            sql: `SELECT meeting_id, summary, transcript, notes_text FROM meeting_notes WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})`,
            args: meetingIds,
          }),
          db.execute({
            sql: `SELECT id, meeting_id, insight_type, content, quote, confidence, confirmed, timestamp_seconds
                  FROM meeting_insights WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})`,
            args: meetingIds,
          }),
        ])
      : [{ rows: [] }, { rows: [] }];

    // Build lookup maps
    const notesByMeeting = new Map<number, Record<string, unknown>>();
    for (const row of notesResult.rows) notesByMeeting.set(Number(row.meeting_id), row as Record<string, unknown>);

    const insightsByMeeting = new Map<number, Record<string, unknown>[]>();
    for (const row of insightsResult.rows) {
      const mid = Number(row.meeting_id);
      if (!insightsByMeeting.has(mid)) insightsByMeeting.set(mid, []);
      insightsByMeeting.get(mid)!.push(row as Record<string, unknown>);
    }

    const touchpointByAttendee = new Map<number, number>();
    for (const row of touchpointResult.rows) touchpointByAttendee.set(Number(row.attendee_id), Number(row.cnt));

    // Build best tier per company
    const tierByCompany = new Map<number, string>();
    for (const row of tierResult.rows) {
      if (row.company_id == null) continue;
      const cid = Number(row.company_id);
      const tier = String(row.tier);
      const cur = tierByCompany.get(cid);
      if (!cur || (TIER_ORDER[tier] ?? 99) < (TIER_ORDER[cur] ?? 99)) tierByCompany.set(cid, tier);
    }

    // 6. Aggregate by company
    type CompanyData = {
      id: number; name: string; tier: string | null;
      status: string | null; icp: string | null;
      attendeeIds: Set<number>;
      attendeeInfo: Map<number, { name: string; title: string | null }>;
      meetingRows: Record<string, unknown>[];
      followUps: Record<string, unknown>[];
    };

    const companyMap = new Map<number, CompanyData>();

    const getOrCreateCompany = (companyId: number, companyName: string): CompanyData => {
      if (!companyMap.has(companyId)) {
        companyMap.set(companyId, {
          id: companyId, name: companyName,
          tier: tierByCompany.get(companyId) ?? null,
          status: null, icp: null,
          attendeeIds: new Set(), attendeeInfo: new Map(),
          meetingRows: [], followUps: [],
        });
      }
      return companyMap.get(companyId)!;
    };

    for (const m of meetingRows) {
      const co = getOrCreateCompany(
        m.company_id != null ? Number(m.company_id) : -1,
        m.company_name ? String(m.company_name) : 'No Company',
      );
      const aid = Number(m.attendee_id);
      co.attendeeIds.add(aid);
      if (!co.attendeeInfo.has(aid)) {
        co.attendeeInfo.set(aid, { name: `${m.first_name} ${m.last_name}`, title: m.title ? String(m.title) : null });
      }
      co.meetingRows.push(m);
    }

    for (const fu of followUpRows) {
      const co = getOrCreateCompany(
        fu.company_id != null ? Number(fu.company_id) : -1,
        fu.company_name ? String(fu.company_name) : 'No Company',
      );
      const aid = Number(fu.attendee_id);
      co.attendeeIds.add(aid);
      if (!co.attendeeInfo.has(aid)) {
        co.attendeeInfo.set(aid, { name: `${fu.first_name} ${fu.last_name}`, title: null });
      }
      co.followUps.push(fu);
    }

    // 6b. Enrich companyMap: all conference attendees + company metadata
    const companyIds = Array.from(companyMap.keys()).filter(id => id > 0);
    if (companyIds.length > 0) {
      const ph = companyIds.map(() => '?').join(',');
      const [allAttendeesRes, companyMetaRes] = await Promise.all([
        db.execute({
          sql: `SELECT DISTINCT a.id, a.first_name, a.last_name, a.title, a.company_id
                FROM attendees a
                WHERE a.company_id IN (${ph})
                AND (
                  a.id IN (SELECT attendee_id FROM conference_attendees WHERE conference_id = ?)
                  OR a.id IN (SELECT attendee_id FROM meetings WHERE conference_id = ?)
                  OR a.id IN (SELECT attendee_id FROM conference_targets WHERE conference_id = ?)
                )`,
          args: [...companyIds, conferenceId, conferenceId, conferenceId],
        }),
        db.execute({
          sql: `SELECT id, status, icp FROM companies WHERE id IN (${ph})`,
          args: companyIds,
        }),
      ]).catch(() => [{ rows: [] }, { rows: [] }] as [{ rows: unknown[] }, { rows: unknown[] }]);

      for (const row of (allAttendeesRes as { rows: Record<string, unknown>[] }).rows) {
        const cid = Number(row.company_id);
        const co = companyMap.get(cid);
        if (!co) continue;
        const aid = Number(row.id);
        co.attendeeIds.add(aid);
        if (!co.attendeeInfo.has(aid)) {
          co.attendeeInfo.set(aid, {
            name: `${row.first_name} ${row.last_name}`,
            title: row.title ? String(row.title) : null,
          });
        }
      }

      for (const row of (companyMetaRes as { rows: Record<string, unknown>[] }).rows) {
        const co = companyMap.get(Number(row.id));
        if (co) {
          co.status = row.status ? String(row.status) : null;
          co.icp = row.icp ? String(row.icp) : null;
        }
      }
    }

    // 7. Build output companies
    const companies = Array.from(companyMap.values()).map(co => {
      const openFollowUps = co.followUps.filter(fu => !fu.completed);
      const completedFollowUps = co.followUps.filter(fu => fu.completed);
      const companyTouchpoints = Array.from(co.attendeeIds).reduce((s, aid) => s + (touchpointByAttendee.get(aid) ?? 0), 0);

      const meetingCards = co.meetingRows.map(m => {
        const mid = Number(m.id);
        const notes = notesByMeeting.get(mid);
        const insights = insightsByMeeting.get(mid) ?? [];
        let parsedTranscript: unknown[] = [];
        try { parsedTranscript = JSON.parse(String(notes?.transcript ?? 'null')) ?? []; } catch { /* */ }
        return {
          meetingId: mid,
          attendeeId: Number(m.attendee_id),
          attendeeName: `${m.first_name} ${m.last_name}`,
          attendeeTitle: m.title ? String(m.title) : null,
          date: m.meeting_date ? String(m.meeting_date) : null,
          time: m.meeting_time ? String(m.meeting_time) : null,
          meetingType: m.meeting_type ? String(m.meeting_type) : null,
          outcome: m.outcome ? String(m.outcome) : null,
          isHeld: String(m.outcome_key) === 'meeting_held',
          actionItemCount: insights.filter(i => i.insight_type === 'next_step').length,
          buyingSignalCount: insights.filter(i => i.insight_type === 'buying_signal').length,
          painPointCount: insights.filter(i => i.insight_type === 'pain_point').length,
          summary: notes?.summary ? String(notes.summary) : null,
          notesText: notes?.notes_text ? String(notes.notes_text) : null,
          transcript: parsedTranscript,
          insights: insights.map(i => ({
            id: Number(i.id),
            insight_type: String(i.insight_type),
            content: String(i.content),
            quote: i.quote ? String(i.quote) : null,
            confidence: String(i.confidence ?? 'medium'),
            confirmed: Boolean(i.confirmed),
            timestamp_seconds: i.timestamp_seconds != null ? Number(i.timestamp_seconds) : null,
          })),
        };
      });

      const timeline = co.meetingRows.map(m => ({
        type: 'meeting' as const,
        attendeeName: `${m.first_name} ${m.last_name}`,
        date: m.meeting_date ? String(m.meeting_date) : null,
        time: m.meeting_time ? String(m.meeting_time) : null,
        label: m.meeting_type ? String(m.meeting_type) : 'Meeting',
        isHeld: String(m.outcome_key) === 'meeting_held',
      })).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.time ?? '').localeCompare(b.time ?? ''));

      return {
        id: co.id, name: co.name,
        tier: co.tier,
        status: co.status,
        icp: co.icp,
        attendeeCount: co.attendeeIds.size,
        meetingCount: co.meetingRows.length,
        meetingsHeld: co.meetingRows.filter(m => String(m.outcome_key) === 'meeting_held').length,
        touchpointCount: companyTouchpoints,
        openFollowUpCount: openFollowUps.length,
        completedFollowUpCount: completedFollowUps.length,
        attendees: Array.from(co.attendeeInfo.entries()).map(([id, info]) => ({
          id, name: info.name, title: info.title,
          meetingCount: co.meetingRows.filter(m => Number(m.attendee_id) === id).length,
          touchpointCount: touchpointByAttendee.get(id) ?? 0,
          followUpCount: co.followUps.filter(fu => Number(fu.attendee_id) === id).length,
        })),
        timeline,
        meetingCards,
        followUps: co.followUps.map(fu => ({
          id: Number(fu.id),
          attendeeId: fu.attendee_id != null ? Number(fu.attendee_id) : null,
          attendeeName: fu.first_name ? `${String(fu.first_name)} ${String(fu.last_name ?? '')}`.trim() : null,
          taskText: fu.next_steps_notes ? String(fu.next_steps_notes) : String(fu.next_steps ?? ''),
          nextSteps: String(fu.next_steps ?? ''),
          completed: Boolean(fu.completed),
          meetingId: fu.meeting_id != null ? Number(fu.meeting_id) : null,
          source: fu.meeting_id ? 'From meeting notes' : 'Manual',
        })),
      };
    });

    // Sort by tier then open follow-ups descending
    companies.sort((a, b) => {
      const ta = TIER_ORDER[a.tier ?? 'unassigned'] ?? 3;
      const tb = TIER_ORDER[b.tier ?? 'unassigned'] ?? 3;
      return ta !== tb ? ta - tb : b.openFollowUpCount - a.openFollowUpCount;
    });

    // 8. Compute header stats
    const totalHeld = meetingRows.filter(m => String(m.outcome_key) === 'meeting_held').length;
    const totalTouchpoints = companies.reduce((s, c) => s + c.touchpointCount, 0);
    const totalDue = followUpRows.filter(fu => !fu.completed).length;

    const holdRate = meetingRows.length > 0 ? Math.round((totalHeld / meetingRows.length) * 100) : null;
    const heldCompanyIds = new Set(meetingRows.filter(m => String(m.outcome_key) === 'meeting_held').map(m => Number(m.company_id)));
    const fuCompanyIds = new Set(followUpRows.map(fu => Number(fu.company_id)));
    const fuAttachRate = heldCompanyIds.size > 0
      ? Math.round((Array.from(heldCompanyIds).filter(id => fuCompanyIds.has(id)).length / heldCompanyIds.size) * 100)
      : null;
    const sesScore = holdRate != null && fuAttachRate != null
      ? Math.round(holdRate * 0.5 + fuAttachRate * 0.5)
      : (holdRate ?? fuAttachRate ?? null);

    return NextResponse.json({
      conference: {
        id: Number(conf.id), name: String(conf.name),
        start_date: String(conf.start_date), end_date: String(conf.end_date ?? conf.start_date),
        location: String(conf.location),
      },
      repName,
      repFirstName: repName.split(' ')[0],
      configId,
      stats: {
        companiesEngaged: companyMap.size,
        meetingsHeld: totalHeld,
        touchpoints: totalTouchpoints,
        followUpsDue: totalDue,
        sesScore,
      },
      companies,
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/debrief error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
