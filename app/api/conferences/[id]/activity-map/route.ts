import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// ---------------------------------------------------------------------------
// Day-clamping — used only for touchpoints (and follow-ups with no linked
// meeting), since those timestamps can fall outside the conference's date
// range (logged early/late). Meetings are always positioned by their own
// scheduled day — they're inherently conference-scoped.
// ---------------------------------------------------------------------------
function resolveActivityDay(
  loggedAt: string,
  confStart: string,
  confEnd: string,
): { day: number; isApproximate: boolean } {
  const logged = new Date(loggedAt);
  const start = new Date(confStart + 'T00:00:00');
  const end = new Date(confEnd + 'T23:59:59');
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

  if (logged >= start && logged <= end) {
    const day = Math.floor((logged.getTime() - start.getTime()) / 86400000) + 1;
    return { day: Math.min(Math.max(day, 1), totalDays), isApproximate: false };
  }
  if (logged < start) return { day: 1, isApproximate: true };
  return { day: totalDays, isApproximate: true };
}

function splitIds(raw: unknown): string[] {
  if (!raw) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

function getRepInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

interface RawActivity {
  id: string;
  type: 'meeting' | 'touchpoint' | 'follow_up';
  day: number;
  isApproximate: boolean;
  companyId: number;
  companyName: string;
  contactName: string | null;
  contactTitle: string | null;
  timestamp: string;
  linkedActivityId?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const confRow = await db.execute({
    sql: 'SELECT id, name, start_date, end_date, internal_attendees FROM conferences WHERE id = ?',
    args: [confId],
  });
  if (confRow.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const conf = confRow.rows[0];
  const confName = String(conf.name);
  const confStart = String(conf.start_date);
  const confEnd = String(conf.end_date);
  const totalDays = Math.ceil(
    (new Date(confEnd + 'T00:00:00').getTime() - new Date(confStart + 'T00:00:00').getTime()) / 86400000,
  ) + 1;

  // ── Rep resolution ──────────────────────────────────────────────────────
  // internal_attendees stores comma-separated config_option VALUES (display
  // names) — same convention as the conference form and the effectiveness
  // route. Resolve each name to its config_option id so we can match
  // scheduled_by / assigned_rep / logged_by columns, which all store ids.
  const userConfigRows = await db.execute({
    sql: `SELECT id, value FROM config_options WHERE category = 'user'`,
    args: [],
  });
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  for (const r of userConfigRows.rows) {
    const idStr = String(r.id);
    const valStr = String(r.value ?? '');
    nameById.set(idStr, valStr);
    if (valStr) idByName.set(valStr.toLowerCase(), idStr);
  }

  const repNames = splitIds(conf.internal_attendees);
  // userId is synthetic (negative) for a rep name that doesn't resolve to a
  // config_option — keeps them visible in the UI (e.g. a typo'd name) with
  // an empty activity lane instead of silently disappearing.
  const reps: { userId: number; displayName: string; initials: string; configId: string | null }[] = [];
  let unresolvedCounter = -1;
  for (const name of repNames) {
    const configId = idByName.get(name.toLowerCase()) ?? null;
    reps.push({
      userId: configId ? Number(configId) : unresolvedCounter--,
      displayName: name,
      initials: getRepInitials(name),
      configId,
    });
  }
  const repByConfigId = new Map(reps.filter(r => r.configId).map(r => [r.configId as string, r]));

  // ── Meetings ─────────────────────────────────────────────────────────────
  const meetingRows = await db.execute({
    sql: `SELECT m.id, m.attendee_id, m.scheduled_by, m.meeting_date, m.meeting_time, m.outcome,
                 a.company_id, c.name AS company_name, a.first_name, a.last_name, a.title
          FROM meetings m
          JOIN attendees a ON m.attendee_id = a.id
          LEFT JOIN companies c ON a.company_id = c.id
          WHERE m.conference_id = ?`,
    args: [confId],
  });

  const heldOptRows = await db.execute({
    sql: `SELECT value FROM config_options WHERE category = 'action' AND action_key = 'meeting_held'`,
    args: [],
  });
  const heldOutcomeValues = new Set(heldOptRows.rows.map(r => String(r.value).toLowerCase()));

  let meetingsHeldCount = 0;
  const engagedCompanyIds = new Set<number>();
  // companyId -> set of rep config ids who met with that company (for inferred touchpoint attribution)
  const companyRepIds = new Map<number, Set<string>>();
  // activities keyed by rep config id (string) -> array
  const activitiesByRep = new Map<string, RawActivity[]>();
  // meetingId -> { repIds, day } for follow-up linkage
  const meetingDayById = new Map<number, { repIds: string[]; day: number }>();

  function pushActivity(repConfigId: string, act: RawActivity) {
    if (!activitiesByRep.has(repConfigId)) activitiesByRep.set(repConfigId, []);
    activitiesByRep.get(repConfigId)!.push(act);
  }

  for (const m of meetingRows.rows) {
    const meetingId = Number(m.id);
    const companyId = m.company_id != null ? Number(m.company_id) : null;
    const outcomeStr = m.outcome ? String(m.outcome).trim().toLowerCase() : '';
    const isHeld = heldOutcomeValues.has(outcomeStr);
    if (isHeld) meetingsHeldCount++;
    if (companyId != null && isHeld) engagedCompanyIds.add(companyId);

    const repIds = splitIds(m.scheduled_by);
    const meetingDate = String(m.meeting_date ?? confStart);
    const meetingTime = String(m.meeting_time ?? '00:00');
    const timestamp = `${meetingDate}T${meetingTime}`;
    const dayRaw = Math.floor(
      (new Date(meetingDate + 'T00:00:00').getTime() - new Date(confStart + 'T00:00:00').getTime()) / 86400000,
    ) + 1;
    const day = Math.min(Math.max(dayRaw, 1), totalDays);

    if (companyId != null && repIds.length > 0) {
      if (!companyRepIds.has(companyId)) companyRepIds.set(companyId, new Set());
      for (const rid of repIds) companyRepIds.get(companyId)!.add(rid);
    }

    meetingDayById.set(meetingId, { repIds, day });

    for (const repId of repIds) {
      if (!repByConfigId.has(repId)) continue;
      pushActivity(repId, {
        id: `meeting-${meetingId}`,
        type: 'meeting',
        day,
        isApproximate: false,
        companyId: companyId ?? 0,
        companyName: m.company_name ? String(m.company_name) : 'Unknown company',
        contactName: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || null,
        contactTitle: m.title ? String(m.title) : null,
        timestamp,
      });
    }
  }

  // ── Touchpoints ──────────────────────────────────────────────────────────
  const touchpointRows = await db.execute({
    sql: `SELECT atp.id, atp.attendee_id, atp.created_at, atp.logged_by,
                 a.company_id, c.name AS company_name, a.first_name, a.last_name, a.title
          FROM attendee_touchpoints atp
          JOIN attendees a ON atp.attendee_id = a.id
          LEFT JOIN companies c ON a.company_id = c.id
          WHERE atp.conference_id = ?`,
    args: [confId],
  });

  // touchpointId -> { repIds, day, isApproximate } for follow-up linkage
  const touchpointById = new Map<number, { repIds: string[]; day: number; isApproximate: boolean }>();

  let touchpointsCount = 0;
  for (const t of touchpointRows.rows) {
    touchpointsCount++;
    const tpId = Number(t.id);
    const companyId = t.company_id != null ? Number(t.company_id) : null;
    const createdAt = String(t.created_at ?? confStart);
    const { day, isApproximate } = resolveActivityDay(createdAt, confStart, confEnd);

    if (companyId != null) engagedCompanyIds.add(companyId);

    // Direct attribution when logged_by is set (post-migration data).
    // Otherwise infer: split credit across reps who had a meeting with this
    // company at this conference (same heuristic as the effectiveness route).
    const loggedByIds = splitIds(t.logged_by);
    const attributedRepIds = loggedByIds.length > 0
      ? loggedByIds
      : Array.from(companyId != null ? (companyRepIds.get(companyId) ?? new Set<string>()) : new Set<string>());

    touchpointById.set(tpId, { repIds: attributedRepIds, day, isApproximate });

    const baseActivity = {
      id: `touchpoint-${tpId}`,
      type: 'touchpoint' as const,
      day,
      isApproximate,
      companyId: companyId ?? 0,
      companyName: t.company_name ? String(t.company_name) : 'Unknown company',
      contactName: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || null,
      contactTitle: t.title ? String(t.title) : null,
      timestamp: createdAt,
    };

    for (const repId of attributedRepIds) {
      if (!repByConfigId.has(repId)) continue;
      pushActivity(repId, { ...baseActivity });
    }
  }

  // ── Follow-ups ───────────────────────────────────────────────────────────
  // Position a follow-up's dot under whichever activity created it:
  // follow_ups.touchpoint_id (most common path — auto-created when logging a
  // touchpoint) takes priority, falling back to follow_ups.meeting_id. Only
  // follow-ups created neither way fall back to their own created_at, clamped
  // the same way as touchpoints.
  const followUpRows = await db.execute({
    sql: `SELECT fu.id, fu.attendee_id, fu.assigned_rep, fu.created_at, fu.meeting_id, fu.touchpoint_id,
                 a.company_id, c.name AS company_name, a.first_name, a.last_name, a.title
          FROM follow_ups fu
          JOIN attendees a ON fu.attendee_id = a.id
          LEFT JOIN companies c ON a.company_id = c.id
          WHERE fu.conference_id = ?`,
    args: [confId],
  });

  let followUpsCount = 0;
  for (const f of followUpRows.rows) {
    followUpsCount++;
    const fuId = Number(f.id);
    const companyId = f.company_id != null ? Number(f.company_id) : null;
    const createdAt = String(f.created_at ?? confStart);
    const meetingId = f.meeting_id != null ? Number(f.meeting_id) : null;
    const touchpointId = f.touchpoint_id != null ? Number(f.touchpoint_id) : null;
    const linkedTouchpoint = touchpointId != null ? touchpointById.get(touchpointId) : undefined;
    const linkedMeeting = !linkedTouchpoint && meetingId != null ? meetingDayById.get(meetingId) : undefined;

    let day: number;
    let isApproximate: boolean;
    let linkedActivityId: string | undefined;
    let repIds = splitIds(f.assigned_rep);

    if (linkedTouchpoint) {
      day = linkedTouchpoint.day;
      isApproximate = linkedTouchpoint.isApproximate;
      linkedActivityId = `touchpoint-${touchpointId}`;
      if (repIds.length === 0) repIds = linkedTouchpoint.repIds;
    } else if (linkedMeeting) {
      day = linkedMeeting.day;
      isApproximate = false;
      linkedActivityId = `meeting-${meetingId}`;
      if (repIds.length === 0) repIds = linkedMeeting.repIds;
    } else {
      const resolved = resolveActivityDay(createdAt, confStart, confEnd);
      day = resolved.day;
      isApproximate = resolved.isApproximate;
    }

    for (const repId of repIds) {
      if (!repByConfigId.has(repId)) continue;
      pushActivity(repId, {
        id: `follow_up-${fuId}`,
        type: 'follow_up',
        day,
        isApproximate,
        companyId: companyId ?? 0,
        companyName: f.company_name ? String(f.company_name) : 'Unknown company',
        contactName: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || null,
        contactTitle: f.title ? String(f.title) : null,
        timestamp: createdAt,
        ...(linkedActivityId ? { linkedActivityId } : {}),
      });
    }
  }

  // ── First contact — earliest meeting/touchpoint per company, server-wide ─
  // (flagged regardless of which rep's lane it lands in)
  const firstContactByCompany = new Map<number, { activityId: string; timestamp: string }>();
  for (const [, acts] of Array.from(activitiesByRep.entries())) {
    for (const act of acts) {
      if (act.type !== 'meeting' && act.type !== 'touchpoint') continue;
      if (!act.companyId) continue;
      const cur = firstContactByCompany.get(act.companyId);
      if (!cur || new Date(act.timestamp).getTime() < new Date(cur.timestamp).getTime()) {
        firstContactByCompany.set(act.companyId, { activityId: act.id, timestamp: act.timestamp });
      }
    }
  }
  const firstContactActivityIds = new Set(
    Array.from(firstContactByCompany.values()).map(v => v.activityId),
  );

  // ── Assemble response ───────────────────────────────────────────────────
  const respReps = reps.map(r => {
    const acts = (r.configId ? activitiesByRep.get(r.configId) : undefined) ?? [];
    const meetingCount = acts.filter(a => a.type === 'meeting').length;
    const activities = acts.map(a => ({
      ...a,
      type: firstContactActivityIds.has(a.id) ? ('first_contact' as const) : a.type,
    }));
    return {
      userId: r.userId,
      displayName: r.displayName,
      initials: r.initials,
      meetingCount,
      activities,
    };
  });

  return NextResponse.json({
    conferenceId: confId,
    conferenceName: confName,
    startDate: confStart,
    endDate: confEnd,
    totalDays,
    summary: {
      meetingsHeld: meetingsHeldCount,
      touchpoints: touchpointsCount,
      companiesEngaged: engagedCompanyIds.size,
      followUpsCreated: followUpsCount,
    },
    reps: respReps,
  });
}
