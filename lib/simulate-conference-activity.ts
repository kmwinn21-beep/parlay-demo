import { createClient } from '@libsql/client';
import { db, dbReady } from '@/lib/db';

export type SimulationParams = {
  accountId: string
  conferenceId: number
  repIds: number[]
  meetingsHeld: number
  touchpoints: number
  followUpCompletionPct: number  // 0–100
  dryRun: boolean
  netNewMeetingsPct?: number     // 0–100, % of meetings allocated to net-new companies
  netNewTouchpointsPct?: number  // 0–100, % of touchpoints allocated to net-new companies
}

export type SimulationResult = {
  plan: {
    meetingsScheduled: number
    meetingsHeld: number
    meetingsNoShow: number
    followUpsCreated: number
    followUpsCompleted: number
    followUpsOpen: number
    touchpoints: number
    companiesEngaged: number
    netNewLogos: number
  }
  cesEstimate: {
    low: number
    high: number
  }
  written: boolean
  recordsWritten?: {
    meetings: number
    followUps: number
    touchpoints: number
  }
  warning?: string
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
  const minuteOffset = Math.floor((slotIndex / Math.max(totalSlots, 1)) * 600);
  const startMinute = 8 * 60 + minuteOffset;
  const h = Math.floor(startMinute / 60);
  const m = startMinute % 60;
  const d = new Date(date);
  d.setUTCHours(h, m, 0, 0);
  return toISOTimestamp(d);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distributeWeighted(total: number, count: number): number[] {
  if (count === 0 || total === 0) return [];
  const weights = Array.from({ length: count }, () => Math.random() + 0.1);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const normalized = weights.map(w => w / weightSum);
  const floored = normalized.map(w => Math.floor(w * total));
  let remainder = total - floored.reduce((s, v) => s + v, 0);
  const indices = Array.from({ length: count }, (_, i) => i)
    .sort(() => Math.random() - 0.5);
  for (let i = 0; i < remainder; i++) {
    floored[indices[i % count]]++;
  }
  return floored;
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
    repIds,
    meetingsHeld: meetingsHeldParam,
    touchpoints: touchpointsParam,
    followUpCompletionPct,
    dryRun,
    netNewMeetingsPct = 0,
    netNewTouchpointsPct = 0,
  } = params;

  const followUpsCreated = meetingsHeldParam + touchpointsParam;
  const followUpsCompleted = Math.round(followUpsCreated * (followUpCompletionPct / 100));
  const followUpsOpen = followUpsCreated - followUpsCompleted;
  const meetingsScheduled = Math.round(meetingsHeldParam / 0.85);
  const meetingsNoShow = meetingsScheduled - meetingsHeldParam;

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

  const confRes = await client.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date,
                 co.action_key AS strategy_key,
                 cb.required_pipeline_amount,
                 COALESCE((
                   SELECT SUM(COALESCE(NULLIF(CAST(json_extract(li.value,'$.actual') AS REAL),0),
                                       CAST(json_extract(li.value,'$.budget') AS REAL),0))
                   FROM json_each(cb.line_items) li
                 ), 0) AS total_cost
          FROM conferences c
          LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
          LEFT JOIN conference_budget cb ON cb.conference_id = c.id
          WHERE c.id = ?`,
    args: [conferenceId],
  });
  if (!confRes.rows[0]) throw new Error(`Conference ${conferenceId} not found`);
  const conf = confRes.rows[0];
  const confName = String(conf.name);
  const confStartDate = String(conf.start_date);
  const confEndDate = String(conf.end_date);
  const requiredPipelineAmount = conf.required_pipeline_amount != null ? Number(conf.required_pipeline_amount) : null;
  const totalCost = conf.total_cost != null ? Number(conf.total_cost) : null;

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

  const icpCompanyIdSet = new Set(allCompanies.filter(c => c.icp === 'Yes').map(c => c.id));
  const totalIcpCompanies = icpCompanyIdSet.size;
  const totalCompanies = allCompanies.length;

  const targetsRes = await client.execute({
    sql: `SELECT DISTINCT a.company_id
          FROM conference_targets ct
          JOIN attendees a ON a.id = ct.attendee_id
          WHERE ct.conference_id = ? AND a.company_id IS NOT NULL`,
    args: [conferenceId],
  }).catch(() => ({ rows: [] as { company_id: unknown }[] }));
  const totalTargets = targetsRes.rows.length;

  const configRes = await client.execute({
    sql: `SELECT id, category, value, action_key FROM config_options WHERE (action_key = 'meeting_held' AND category = 'action') OR category = 'touchpoints' OR category = 'next_steps' ORDER BY sort_order`,
    args: [],
  });
  let meetingHeldValue = 'Held';
  let touchpointOptionId: number | null = null;
  const nextStepsIds: number[] = [];
  for (const r of configRes.rows) {
    if (String(r.action_key) === 'meeting_held') {
      meetingHeldValue = String(r.value);
    }
    if (String(r.category) === 'touchpoints' && touchpointOptionId === null) {
      touchpointOptionId = Number(r.id);
    }
    if (String(r.category) === 'next_steps') {
      nextStepsIds.push(Number(r.id));
    }
  }

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

  // Attendee selection
  const icpMatchedAttendees = allAttendees.filter(a => a.company_id != null && icpCompanyIdSet.has(a.company_id));

  // Identify previously-engaged companies: any company whose attendees have real (non-simulated)
  // meetings, follow-ups, or touchpoints anywhere in the system. No conference scoping — if a
  // company has any prior activity at all, it is not net-new.
  const prevEngagedRes = await client.execute({
    sql: `SELECT DISTINCT a2.company_id
          FROM attendees a2
          WHERE a2.company_id IS NOT NULL
            AND (
              EXISTS (SELECT 1 FROM meetings m
                      WHERE m.attendee_id = a2.id AND m.source != 'simulated')
              OR EXISTS (SELECT 1 FROM follow_ups f
                         WHERE f.attendee_id = a2.id AND f.source != 'simulated')
              OR EXISTS (SELECT 1 FROM attendee_touchpoints t
                         WHERE t.attendee_id = a2.id)
            )`,
    args: [],
  }).catch(() => ({ rows: [] as { company_id: unknown }[] }));
  const previouslyEngagedCompanyIds = new Set(prevEngagedRes.rows.map(r => Number(r.company_id)));

  if (icpMatchedAttendees.length === 0) {
    const emptyPlan = {
      meetingsScheduled,
      meetingsHeld: meetingsHeldParam,
      meetingsNoShow,
      followUpsCreated,
      followUpsCompleted,
      followUpsOpen,
      touchpoints: touchpointsParam,
      companiesEngaged: 0,
      netNewLogos: 0,
    };
    return {
      plan: emptyPlan,
      cesEstimate: { low: 0, high: 0 },
      written: false,
      warning: 'No ICP-matched attendees found for this conference. Import an attendee list before running the simulation.',
    };
  }

  // Partition ICP attendees into net-new and returning pools
  const netNewIcpAttendees    = shuffle(icpMatchedAttendees.filter(a => !previouslyEngagedCompanyIds.has(a.company_id!)));
  const returningIcpAttendees = shuffle(icpMatchedAttendees.filter(a =>  previouslyEngagedCompanyIds.has(a.company_id!)));

  // Meetings: honour net-new % then fill remainder from returning (or overflow back to net-new)
  const targetNetNewMeetings      = Math.min(Math.round(meetingsHeldParam * netNewMeetingsPct / 100), netNewIcpAttendees.length);
  const targetReturningMeetings   = Math.min(meetingsHeldParam - targetNetNewMeetings, returningIcpAttendees.length);
  const meetingOverflow           = meetingsHeldParam - targetNetNewMeetings - targetReturningMeetings;
  const meetingAttendees = shuffle([
    ...netNewIcpAttendees.slice(0, targetNetNewMeetings + Math.max(0, meetingOverflow)),
    ...returningIcpAttendees.slice(0, targetReturningMeetings),
  ]).slice(0, Math.min(meetingsHeldParam, icpMatchedAttendees.length));

  // Touchpoints: same pattern, prefer attendees not already in meeting list
  const meetingAttendeeIds = new Set(meetingAttendees.map(a => a.id));
  const netNewForTp    = shuffle(netNewIcpAttendees.filter(a => !meetingAttendeeIds.has(a.id)));
  const returningForTp = shuffle(returningIcpAttendees.filter(a => !meetingAttendeeIds.has(a.id)));
  const targetNetNewTp    = Math.min(Math.round(touchpointsParam * netNewTouchpointsPct / 100), netNewForTp.length);
  const targetReturningTp = Math.min(touchpointsParam - targetNetNewTp, returningForTp.length);
  const tpOverflow        = touchpointsParam - targetNetNewTp - targetReturningTp;
  const touchpointAttendees = shuffle([
    ...netNewForTp.slice(0, targetNetNewTp + Math.max(0, tpOverflow)),
    ...returningForTp.slice(0, targetReturningTp),
    // if still short, allow overlap with meeting attendees
    ...shuffle(icpMatchedAttendees).slice(0, Math.max(0, touchpointsParam - targetNetNewTp - targetReturningTp - tpOverflow)),
  ]).slice(0, touchpointsParam);

  const engagedCompanyIdsSet = new Set<number>();
  for (const a of meetingAttendees) {
    if (a.company_id != null) engagedCompanyIdsSet.add(a.company_id);
  }
  const companiesEngaged = engagedCompanyIdsSet.size;
  const engagedCompanyIds = Array.from(engagedCompanyIdsSet);

  // Net-new logos — companies engaged here that were never previously engaged (engagement-based)
  const netNewCount = Math.min(
    engagedCompanyIds.filter(id => !previouslyEngagedCompanyIds.has(id)).length,
    companiesEngaged,
  );

  // CES estimation
  const cesEstimate = estimateCESRange({
    meetingAttendees,
    meetingsHeld: meetingsHeldParam,
    meetingsScheduled,
    followUpsCreated,
    followUpCompletionPct,
    totalIcpCompanies,
    totalTargets,
    totalCompanies,
    companiesEngaged,
    netNewCount,
    requiredPipelineAmount,
    totalCost,
  });

  const plan = {
    meetingsScheduled,
    meetingsHeld: meetingsHeldParam,
    meetingsNoShow,
    followUpsCreated,
    followUpsCompleted,
    followUpsOpen,
    touchpoints: touchpointsParam,
    companiesEngaged,
    netNewLogos: netNewCount,
  };

  if (dryRun) {
    return { plan, cesEstimate, written: false };
  }

  // Write records
  const confDates = conferenceDates(confStartDate, confEndDate);
  const today = new Date();
  const lastConfDate = confDates[confDates.length - 1];
  const effectiveEndDate = lastConfDate > today ? today : lastConfDate;

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

  // Rep distribution for meetings (random weighted)
  const meetingRepDist = distributeWeighted(meetingAttendees.length, effectiveRepIds.length);
  const meetingRepAssignments: number[] = [];
  for (let ri = 0; ri < effectiveRepIds.length; ri++) {
    for (let j = 0; j < meetingRepDist[ri]; j++) {
      meetingRepAssignments.push(effectiveRepIds[ri]);
    }
  }
  const shuffledMeetingReps = shuffle(meetingRepAssignments);

  // Rep distribution for touchpoints (re-randomize)
  const tpRepDist = distributeWeighted(touchpointAttendees.length, effectiveRepIds.length);
  const tpRepAssignments: number[] = [];
  for (let ri = 0; ri < effectiveRepIds.length; ri++) {
    for (let j = 0; j < tpRepDist[ri]; j++) {
      tpRepAssignments.push(effectiveRepIds[ri]);
    }
  }
  const shuffledTpReps = shuffle(tpRepAssignments);

  const attendeesByCompany = new Map<number, AttendeeRow[]>();
  for (const att of allAttendees) {
    if (att.company_id) {
      const list = attendeesByCompany.get(att.company_id) ?? [];
      list.push(att);
      attendeesByCompany.set(att.company_id, list);
    }
  }

  // Write meetings
  const insertedMeetingIds: number[] = [];
  let meetingsWritten = 0;
  let notesMeetingIdx = 0;
  const repDayCount = new Map<string, number>();

  for (let mi = 0; mi < meetingAttendees.length; mi++) {
    const att = meetingAttendees[mi];
    const repId = shuffledMeetingReps[mi] ?? effectiveRepIds[0];
    const repName = repNames.get(repId) ?? 'Rep';

    const dayIdx = mi % confDates.length;
    const confDay = confDates[dayIdx];
    const meetingDate = confDay > effectiveEndDate ? effectiveEndDate : confDay;
    const dateStr = meetingDate.toISOString().slice(0, 10);
    const repKey = `${repId}-${dateStr}`;
    const dayCount = repDayCount.get(repKey) ?? 0;

    if (dayCount >= 8) continue;
    repDayCount.set(repKey, dayCount + 1);

    const isHeld = mi < meetingsHeldParam;
    const outcome = isHeld
      ? outcomeDistribution[mi % outcomeDistribution.length]
      : { outcome: 'No Show', note: '' };

    const timestamp = businessTimestamp(meetingDate, dayCount, 8);
    const meetingDateStr = timestamp.slice(0, 10);
    const meetingTime = timestamp.slice(11, 19);

    const scheduledBy = repId > 0 ? String(repId) : null;
    const res = await client.execute({
      sql: `INSERT INTO meetings (attendee_id, conference_id, meeting_date, meeting_time, outcome, scheduled_by, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?)
            RETURNING id`,
      args: [att.id, conferenceId, meetingDateStr, meetingTime, outcome.outcome, scheduledBy, timestamp],
    }).catch(() => null);

    const meetingId = res?.rows?.[0]?.id != null ? Number(res.rows[0].id) : null;
    if (meetingId != null) {
      insertedMeetingIds.push(meetingId);
      meetingsWritten++;

      if (isHeld && notesMeetingIdx % 5 < 3) {
        const functionArea = att.function ?? 'business';
        const attendeeName = `${att.first_name} ${att.last_name}`.trim();
        const companyName = allCompanies.find(c => c.id === att.company_id)?.name ?? '';
        const noteText = `${repName} met with ${attendeeName} from ${companyName} at ${confName}. Discussion covered solution capabilities and alignment with their current ${functionArea} priorities. ${outcome.note}`;
        await client.execute({
          sql: `INSERT INTO meeting_notes (meeting_id, notes_text, created_by, created_at)
                VALUES (?, ?, ?, ?)`,
          args: [meetingId, noteText, null, timestamp],
        }).catch(() => {});
      }
      notesMeetingIdx++;
    }
  }

  // Write follow-ups (one per meeting held, then per touchpoint, up to followUpsCreated)
  let followUpsWritten = 0;
  const nextStepsOptions = ['Schedule Follow Up Meeting', 'General Follow Up', 'Other']; // fallback labels if config not loaded

  for (let fuIdx = 0; fuIdx < followUpsCreated; fuIdx++) {
    const isMeetingFu = fuIdx < meetingAttendees.length;
    let att: AttendeeRow | undefined;
    let parentMeetingId: number | null = null;
    let fuRepId: number;

    if (isMeetingFu) {
      att = meetingAttendees[fuIdx];
      parentMeetingId = insertedMeetingIds[fuIdx] ?? null;
      fuRepId = shuffledMeetingReps[fuIdx] ?? effectiveRepIds[0];
    } else {
      const tpIdx = fuIdx - meetingAttendees.length;
      att = touchpointAttendees[tpIdx % Math.max(touchpointAttendees.length, 1)];
      fuRepId = shuffledTpReps[tpIdx % Math.max(shuffledTpReps.length, 1)] ?? effectiveRepIds[0];
    }

    if (!att) continue;

    const isCompleted = fuIdx < followUpsCompleted;
    const fuDaysAfter = randInt(2, 10);
    const fuDate = addDays(confEndDate, fuDaysAfter);
    const fuTimestamp = toISOTimestamp(fuDate > today ? today : fuDate);
    const fuAssignedRep = fuRepId > 0 ? String(fuRepId) : null;
    const fuNextStepsId = nextStepsIds.length > 0
      ? String(nextStepsIds[fuIdx % nextStepsIds.length])
      : nextStepsOptions[fuIdx % nextStepsOptions.length];

    await client.execute({
      sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, assigned_rep, completed, meeting_id, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?)`,
      args: [att.id, conferenceId, fuNextStepsId, fuAssignedRep, isCompleted ? 1 : 0, parentMeetingId, fuTimestamp],
    }).catch(() => {});

    followUpsWritten++;
  }

  // Write touchpoints
  let touchpointsWritten = 0;

  if (touchpointOptionId != null) {
    for (let tpIdx = 0; tpIdx < touchpointAttendees.length; tpIdx++) {
      const att = touchpointAttendees[tpIdx];
      const dayIdx = tpIdx % confDates.length;
      const tpDay = confDates[dayIdx];
      const tpDate = tpDay > effectiveEndDate ? effectiveEndDate : tpDay;
      const tpTimestamp = businessTimestamp(tpDate, tpIdx % 8, 8);

      await client.execute({
        sql: `INSERT INTO attendee_touchpoints (attendee_id, conference_id, option_id, source, created_at)
              VALUES (?, ?, ?, 'simulated', ?)`,
        args: [att.id, conferenceId, touchpointOptionId, tpTimestamp],
      }).catch(() => {});

      touchpointsWritten++;
    }
  }

  return {
    plan,
    cesEstimate,
    written: true,
    recordsWritten: {
      meetings: meetingsWritten,
      followUps: followUpsWritten,
      touchpoints: touchpointsWritten,
    },
  };
}

