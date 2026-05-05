import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getIcpConfig, evaluateIcpRules } from '@/lib/icpRules';
import { classifySeniority } from '@/lib/parsers';
import { computePreConferenceStrategyAssessment } from '@/lib/preConferenceStrategy';

function uniqueNumbers(arr: (number | null | undefined)[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of arr) {
    if (v != null && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

function parseIdList(raw: unknown): number[] {
  if (!raw) return [];
  return String(raw).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  const confRow = await db.execute({
    sql: 'SELECT id, name, start_date, end_date, location, internal_attendees FROM conferences WHERE id = ?',
    args: [confId],
  });
  if (confRow.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const conference = confRow.rows[0];

  const [attendeesRes, meetingsRes, socialRes, followUpsRes, icpConfig, actionOptsRes, productColorsRes] = await Promise.all([
    db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.email, a.status, a.seniority,
                   a.company_id, a.products, a."function",
                   c.name as company_name, c.company_type, c.icp, c.wse,
                   c.profit_type, c.entity_structure, c.services, c.website,
                   c.status as company_status, c.assigned_user as company_assigned_user
            FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id AND ca.conference_id = ?
            LEFT JOIN companies c ON a.company_id = c.id
            ORDER BY a.last_name, a.first_name`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT m.id, m.attendee_id, m.conference_id, m.meeting_date, m.meeting_time,
                   m.location, m.scheduled_by, m.outcome, m.meeting_type,
                   a.first_name, a.last_name, a.title,
                   c.name as company_name, c.id as company_id
            FROM meetings m
            JOIN attendees a ON m.attendee_id = a.id
            LEFT JOIN companies c ON a.company_id = c.id
            WHERE m.conference_id = ?
            ORDER BY m.meeting_date, m.meeting_time`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT se.id, se.event_type, se.event_name, se.host, se.location,
                   se.event_date, se.event_time, se.invite_only, se.notes,
                   se.internal_attendees, se.prospect_attendees
            FROM social_events se
            WHERE se.conference_id = ?
            ORDER BY se.event_date, se.event_time`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT f.id, f.attendee_id, f.conference_id, f.assigned_rep, f.completed,
                   COALESCE(co.value, f.next_steps) as next_steps
            FROM follow_ups f
            LEFT JOIN config_options co ON co.id = CAST(f.next_steps AS INTEGER) AND co.category = 'next_steps'
            WHERE f.conference_id = ?`,
      args: [confId],
    }),
    getIcpConfig(),
    db.execute({ sql: `SELECT value, action_key FROM config_options WHERE category = 'action'`, args: [] }),
    db.execute({ sql: `SELECT value, color FROM config_options WHERE category = 'products'`, args: [] }),
  ]);

  const attendees = attendeesRes.rows;
  const meetings = meetingsRes.rows;
  const socialEvents = socialRes.rows;
  const followUps = followUpsRes.rows;

  const productColorMap = new Map<string, string | null>();
  for (const r of productColorsRes.rows) {
    productColorMap.set(String(r.value), r.color ? String(r.color) : null);
  }

  const companyIds = uniqueNumbers(attendees.map((a) => a.company_id as number | null));

  const socialEventIds = uniqueNumbers(socialEvents.map((se) => se.id as number | null));

  const attendeeIds = attendees.map((a) => a.id);

  const [internalRelsRes, companyNotesRes, attendeeConfsRes, detailsRes, allUserOptsRes, relStatusOptsRes, socialRsvpsRes, xMeetingsRes, xFollowUpsRes, xSocialRes, xNotesRes, unitTypeRes, clientStatusRes, seniorityOptsRes] = await Promise.all([
    companyIds.length > 0
      ? db.execute({
          sql: `SELECT id, company_id, rep_ids, contact_ids, relationship_status, description
                FROM internal_relationships
                WHERE company_id IN (${companyIds.map(() => '?').join(',')})`,
          args: companyIds,
        })
      : Promise.resolve({ rows: [] }),
    companyIds.length > 0
      ? db.execute({
          sql: `SELECT id, entity_id as company_id, content, created_at, rep, attendee_name, conference_name
                FROM entity_notes
                WHERE entity_type = 'company' AND entity_id IN (${companyIds.map(() => '?').join(',')})
                ORDER BY created_at DESC`,
          args: companyIds,
        })
      : Promise.resolve({ rows: [] }),
    attendees.length > 0
      ? db.execute({
          sql: `SELECT ca.attendee_id, c.end_date, c.start_date, ca.conference_id
                FROM conference_attendees ca
                JOIN conferences c ON ca.conference_id = c.id
                WHERE ca.attendee_id IN (${attendees.map(() => '?').join(',')})
                ORDER BY c.start_date DESC`,
          args: attendees.map((a) => a.id),
        })
      : Promise.resolve({ rows: [] }),
    attendees.length > 0
      ? db.execute({
          sql: `SELECT cad.attendee_id, cad.conference_id, cad.action, cad.notes
                FROM conference_attendee_details cad
                WHERE cad.attendee_id IN (${attendees.map(() => '?').join(',')})`,
          args: attendees.map((a) => a.id),
        })
      : Promise.resolve({ rows: [] }),
    // All user config_options to resolve rep IDs → display names
    db.execute({ sql: `SELECT id, value FROM config_options WHERE category = 'user'`, args: [] }),
    // Relationship status config_options
    db.execute({ sql: `SELECT id, value FROM config_options WHERE category = 'rep_relationship_type'`, args: [] }),
    // Social event RSVPs with attendee details (for social events tab guest list)
    socialEventIds.length > 0
      ? db.execute({
          sql: `SELECT ser.social_event_id, ser.attendee_id, ser.rsvp_status,
                       a.first_name, a.last_name, a.title,
                       c.name as company_name, c.id as company_id, c.company_type, c.assigned_user
                FROM social_event_rsvps ser
                JOIN attendees a ON ser.attendee_id = a.id
                LEFT JOIN companies c ON a.company_id = c.id
                WHERE ser.social_event_id IN (${socialEventIds.map(() => '?').join(',')})`,
          args: socialEventIds,
        })
      : Promise.resolve({ rows: [] }),
    // Cross-conference meetings per attendee (for health score depth)
    attendeeIds.length > 0
      ? db.execute({
          sql: `SELECT m.attendee_id, m.conference_id,
                       COUNT(m.id) as meeting_count,
                       SUM(CASE WHEN m.outcome IS NOT NULL AND TRIM(m.outcome) != '' THEN 1 ELSE 0 END) as outcome_count
                FROM meetings m
                WHERE m.attendee_id IN (${attendeeIds.map(() => '?').join(',')})
                GROUP BY m.attendee_id, m.conference_id`,
          args: attendeeIds,
        })
      : Promise.resolve({ rows: [] }),
    // Cross-conference follow_ups per attendee (for health score completion + ghost)
    attendeeIds.length > 0
      ? db.execute({
          sql: `SELECT f.attendee_id, f.conference_id,
                       COUNT(f.id) as total_fus,
                       SUM(CASE WHEN f.completed = 1 THEN 1 ELSE 0 END) as completed_fus
                FROM follow_ups f
                WHERE f.attendee_id IN (${attendeeIds.map(() => '?').join(',')})
                GROUP BY f.attendee_id, f.conference_id`,
          args: attendeeIds,
        })
      : Promise.resolve({ rows: [] }),
    // Cross-conference social_event_rsvps 'attending' per attendee (for health score depth + ghost)
    attendeeIds.length > 0
      ? db.execute({
          sql: `SELECT ser.attendee_id, se.conference_id
                FROM social_event_rsvps ser
                JOIN social_events se ON ser.social_event_id = se.id
                WHERE ser.attendee_id IN (${attendeeIds.map(() => '?').join(',')})
                  AND ser.rsvp_status LIKE '%attending%'
                GROUP BY ser.attendee_id, se.conference_id`,
          args: attendeeIds,
        })
      : Promise.resolve({ rows: [] }),
    // Cross-conference entity_notes per attendee (for health score depth + ghost)
    attendeeIds.length > 0
      ? db.execute({
          sql: `SELECT en.entity_id as attendee_id, c.id as conference_id
                FROM entity_notes en
                JOIN conferences c ON c.name = en.conference_name
                WHERE en.entity_type = 'attendee'
                  AND en.entity_id IN (${attendeeIds.map(() => '?').join(',')})
                GROUP BY en.entity_id, c.id`,
          args: attendeeIds,
        })
      : Promise.resolve({ rows: [] }),
    db.execute({ sql: `SELECT value FROM config_options WHERE category = 'unit_type' LIMIT 1`, args: [] }),
    db.execute({ sql: `SELECT value FROM config_options WHERE category = 'status' AND LOWER(TRIM(value)) LIKE '%client%'`, args: [] }),
    db.execute({ sql: `SELECT id, value FROM config_options WHERE category = 'seniority'`, args: [] }),
  ]);

  const internalRels = internalRelsRes.rows;
  const companyNotes = companyNotesRes.rows;

  // Build user ID → display name lookup
  const userNameMap = new Map<number, string>();
  for (const row of allUserOptsRes.rows) {
    userNameMap.set(row.id as number, String(row.value));
  }

  // Build seniority ID → display name lookup
  const seniorityMap = new Map<number, string>();
  for (const row of seniorityOptsRes.rows) {
    seniorityMap.set(row.id as number, String(row.value));
  }
  // Matches effectiveSeniority() from lib/parsers.ts — stored value wins (resolving numeric IDs
  // to labels where needed), otherwise infer from title via classifySeniority.
  const resolveSeniority = (raw: unknown, title?: unknown): string => {
    if (raw != null && raw !== '') {
      const stored = String(raw);
      const n = Number(stored);
      if (!isNaN(n) && seniorityMap.has(n)) return seniorityMap.get(n)!;
      return stored;
    }
    return classifySeniority(title != null ? String(title) : undefined);
  };

  // Build relationship_status ID → label lookup
  const relStatusMap = new Map<number, string>();
  for (const row of relStatusOptsRes.rows) {
    relStatusMap.set(row.id as number, String(row.value));
  }

  // Build action value → action_key lookup for depth scoring
  const actionKeyMap = new Map<string, string>();
  for (const row of actionOptsRes.rows) {
    if (row.action_key) actionKeyMap.set(String(row.value), String(row.action_key));
  }
  const MEETING_ACTION_KEYS = ['meeting_held', 'meeting_scheduled', 'rescheduled', 'cancelled', 'no_show'];

  function resolveIdList(raw: unknown, map: Map<number, string>): string | null {
    if (!raw) return null;
    const str = String(raw).trim();
    if (!str) return null;
    const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.every((p) => /^\d+$/.test(p))) {
      return parts.map((p) => map.get(parseInt(p, 10)) ?? p).join(', ');
    }
    return str;
  }

  function resolveUserIds(raw: unknown): string[] {
    return parseIdList(raw).map(id => userNameMap.get(id) ?? String(id));
  }

  // Build attendee conf history map
  const attendeeConfMap = new Map<number, Array<{ end_date: unknown; start_date: unknown; conference_id: unknown }>>();
  for (const row of attendeeConfsRes.rows) {
    const aid = row.attendee_id as number;
    if (!attendeeConfMap.has(aid)) attendeeConfMap.set(aid, []);
    attendeeConfMap.get(aid)!.push({ end_date: row.end_date, start_date: row.start_date, conference_id: row.conference_id });
  }

  const detailsMap = new Map<string, { action: unknown; notes: unknown }>();
  for (const row of detailsRes.rows) {
    detailsMap.set(`${row.attendee_id}_${row.conference_id}`, { action: row.action, notes: row.notes });
  }

  // Cross-conference health score lookup structures
  const xMeetingMap = new Map<string, { meeting_count: number; outcome_count: number }>();
  for (const row of xMeetingsRes.rows) {
    xMeetingMap.set(`${row.attendee_id}_${row.conference_id}`, {
      meeting_count: Number(row.meeting_count),
      outcome_count: Number(row.outcome_count),
    });
  }

  const xFollowUpMap = new Map<string, { total_fus: number; completed_fus: number }>();
  for (const row of xFollowUpsRes.rows) {
    xFollowUpMap.set(`${row.attendee_id}_${row.conference_id}`, {
      total_fus: Number(row.total_fus),
      completed_fus: Number(row.completed_fus),
    });
  }

  const xSocialSet = new Set<string>();
  for (const row of xSocialRes.rows) {
    xSocialSet.add(`${row.attendee_id}_${row.conference_id}`);
  }

  const xNotesSet = new Set<string>();
  for (const row of xNotesRes.rows) {
    xNotesSet.add(`${row.attendee_id}_${row.conference_id}`);
  }

  function calcAttendeeHealth(aid: number): number {
    const confs = attendeeConfMap.get(aid) ?? [];
    const totalConfs = confs.length;
    if (totalConfs === 0) return 0;

    let totalDepth = 0;
    let ghostCount = 0;
    let totalFus = 0;
    let completedFus = 0;

    for (const c of confs) {
      const key = `${aid}_${c.conference_id}`;
      const det = detailsMap.get(key);
      const meetData = xMeetingMap.get(key);
      const fuData = xFollowUpMap.get(key);

      const detailActions = (det?.action ? String(det.action) : '').split(',').map(s => s.trim()).filter(Boolean);
      const detailActionKeys = detailActions.map(v => actionKeyMap.get(v) ?? null).filter((k): k is string => k !== null);

      const hasMeetingHeld = detailActionKeys.some(k => k === 'meeting_held');
      const hasOutcome = hasMeetingHeld && (meetData?.outcome_count ?? 0) > 0;
      const hasNotes = xNotesSet.has(key) || (det?.notes != null && String(det.notes).trim().length > 0);
      const hasSocial = xSocialSet.has(key);
      const hasFu = (fuData?.total_fus ?? 0) > 0;
      const hasFuCompleted = (fuData?.completed_fus ?? 0) > 0;
      const hasTouchpoint = detailActions.length > 0 && detailActionKeys.some(k => !MEETING_ACTION_KEYS.includes(k));

      let d = 0;
      if (hasMeetingHeld) d += 25;
      if (hasOutcome) d += 20;
      if (hasNotes) d += 10;
      if (hasSocial) d += 20;
      if (hasFu && hasFuCompleted) d += 15;
      if (hasTouchpoint) d += 10;
      totalDepth += Math.min(100, d);

      if (!hasMeetingHeld && !hasNotes && !hasSocial && !hasFu) ghostCount++;

      if (fuData) {
        totalFus += fuData.total_fus;
        completedFus += fuData.completed_fus;
      }
    }

    const avgDepthScore = totalDepth / totalConfs;
    const followUpScore = totalFus > 0 ? (completedFus / totalFus) * 100 : 50;
    const ghostPenalty = (ghostCount / totalConfs) * 100;

    const rawScore = avgDepthScore * 0.60 + followUpScore * 0.30 - ghostPenalty * 0.10;
    return Math.round(Math.max(0, Math.min(100, rawScore)));
  }

  const attendeeHealthMap = new Map<number, number>();
  for (const a of attendees) {
    attendeeHealthMap.set(a.id as number, calcAttendeeHealth(a.id as number));
  }

  // ICP evaluation per company (using stored icp column which reflects admin settings)
  function isIcpCompany(a: typeof attendees[0]): boolean {
    const vals = {
      company_type: String(a.company_type || ''),
      entity_structure: String(a.entity_structure || ''),
      profit_type: String(a.profit_type || ''),
      services: String(a.services || ''),
      wse: String(a.wse ?? ''),
    };
    return evaluateIcpRules(vals, icpConfig) === 'Yes';
  }

  // --- Summary ---
  const totalAttendees = attendees.length;
  const totalCompanies = companyIds.length;
  const icpCompanyIdSet = new Set<number>();
  for (const a of attendees) {
    if (a.company_id && isIcpCompany(a)) icpCompanyIdSet.add(a.company_id as number);
  }
  const icpCount = icpCompanyIdSet.size;
  const meetingCount = meetings.length;
  const openFollowUps = followUps.filter((f) => !f.completed).length;
  const reps = conference.internal_attendees
    ? String(conference.internal_attendees).split(',').map((r: string) => r.trim()).filter(Boolean)
    : [];

  const summary = {
    conference: { id: conference.id, name: conference.name, start_date: conference.start_date, end_date: conference.end_date, location: conference.location },
    totalAttendees, totalCompanies, icpCount, meetingCount, openFollowUps, reps,
  };

  // --- Landscape ---
  const companyTypeCount: Record<string, number> = {};
  const seniorityCount: Record<string, number> = {};
  const wseCompanyIds = new Set<number>();
  for (const a of attendees) {
    const ct = String(a.company_type || 'Unknown');
    companyTypeCount[ct] = (companyTypeCount[ct] ?? 0) + 1;
    const sen = resolveSeniority(a.seniority, a.title);
    seniorityCount[sen] = (seniorityCount[sen] ?? 0) + 1;
    if (a.wse && a.company_id) wseCompanyIds.add(a.company_id as number);
  }


  // --- Client companies ---
  const unitTypeLabel = unitTypeRes.rows[0]?.value ? String(unitTypeRes.rows[0].value) : 'Units';
  const clientStatusSet = new Set(clientStatusRes.rows.map(r => String(r.value).toLowerCase().trim()));

  const clientCompanyMap = new Map<number, { companyId: number; companyName: string; wse: number | null; attendees: { id: number; firstName: string; lastName: string; title: string | null }[] }>();
  for (const a of attendees) {
    const companyId = a.company_id as number | null;
    if (!companyId) continue;
    const rawStatus = String(a.company_status || '');
    const hasClientStatus = rawStatus.split(',').some(s => clientStatusSet.has(s.trim().toLowerCase()));
    if (!hasClientStatus) continue;
    if (!clientCompanyMap.has(companyId)) {
      clientCompanyMap.set(companyId, {
        companyId,
        companyName: String(a.company_name || ''),
        wse: a.wse != null ? Number(a.wse) : null,
        attendees: [],
      });
    }
    clientCompanyMap.get(companyId)!.attendees.push({
      id: Number(a.id),
      firstName: String(a.first_name || ''),
      lastName: String(a.last_name || ''),
      title: a.title ? String(a.title) : null,
    });
  }
  const clientCompanies = Array.from(clientCompanyMap.values())
    .sort((a, b) => b.attendees.length - a.attendees.length || a.companyName.localeCompare(b.companyName))
    .map(co => ({ ...co, attendeeCount: co.attendees.length }));

  const landscape = {
    totalAttendees, totalCompanies, icpCount, wseCount: wseCompanyIds.size,
    companyTypeBreakdown: Object.entries(companyTypeCount).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    seniorityBreakdown: Object.entries(seniorityCount).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    clientCompanies,
    unitTypeLabel,
  };

  // --- ICP Companies (evaluated using icp rules, not stored column) ---
  const icpCompanyMap = new Map<number, { id: number; name: string; company_type: string | null; attendeeList: typeof attendees }>();
  for (const a of attendees) {
    if (!a.company_id || !isIcpCompany(a)) continue;
    const cid = a.company_id as number;
    if (!icpCompanyMap.has(cid)) {
      icpCompanyMap.set(cid, { id: cid, name: String(a.company_name || ''), company_type: (a.company_type as string) ?? null, attendeeList: [] });
    }
    icpCompanyMap.get(cid)!.attendeeList.push(a);
  }
  const icpCompanies: Array<{ id: number; name: string; company_type: string | null; avgHealth: number; assigned_user_names: string[]; attendees: Array<{ id: unknown; first_name: unknown; last_name: unknown; title: unknown; health: number }> }> = [];
  icpCompanyMap.forEach((c) => {
    const scores = c.attendeeList.map((a) => attendeeHealthMap.get(a.id as number) ?? 0);
    const avg = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    const assignedNames = resolveUserIds(c.attendeeList[0]?.company_assigned_user);
    icpCompanies.push({ id: c.id, name: c.name, company_type: c.company_type, avgHealth: avg, assigned_user_names: assignedNames, attendees: c.attendeeList.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, title: a.title, seniority: resolveSeniority(a.seniority, a.title), health: attendeeHealthMap.get(a.id as number) ?? 0 })) });
  });
  icpCompanies.sort((a, b) => b.avgHealth - a.avgHealth);

  // --- Meetings (with conflict detection) ---
  const meetingsByRep = new Map<string, typeof meetings>();
  for (const m of meetings) {
    const rep = String(m.scheduled_by || 'Unassigned');
    if (!meetingsByRep.has(rep)) meetingsByRep.set(rep, []);
    meetingsByRep.get(rep)!.push(m);
  }
  const conflictIds = new Set<number>();
  meetingsByRep.forEach((repMeetings) => {
    const sorted = repMeetings.filter((m) => m.meeting_date && m.meeting_time).slice().sort((a, b) =>
      `${a.meeting_date}T${a.meeting_time}`.localeCompare(`${b.meeting_date}T${b.meeting_time}`)
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].meeting_date === sorted[i + 1].meeting_date && sorted[i].meeting_time === sorted[i + 1].meeting_time) {
        conflictIds.add(sorted[i].id as number);
        conflictIds.add(sorted[i + 1].id as number);
      }
    }
  });
  const meetingsData = meetings.map((m) => ({
    id: m.id, attendee_id: m.attendee_id, meeting_date: m.meeting_date, meeting_time: m.meeting_time,
    location: m.location, scheduled_by: resolveIdList(m.scheduled_by, userNameMap) ?? (m.scheduled_by ? String(m.scheduled_by) : null), outcome: m.outcome, meeting_type: m.meeting_type,
    first_name: m.first_name, last_name: m.last_name, title: m.title,
    company_name: m.company_name, company_id: m.company_id, hasConflict: conflictIds.has(m.id as number),
  }));

  // --- Social Events ---
  // Build per-event guest list from RSVP rows
  const guestListByEvent = new Map<number, Array<{
    attendee_id: number; first_name: string; last_name: string; title: string | null;
    company_name: string | null; company_id: number | null; company_type: string | null;
    rsvp_status: string; assigned_user_names: string[];
  }>>();
  for (const row of socialRsvpsRes.rows) {
    const eid = Number(row.social_event_id);
    if (!guestListByEvent.has(eid)) guestListByEvent.set(eid, []);
    guestListByEvent.get(eid)!.push({
      attendee_id: Number(row.attendee_id),
      first_name: String(row.first_name),
      last_name: String(row.last_name),
      title: row.title ? String(row.title) : null,
      company_name: row.company_name ? String(row.company_name) : null,
      company_id: row.company_id != null ? Number(row.company_id) : null,
      company_type: row.company_type ? String(row.company_type) : null,
      rsvp_status: String(row.rsvp_status),
      assigned_user_names: resolveUserIds(row.assigned_user),
    });
  }

  const socialEventsData = socialEvents.map((se) => ({
    id: Number(se.id), event_type: se.event_type, event_name: se.event_name, host: se.host,
    location: se.location, event_date: se.event_date, event_time: se.event_time,
    invite_only: se.invite_only, notes: se.notes, internal_attendees: se.internal_attendees,
    attending_count: 0, declined_count: 0,
    guestList: guestListByEvent.get(Number(se.id)) ?? [],
  }));

  // --- By Rep ---
  // Build company detail map (one entry per company, full fields)
  const companyDetailMap = new Map<number, {
    profit_type: string | null; entity_structure: string | null; wse: number | null;
    services: string | null; icp: string | null; company_status: string | null;
    assigned_user_names: string[]; website: string | null; company_type: string | null; company_name: string;
  }>();
  for (const a of attendees) {
    const cid = a.company_id as number | null;
    if (!cid || companyDetailMap.has(cid)) continue;
    companyDetailMap.set(cid, {
      profit_type: (a.profit_type as string) ?? null,
      entity_structure: (a.entity_structure as string) ?? null,
      wse: a.wse != null ? Number(a.wse) : null,
      services: (a.services as string) ?? null,
      icp: (a.icp as string) ?? null,
      company_status: (a.company_status as string) ?? null,
      assigned_user_names: resolveUserIds(a.company_assigned_user),
      website: (a.website as string) ?? null,
      company_type: (a.company_type as string) ?? null,
      company_name: String(a.company_name || ''),
    });
  }

  // Build per-company internal_relationships with resolved rep names
  const companyRelsMap = new Map<number, Array<{ rep_names: string[]; relationship_status: string; description: string }>>();
  for (const rel of internalRels) {
    const cid = rel.company_id as number;
    if (!companyRelsMap.has(cid)) companyRelsMap.set(cid, []);
    companyRelsMap.get(cid)!.push({
      rep_names: resolveUserIds(rel.rep_ids),
      relationship_status: resolveIdList(rel.relationship_status, relStatusMap) ?? String(rel.relationship_status || ''),
      description: String(rel.description || ''),
    });
  }

  const repCompaniesMap = new Map<string, Set<number>>();
  for (const rel of internalRels) {
    for (const name of resolveUserIds(rel.rep_ids)) {
      if (!repCompaniesMap.has(name)) repCompaniesMap.set(name, new Set());
      repCompaniesMap.get(name)!.add(rel.company_id as number);
    }
  }
  for (const a of attendees) {
    for (const name of resolveUserIds(a.company_assigned_user)) {
      if (!repCompaniesMap.has(name)) repCompaniesMap.set(name, new Set());
      repCompaniesMap.get(name)!.add(a.company_id as number);
    }
  }

  const byRep: Array<{ rep: string; companies: Array<{ company_id: number; company_name: string; company_type: string | null; relationship_status: string | null; description: string | null; profit_type: string | null; entity_structure: string | null; wse: number | null; services: string | null; icp: string | null; company_status: string | null; assigned_user_names: string[]; website: string | null; internal_relationships: Array<{ rep_names: string[]; relationship_status: string; description: string }>; attendees: Array<{ id: unknown; first_name: unknown; last_name: unknown; title: unknown; status: unknown; health: number }>; notes: Array<{ id: unknown; content: unknown; created_at: unknown; rep: unknown; attendee_name: unknown; conference_name: unknown }> }> }> = [];
  repCompaniesMap.forEach((cids, rep) => {
    const repCompanies: typeof byRep[0]['companies'] = [];
    cids.forEach((cid) => {
      const compAttendees = attendees.filter((a) => a.company_id === cid);
      const rel = internalRels.find((r) => r.company_id === cid);
      const notes = companyNotes.filter((n) => n.company_id === cid);
      const detail = companyDetailMap.get(cid);
      repCompanies.push({
        company_id: cid,
        company_name: String(compAttendees[0]?.company_name ?? ''),
        company_type: (compAttendees[0]?.company_type as string) ?? null,
        relationship_status: rel ? (resolveIdList(rel.relationship_status, relStatusMap) ?? String(rel.relationship_status || '')) : null,
        description: (rel?.description as string) ?? null,
        profit_type: detail?.profit_type ?? null,
        entity_structure: detail?.entity_structure ?? null,
        wse: detail?.wse ?? null,
        services: detail?.services ?? null,
        icp: detail?.icp ?? null,
        company_status: detail?.company_status ?? null,
        assigned_user_names: detail?.assigned_user_names ?? [],
        website: detail?.website ?? null,
        internal_relationships: companyRelsMap.get(cid) ?? [],
        attendees: compAttendees.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, title: a.title, seniority: resolveSeniority(a.seniority, a.title), status: a.status, health: attendeeHealthMap.get(a.id as number) ?? 0 })),
        notes: notes.slice(0, 5).map((n) => ({ id: n.id, content: n.content, created_at: n.created_at, rep: n.rep, attendee_name: n.attendee_name, conference_name: n.conference_name })),
      });
    });
    byRep.push({ rep, companies: repCompanies });
  });

  // --- Relationships ---
  const relationshipsData = internalRels.map((rel) => {
    const cid = rel.company_id as number;
    const compAttendees = attendees.filter((a) => a.company_id === cid);
    const notes = companyNotes.filter((n) => n.company_id === cid);
    // Resolve contact_ids (attendee IDs) to names from the current conference attendees list
    const contactNames = parseIdList(rel.contact_ids).map((aid) => {
      const att = attendees.find((a) => (a.id as number) === aid);
      return att ? `${att.first_name} ${att.last_name}` : null;
    }).filter(Boolean) as string[];
    return {
      id: rel.id, company_id: cid,
      company_name: String(compAttendees[0]?.company_name ?? ''),
      relationship_status: resolveIdList(rel.relationship_status, relStatusMap) ?? String(rel.relationship_status ?? ''),
      description: String(rel.description ?? ''),
      rep_names: resolveUserIds(rel.rep_ids),
      contact_names: contactNames,
      attendees: compAttendees.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, title: a.title, seniority: resolveSeniority(a.seniority, a.title), health: attendeeHealthMap.get(a.id as number) ?? 0 })),
      recentNotes: notes.slice(0, 3).map((n) => ({ id: n.id, content: n.content, created_at: n.created_at, rep: n.rep })),
    };
  });

  // --- Product ICP: group attendees by product, then by company ---
  const productCompanyMap = new Map<string, Map<number, {
    companyId: number; companyName: string; assignedUserNames: string[];
    attendees: Array<{ id: number; firstName: string; lastName: string; title: string | null; function: string | null; seniority: string | null; health: number; assignedUserNames: string[] }>;
  }>>();
  for (const a of attendees) {
    const rawProducts = (a.products as string | null)?.trim();
    if (!rawProducts) continue;
    const products = rawProducts.split(',').map((s: string) => s.trim()).filter(Boolean);
    const cid = a.company_id as number | null;
    const companyName = String(a.company_name ?? '');
    const assignedNames = resolveUserIds(a.company_assigned_user);
    const attendeeEntry = {
      id: a.id as number,
      firstName: String(a.first_name ?? ''),
      lastName: String(a.last_name ?? ''),
      title: a.title ? String(a.title) : null,
      function: (a as Record<string, unknown>).function ? String((a as Record<string, unknown>).function) : null,
      seniority: resolveSeniority(a.seniority, a.title),
      health: attendeeHealthMap.get(a.id as number) ?? 0,
      assignedUserNames: assignedNames,
    };
    for (const product of products) {
      if (!productCompanyMap.has(product)) productCompanyMap.set(product, new Map());
      const compMap = productCompanyMap.get(product)!;
      const compKey = cid ?? -1;
      if (!compMap.has(compKey)) {
        compMap.set(compKey, { companyId: compKey, companyName, assignedUserNames: assignedNames, attendees: [] });
      }
      compMap.get(compKey)!.attendees.push(attendeeEntry);
    }
  }
  const productIcp = Array.from(productCompanyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([product, compMap]) => ({
      product,
      color: productColorMap.get(product) ?? null,
      companies: Array.from(compMap.values()).sort((a, b) => a.companyName.localeCompare(b.companyName)),
    }));


  const targetingCompanies: Array<Record<string, unknown>> = [];
  try {
    let offset = 0;
    while (true) {
      const params = new URLSearchParams({ batch: '1', offset: String(offset), limit: '50' });
      const targetingRes = await fetch(`${request.nextUrl.origin}/api/conferences/${confId}/targeting?${params.toString()}`, {
        headers: { cookie: request.headers.get('cookie') ?? '' },
        cache: 'no-store',
      });
      if (!targetingRes.ok) break;
      const targetingJson = await targetingRes.json() as { companies?: Array<Record<string, unknown>>; pagination?: { has_more?: boolean; next_offset?: number | null } };
      targetingCompanies.push(...(targetingJson.companies ?? []));
      if (!targetingJson.pagination?.has_more || targetingJson.pagination.next_offset == null) break;
      offset = targetingJson.pagination.next_offset;
    }
  } catch {
    // Fall through; assessment will use unavailable state when targeting data cannot be fetched.
  }

  const preConferenceStrategyAssessment = computePreConferenceStrategyAssessment({
    totalAttendees,
    totalCompanies,
    internalAttendeeCount: parseIdList(conference.internal_attendees).length,
    requiredPipelineAmount: null,
    totalBudget: null,
    scheduledMeetings: meetings.length,
    clientAttendeeCount: clientCompanies.reduce((sum, c) => sum + c.attendeeCount, 0),
    companyScores: targetingCompanies.map((company) => ({
      isIcp: Number(company.icp_fit_score ?? 0) >= 60,
      icpFit: company.icp_fit_score == null ? null : Number(company.icp_fit_score),
      targetPriorityScore: company.target_priority_score == null ? null : Number(company.target_priority_score),
      targetPriorityTier: String(company.target_priority_tier_key ?? company.target_priority_tier ?? 'low_priority').toLowerCase().replace(/\s+/g, '_'),
      buyerAccessScore: company.buyer_access_score == null ? null : Number(company.buyer_access_score),
      relationshipLeverageScore: company.relationship_leverage_score == null ? null : Number(company.relationship_leverage_score),
      conferenceOpportunityScore: company.conference_opportunity_score == null ? null : Number(company.conference_opportunity_score),
      titleNeedsReview: Boolean(company.title_review_summary && Number((company.title_review_summary as Record<string, unknown>).needs_review_count ?? 0) > 0),
      hasMeeting: Number(company.scheduled_meeting_count ?? 0) > 0,
      isCustomer: false,
      pipelineValue: null,
      recommendedActionKey: String((company.recommended_action as Record<string, unknown> | undefined)?.action_key ?? ''),
      highBuyerFitAttendeeCount: Array.isArray(company.top_attendees)
        ? (company.top_attendees as Array<Record<string, unknown>>).filter((a) => Number(a.buyer_fit_score ?? 0) >= 75).length
        : 0,
      confidenceLevel: company.confidence_level ? String(company.confidence_level) : null,
    })),
  });

  return NextResponse.json({ summary, landscape, icpCompanies, meetings: meetingsData, socialEvents: socialEventsData, byRep, relationships: relationshipsData, productIcp, pre_conference_strategy_assessment: preConferenceStrategyAssessment });
}
