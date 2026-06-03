import { createClient } from '@libsql/client';
import { db, dbReady } from '@/lib/db';

export type SimulationParams = {
  accountId: string
  conferenceId: number
  targetScoreMin: number
  targetScoreMax: number
  repIds: number[]
  attendeeCoverage: number   // fraction 0.0–1.0 (UI sends coverage/100)
  density: 'light' | 'moderate' | 'heavy'
  dryRun: boolean
}

export type SimulationPlan = {
  meetingsScheduled: number
  meetingsHeld: number
  meetingsWithOutcomes: number
  followUpsCreated: number
  followUpsCompleted: number
  touchpoints: number
  companiesEngaged: number
  netNewLogos: number
}

export type SimulationResult = {
  plan: SimulationPlan
  activitySummary: {
    targetRange: string
    density: string
    coveragePct: number
    icpAttendeesTotal: number
    icpAttendeesTouched: number
  }
  written: boolean
  recordsWritten?: {
    meetings: number
    followUps: number
    touchpoints: number
  }
  warning?: string
}

const densityPresets = {
  light:    { holdRate: 0.65, followUpRate: 0.55, completionRate: 0.60, touchesPerCompany: 1.2 },
  moderate: { holdRate: 0.78, followUpRate: 0.70, completionRate: 0.75, touchesPerCompany: 1.8 },
  heavy:    { holdRate: 0.90, followUpRate: 0.85, completionRate: 0.90, touchesPerCompany: 2.5 },
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toISOTimestamp(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function conferenceDates(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function businessTimestamp(date: Date, slotIndex: number, totalSlots: number): string {
  // Spread across 8am-6pm (10 hour window)
  const minuteOffset = Math.floor((slotIndex / Math.max(totalSlots, 1)) * 600);
  const startMinute = 8 * 60 + minuteOffset;
  const h = Math.floor(startMinute / 60);
  const m = startMinute % 60;
  const d = new Date(date);
  d.setUTCHours(h, m, 0, 0);
  return toISOTimestamp(d);
}

type AttendeeRow = {
  id: number
  first_name: string
  last_name: string
  title: string | null
  company_id: number | null
  seniority: string | null
  function: string | null
  health_score: number | null
}

type CompanyRow = {
  id: number
  name: string
  wse: number | null
  icp: string | null
}

export async function simulateConferenceActivity(params: SimulationParams): Promise<SimulationResult> {
  const {
    accountId,
    conferenceId,
    targetScoreMin,
    targetScoreMax,
    repIds,
    attendeeCoverage,
    density: densityKey,
    dryRun,
  } = params;

  const density = densityPresets[densityKey];
  const targetMid = (targetScoreMin + targetScoreMax) / 2;

  // Get tenant DB credentials
  await dbReady;
  const accountRow = await db.execute({
    sql: `SELECT turso_db_url, turso_auth_token, company_name FROM accounts WHERE id = ?`,
    args: [accountId],
  });
  if (!accountRow.rows[0]?.turso_db_url) {
    throw new Error(`No tenant DB found for account ${accountId}`);
  }
  const client = createClient({
    url: String(accountRow.rows[0].turso_db_url),
    authToken: String(accountRow.rows[0].turso_auth_token),
  });

  // Fetch conference record
  const confRes = await client.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date,
                 co.action_key AS strategy_key
          FROM conferences c
          LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
          WHERE c.id = ?`,
    args: [conferenceId],
  });
  if (!confRes.rows[0]) throw new Error(`Conference ${conferenceId} not found`);
  const conf = confRes.rows[0];
  const confName = String(conf.name);
  const confStartDate = String(conf.start_date);
  const confEndDate = String(conf.end_date);

  // Fetch all attendees at conference
  const attendeesRes = await client.execute({
    sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.company_id, a.seniority, a."function", a.health_score
          FROM attendees a
          JOIN conference_attendees ca ON ca.attendee_id = a.id
          WHERE ca.conference_id = ?`,
    args: [conferenceId],
  });
  const allAttendees: AttendeeRow[] = attendeesRes.rows.map(r => ({
    id: Number(r.id),
    first_name: String(r.first_name),
    last_name: String(r.last_name),
    title: r.title ? String(r.title) : null,
    company_id: r.company_id != null ? Number(r.company_id) : null,
    seniority: r.seniority ? String(r.seniority) : null,
    function: r['function'] ? String(r['function']) : null,
    health_score: r.health_score != null ? Number(r.health_score) : null,
  }));

  // Fetch companies at conference
  const companiesRes = await client.execute({
    sql: `SELECT DISTINCT co.id, co.name, co.wse, co.icp
          FROM companies co
          JOIN attendees a ON a.company_id = co.id
          JOIN conference_attendees ca ON ca.attendee_id = a.id
          WHERE ca.conference_id = ?`,
    args: [conferenceId],
  });
  const allCompanies: CompanyRow[] = companiesRes.rows.map(r => ({
    id: Number(r.id),
    name: String(r.name),
    wse: r.wse != null ? Number(r.wse) : null,
    icp: r.icp ? String(r.icp) : null,
  }));

  const icpCompanyIds = new Set(allCompanies.filter(c => c.icp === 'Yes').map(c => c.id));

  // Fetch conference targets for attendee sort priority
  const targetsRes = await client.execute({
    sql: `SELECT DISTINCT a.company_id
          FROM conference_targets ct
          JOIN attendees a ON a.id = ct.attendee_id
          WHERE ct.conference_id = ? AND a.company_id IS NOT NULL`,
    args: [conferenceId],
  }).catch(() => ({ rows: [] as { company_id: unknown }[] }));
  const targetCompanyIds = new Set(targetsRes.rows.map(r => Number(r.company_id)));

  // Config options: meeting_held value and touchpoint option_id
  const configRes = await client.execute({
    sql: `SELECT id, category, value, action_key FROM config_options WHERE (action_key = 'meeting_held' AND category = 'action') OR category = 'touchpoints' ORDER BY sort_order`,
    args: [],
  });
  let meetingHeldValue = 'Held';
  let touchpointOptionId: number | null = null;
  for (const r of configRes.rows) {
    if (String(r.action_key) === 'meeting_held') {
      meetingHeldValue = String(r.value);
    }
    if (String(r.category) === 'touchpoints' && touchpointOptionId === null) {
      touchpointOptionId = Number(r.id);
    }
  }

  // Rep info — IDs reference config_options.id (category='user'), not users.id
  const repNames: Map<number, string> = new Map();
  if (repIds.length > 0) {
    const repRes = await client.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'user' AND id IN (${repIds.map(() => '?').join(',')})`,
      args: repIds,
    }).catch(() => ({ rows: [] as { id: unknown; value: unknown }[] }));
    for (const r of repRes.rows) {
      repNames.set(Number(r.id), String(r.value ?? ''));
    }
  }
  const effectiveRepIds = repIds.length > 0 ? repIds : [0];

  // ── Planning layer ──────────────────────────────────────────────────────────
  // Map target score midpoint to an activity multiplier
  const scoreMultiplier =
    targetMid >= 85 ? 1.0 :
    targetMid >= 75 ? 0.85 :
    targetMid >= 65 ? 0.70 :
    targetMid >= 55 ? 0.55 :
    0.40;

  // ICP attendees sorted: target-company attendees first, then by health score
  const icpMatchedAttendees = allAttendees
    .filter(a => a.company_id != null && icpCompanyIds.has(a.company_id))
    .sort((a, b) => {
      const aTarget = a.company_id !== null && targetCompanyIds.has(a.company_id) ? 1 : 0;
      const bTarget = b.company_id !== null && targetCompanyIds.has(b.company_id) ? 1 : 0;
      if (aTarget !== bTarget) return bTarget - aTarget;
      return (b.health_score ?? 0) - (a.health_score ?? 0);
    });

  if (icpMatchedAttendees.length === 0) {
    return {
      plan: {
        meetingsScheduled: 0, meetingsHeld: 0, meetingsWithOutcomes: 0,
        followUpsCreated: 0, followUpsCompleted: 0, touchpoints: 0,
        companiesEngaged: 0, netNewLogos: 0,
      },
      activitySummary: {
        targetRange: `${targetScoreMin}–${targetScoreMax}`,
        density: densityKey,
        coveragePct: Math.round(attendeeCoverage * 100),
        icpAttendeesTotal: 0,
        icpAttendeesTouched: 0,
      },
      written: false,
      warning: 'No ICP-matched attendees found for this conference. Import an attendee list before running the simulation.',
    };
  }

  // Attendee pool: one meeting scheduled per attendee in pool (hard cap)
  const poolSize = Math.max(1, Math.floor(icpMatchedAttendees.length * attendeeCoverage * scoreMultiplier));
  const attendeePool = icpMatchedAttendees.slice(0, poolSize);

  const meetingsScheduled = attendeePool.length;
  const meetingsHeld = Math.round(meetingsScheduled * density.holdRate);
  const heldAttendees = attendeePool.slice(0, meetingsHeld);
  const companiesWithMeetingsSet = new Set(
    heldAttendees.map(a => a.company_id).filter((id): id is number => id !== null)
  );
  let followUpsCreated = Math.round(companiesWithMeetingsSet.size * density.followUpRate);
  let followUpsCompleted = Math.round(followUpsCreated * density.completionRate);
  const touchpointsCount = Math.round(attendeePool.length * density.touchesPerCompany * 0.4);

  // Engaged companies derived from attendee pool
  const engagedCompanyIdsFromPool = new Set(
    attendeePool.map(a => a.company_id).filter((id): id is number => id !== null)
  );
  const engagedCompanies = allCompanies.filter(c => engagedCompanyIdsFromPool.has(c.id));
  const companiesEngagedCount = engagedCompanies.length;
  const engagedCompanyIds = engagedCompanies.map(c => c.id);

  // Net-new logos: engaged companies that have never appeared in any prior conference
  let netNewCount = 0;
  if (engagedCompanyIds.length > 0) {
    const nnPlaceholders = engagedCompanyIds.map(() => '?').join(',');
    const netNewRes = await client.execute({
      sql: `SELECT co.id FROM companies co
            WHERE co.id IN (${nnPlaceholders})
              AND co.id NOT IN (
                SELECT DISTINCT a2.company_id
                FROM attendees a2
                JOIN conference_attendees ca2 ON ca2.attendee_id = a2.id
                WHERE ca2.conference_id != ? AND a2.company_id IS NOT NULL
              )`,
      args: [...engagedCompanyIds, conferenceId],
    }).catch(() => ({ rows: [] as { id: unknown }[] }));
    netNewCount = Math.min(netNewRes.rows.length, engagedCompanyIds.length);
  }

  // Build attendee map by company (used in write path)
  const attendeesByCompany = new Map<number, AttendeeRow[]>();
  for (const att of allAttendees) {
    if (att.company_id) {
      const list = attendeesByCompany.get(att.company_id) ?? [];
      list.push(att);
      attendeesByCompany.set(att.company_id, list);
    }
  }

  const plan: SimulationPlan = {
    meetingsScheduled,
    meetingsHeld,
    meetingsWithOutcomes: meetingsScheduled,
    followUpsCreated,
    followUpsCompleted,
    touchpoints: touchpointsCount,
    companiesEngaged: companiesEngagedCount,
    netNewLogos: netNewCount,
  };

  const activitySummary = {
    targetRange: `${targetScoreMin}–${targetScoreMax}`,
    density: densityKey,
    coveragePct: Math.round(attendeeCoverage * 100),
    icpAttendeesTotal: icpMatchedAttendees.length,
    icpAttendeesTouched: attendeePool.length,
  };

  if (dryRun) {
    return { plan, activitySummary, written: false };
  }

  // ── Write records ───────────────────────────────────────────────────────────
  const confDates = conferenceDates(confStartDate, confEndDate);
  const today = new Date();
  const cappedEndDate = confDates[confDates.length - 1] > today ? today : confDates[confDates.length - 1];
  const effectiveEndDate = cappedEndDate;

  const outcomeDistribution: Array<{ outcome: string; note: string }> = [
    { outcome: meetingHeldValue, note: 'Strong interest indicated — next steps agreed.' },
    { outcome: meetingHeldValue, note: 'Strong interest indicated — next steps agreed.' },
    { outcome: meetingHeldValue, note: 'Strong interest indicated — next steps agreed.' },
    { outcome: meetingHeldValue, note: 'Strong interest indicated — next steps agreed.' },
    { outcome: meetingHeldValue, note: 'Further discovery needed — follow-up scheduled.' },
    { outcome: meetingHeldValue, note: 'Further discovery needed — follow-up scheduled.' },
    { outcome: meetingHeldValue, note: 'Further discovery needed — follow-up scheduled.' },
    { outcome: meetingHeldValue, note: 'Introductory conversation — relationship established.' },
    { outcome: meetingHeldValue, note: 'Introductory conversation — relationship established.' },
    { outcome: 'Not Interested', note: 'Not a fit at this time.' },
  ];

  const meetingRecords: Array<{
    attendeeId: number
    companyId: number
    companyName: string
    attendeeName: string
    attendeeFunction: string | null
    outcome: string
    outcomeNote: string
    repId: number
    repName: string
    timestamp: string
    isHeld: boolean
  }> = [];

  // Distribute meetings across companies and dates
  const repDayCount = new Map<string, number>(); // key: repId-dateStr

  let meetingIdx = 0;
  const perCompanyMeetings = Math.max(1, Math.round(meetingsScheduled / Math.max(companiesEngagedCount, 1)));

  const assignedAttendeeIds = new Set<number>();

  for (const company of engagedCompanies) {
    const atts = (attendeesByCompany.get(company.id) ?? []).slice(0, perCompanyMeetings);
    if (atts.length === 0) continue;

    for (let mi = 0; mi < Math.min(atts.length, perCompanyMeetings); mi++) {
      const availableAtts = atts.filter(a => !assignedAttendeeIds.has(a.id));
      if (availableAtts.length === 0) break;
      const att = availableAtts[0];
      assignedAttendeeIds.add(att.id);
      const dayIdx = meetingIdx % confDates.length;
      const confDay = confDates[dayIdx];

      // Cap to past dates
      const meetingDate = confDay > effectiveEndDate ? effectiveEndDate : confDay;
      const dateStr = meetingDate.toISOString().slice(0, 10);

      const repId = effectiveRepIds[meetingIdx % effectiveRepIds.length];
      const repKey = `${repId}-${dateStr}`;
      const dayCount = repDayCount.get(repKey) ?? 0;

      // Skip if rep already has 8 meetings that day
      if (dayCount >= 8) {
        meetingIdx++;
        continue;
      }
      repDayCount.set(repKey, dayCount + 1);

      const isHeld = meetingIdx < meetingsHeld;
      const outcome = isHeld
        ? outcomeDistribution[meetingIdx % outcomeDistribution.length]
        : { outcome: 'No Show', note: '' };

      const repName = repNames.get(repId) ?? 'Rep';
      const attendeeName = `${att.first_name} ${att.last_name}`.trim();

      meetingRecords.push({
        attendeeId: att.id,
        companyId: company.id,
        companyName: company.name,
        attendeeName,
        attendeeFunction: att.function,
        outcome: outcome.outcome,
        outcomeNote: outcome.note,
        repId,
        repName,
        timestamp: businessTimestamp(meetingDate, dayCount, 8),
        isHeld,
      });

      meetingIdx++;
    }
  }

  // Recompute follow-up counts based on actual companies with held meetings
  const companiesWithHeld = new Set(meetingRecords.filter(m => m.isHeld).map(m => m.companyId)).size;
  followUpsCreated = Math.round(companiesWithHeld * density.followUpRate);
  followUpsCompleted = Math.round(followUpsCreated * density.completionRate);

  // Write meetings
  const insertedMeetingIds: number[] = [];
  let meetingsWritten = 0;
  let notesMeetingIdx = 0;

  for (const m of meetingRecords) {
    const meetingDate = m.timestamp.slice(0, 10);
    const meetingTime = m.timestamp.slice(11, 19);
    const res = await client.execute({
      sql: `INSERT INTO meetings (attendee_id, conference_id, meeting_date, meeting_time, outcome, scheduled_by, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?)
            RETURNING id`,
      args: [m.attendeeId, conferenceId, meetingDate, meetingTime, m.outcome, m.repName, m.timestamp],
    }).catch(() => null);

    const meetingId = res?.rows?.[0]?.id != null ? Number(res.rows[0].id) : null;
    if (meetingId != null) {
      insertedMeetingIds.push(meetingId);
      meetingsWritten++;

      // Insert meeting notes for ~60% of held meetings
      if (m.isHeld && notesMeetingIdx % 5 < 3) {
        const productArea = 'solution';
        const functionArea = m.attendeeFunction ?? 'business';
        const noteText = `${m.repName} met with ${m.attendeeName} from ${m.companyName} at ${confName}. Discussion covered ${productArea} capabilities and alignment with their current ${functionArea} priorities. ${m.outcomeNote}`;
        await client.execute({
          sql: `INSERT INTO meeting_notes (meeting_id, notes_text, created_by, created_at)
                VALUES (?, ?, ?, ?)`,
          args: [meetingId, noteText, null, m.timestamp],
        }).catch(() => {});
      }
      notesMeetingIdx++;
    }
  }

  // Write follow-ups
  let followUpsWritten = 0;
  let fuIdx = 0;
  const nextStepsOptions = ['Schedule Follow Up Meeting', 'General Follow Up', 'Other'];

  for (const company of engagedCompanies) {
    if (fuIdx >= followUpsCreated) break;
    const atts = attendeesByCompany.get(company.id) ?? [];
    if (atts.length === 0) continue;
    const att = atts[0];

    const isCompleted = fuIdx < followUpsCompleted;
    const parentMeetingId = insertedMeetingIds[fuIdx] ?? null;

    // Follow-up date: conference_end + 2-10 days
    const fuDaysAfter = randInt(2, 10);
    const fuDate = addDays(confEndDate, fuDaysAfter);
    // Cap to today
    const fuTimestamp = toISOTimestamp(fuDate > today ? today : fuDate);

    const fuRepId = effectiveRepIds[fuIdx % effectiveRepIds.length];
    const fuRepName = repNames.get(fuRepId) ?? null;
    await client.execute({
      sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, assigned_rep, completed, meeting_id, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?)`,
      args: [att.id, conferenceId, nextStepsOptions[fuIdx % nextStepsOptions.length], fuRepName, isCompleted ? 1 : 0, parentMeetingId, fuTimestamp],
    }).catch(() => {});

    followUpsWritten++;
    fuIdx++;
  }

  // Write touchpoints
  let touchpointsWritten = 0;
  let tpIdx = 0;

  if (touchpointOptionId != null) {
    for (const company of engagedCompanies) {
      const tpPerCompany = Math.ceil(density.touchesPerCompany);
      for (let ti = 0; ti < tpPerCompany; ti++) {
        if (tpIdx >= touchpointsCount) break;
        const atts = attendeesByCompany.get(company.id) ?? [];
        if (atts.length === 0) continue;
        const att = atts[ti % atts.length];

        const dayIdx = tpIdx % confDates.length;
        const tpDate = confDates[dayIdx] > effectiveEndDate ? effectiveEndDate : confDates[dayIdx];
        const tpTimestamp = businessTimestamp(tpDate, ti, tpPerCompany);

        await client.execute({
          sql: `INSERT INTO attendee_touchpoints (attendee_id, conference_id, option_id, source, created_at)
                VALUES (?, ?, ?, 'simulated', ?)`,
          args: [att.id, conferenceId, touchpointOptionId, tpTimestamp],
        }).catch(() => {});

        touchpointsWritten++;
        tpIdx++;
      }
    }
  }

  return {
    plan,
    activitySummary,
    written: true,
    recordsWritten: {
      meetings: meetingsWritten,
      followUps: followUpsWritten,
      touchpoints: touchpointsWritten,
    },
  };
}