type CESRangeParams = {
  meetingAttendees: AttendeeRow[]
  meetingsHeld: number
  meetingsScheduled: number
  followUpsCreated: number
  followUpCompletionPct: number
  totalIcpCompanies: number
  totalTargets: number
  totalCompanies: number
  companiesEngaged: number
  netNewCount: number
  requiredPipelineAmount: number | null
  totalCost: number | null
}

function estimateCESRange(p: CESRangeParams): { low: number; high: number } {
  const icpCompanyIds = new Set(p.meetingAttendees.map(a => a.company_id).filter((id): id is number => id !== null));

  // Dim1 — ICP & Target Quality
  const icpEngagementRate = Math.min(icpCompanyIds.size / Math.max(p.totalIcpCompanies, 1), 1);
  const targetEngagementRate = Math.min(icpCompanyIds.size / Math.max(p.totalTargets, 1), 1);
  const dim1 = ((icpEngagementRate + targetEngagementRate) / 2) * 100;

  // Dim2 — Meeting Execution
  const holdRate = p.meetingsHeld / Math.max(p.meetingsScheduled, 1);
  const fuSchedulingRate = Math.min(p.followUpsCreated / Math.max(icpCompanyIds.size, 1), 1);
  const dim2 = ((holdRate + fuSchedulingRate) / 2) * 100;

  // Dim4 — Engagement Breadth
  const dim4 = Math.min(icpCompanyIds.size / Math.max(p.totalCompanies, 1), 1) * 100;

  // Dim5 — Follow-up Execution
  const dim5 = p.followUpCompletionPct;

  // Dim6 — Net-New Logos
  const dim6 = p.companiesEngaged > 0
    ? Math.min((p.netNewCount / p.companiesEngaged) * 100, 100)
    : 0;

  // Pipeline target availability
  const hasPipelineTarget = p.requiredPipelineAmount != null || (p.totalCost != null && p.totalCost > 0);

  // Optimistic vs conservative for uncertain dims
  // Dim3 — Pipeline Influence: optimistic 70, conservative 0 (unknown without actual pipeline data)
  const dim3Optimistic = hasPipelineTarget ? 50 : 70;
  const dim3Conservative = 0;

  // Dim7 — Cost Efficiency: optimistic 75, conservative 50
  const dim7Optimistic = 75;
  const dim7Conservative = 50;

  // Weights (from CES formula): dim1=0.20, dim2=0.20, dim3=0.30, dim4=0.05, dim5=0.10, dim6=0.05, dim7=0.10
  // If no pipeline target, redistribute dim3's 0.30 proportionally to others
  let w1 = 0.20, w2 = 0.20, w3 = 0.30, w4 = 0.05, w5 = 0.10, w6 = 0.05, w7 = 0.10;

  if (!hasPipelineTarget) {
    const redistributed = w3;
    w3 = 0;
    const otherSum = w1 + w2 + w4 + w5 + w6 + w7;
    const scale = (otherSum + redistributed) / otherSum;
    w1 *= scale; w2 *= scale; w4 *= scale; w5 *= scale; w6 *= scale; w7 *= scale;
  }

  const cesOptimistic = Math.min(100, Math.round(
    dim1 * w1 + dim2 * w2 + dim3Optimistic * w3 + dim4 * w4 + dim5 * w5 + dim6 * w6 + dim7Optimistic * w7
  ));

  const cesConservative = Math.min(100, Math.round(
    dim1 * w1 + dim2 * w2 + dim3Conservative * w3 + dim4 * w4 + dim5 * w5 + dim6 * w6 + dim7Conservative * w7
  ));

  return {
    low: Math.min(cesConservative, cesOptimistic),
    high: Math.max(cesConservative, cesOptimistic),
  };
}
