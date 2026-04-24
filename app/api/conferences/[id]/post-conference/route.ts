import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContactRow {
  attendee_id: number; first_name: string; last_name: string;
  title: string | null; company_id: number | null; company_name: string | null;
  company_type: string | null; seniority: string | null; icp: string | null;
  assigned_user_names: string[]; firstSeenConference: string | null;
  priorConferenceCount: number; lastEngagementType: string | null;
  healthScore: number; healthDelta: number;
  meetingHeld: boolean; hasNotes: boolean;
}
interface MeetingRow {
  id: number; attendee_id: number; attendeeName: string; attendeeTitle: string | null;
  company_name: string | null; company_type: string | null; company_id: number | null;
  seniority: string | null; meeting_date: string | null; meeting_time: string | null;
  location: string | null; scheduled_by: string | null; outcome: string | null;
  meeting_type: string | null; isWalkIn: boolean;
  status: 'held' | 'no_show' | 'rescheduled' | 'cancelled';
}
interface FollowUpRow {
  id: number; attendee_id: number; attendeeName: string; attendeeTitle: string | null;
  company_name: string | null; company_id: number | null;
  next_steps: string | null; assigned_rep: string | null;
  completed: number; created_at: string | null;
  daysSinceConference: number; status: 'completed' | 'in_progress' | 'not_started';
}
interface RepPerformanceRow {
  repName: string; contactsCaptured: number; newlyEngaged: number;
  reEngagements: number; meetingsHeld: number; walkInMeetings: number;
  followUpsCreated: number; followUpsCompleted: number; followUpRate: number;
  companies: {
    company_id: number; company_name: string; company_type: string | null;
    icp: string | null; engagementType: string | null;
    followUpStatus: 'completed' | 'in_progress' | 'not_started' | 'none';
    healthDelta: number;
  }[];
}
interface RelationshipShiftRow {
  attendee_id: number; attendeeName: string;
  company_name: string | null; company_type: string | null;
  company_id: number | null; icp: string | null;
  assignedUsers: string[];
  priorConferenceCount: number; healthBefore: number; healthAfter: number;
  healthDelta: number; shiftReason: string;
  conferenceBreakdown: { label: string; points: number }[];
}
interface ActionItem {
  type: 'overdue_followup' | 'missing_outcome' | 'no_show' | 'ghost_penalty' | 'pipeline' | 'new_contact' | 'retrospective';
  priority: 'high' | 'medium' | 'low';
  title: string; description: string;
  repName: string | null; attendeeName: string | null; companyName: string | null;
}

// ── Health score helper ────────────────────────────────────────────────────────

const MEETING_ACTION_KEYS = ['meeting_held', 'meeting_scheduled', 'rescheduled', 'cancelled', 'no_show'];

function computeHealthScore(params: {
  attendeeConfs: number[];
  detailsByConf: Map<number, { action: string | null; notes: string | null }>;
  meetingsByConf: Map<number, { outcome: string | null }[]>;
  followUpsByConf: Map<number, { completed: number }[]>;
  noteCountByConf: Map<number, number>;
  socialByConf: Map<number, { rsvp_status: string }[]>;
  actionKeyMap: Map<string, string>;
  excludeConfId?: number;
}): number {
  const { attendeeConfs, detailsByConf, meetingsByConf, followUpsByConf,
    noteCountByConf, socialByConf, actionKeyMap, excludeConfId } = params;
  const confs = excludeConfId ? attendeeConfs.filter(c => c !== excludeConfId) : attendeeConfs;
  if (confs.length === 0) return 0;
  let totalDepth = 0, totalFus = 0, completedFus = 0, ghostCount = 0;
  for (const confId of confs) {
    const details = detailsByConf.get(confId);
    const meetings = meetingsByConf.get(confId) ?? [];
    const fus = followUpsByConf.get(confId) ?? [];
    const noteCount = noteCountByConf.get(confId) ?? 0;
    const social = socialByConf.get(confId) ?? [];
    const actionStr = details?.action ?? '';
    const actionVals = actionStr.split(',').map(s => s.trim()).filter(Boolean);
    const actionKeys = actionVals.map(v => actionKeyMap.get(v)).filter(Boolean) as string[];
    const hasMeetingHeld = actionKeys.includes('meeting_held');
    const meetingHasOutcome = hasMeetingHeld && meetings.some(m => m.outcome && String(m.outcome).trim().length > 0);
    const hasNotes = noteCount > 0 || (details?.notes != null && String(details.notes).trim().length > 0);
    const hasSocialAttending = social.some(e => String(e.rsvp_status).split(',').map(s => s.trim()).includes('attended'));
    const hasFus = fus.length > 0;
    const hasCompletedFu = fus.some(f => Number(f.completed) === 1);
    const hasTouchpoint = actionVals.length > 0 && actionKeys.some(k => !MEETING_ACTION_KEYS.includes(k));
    let depth = 0;
    if (hasMeetingHeld) depth += 25;
    if (meetingHasOutcome) depth += 20;
    if (hasNotes) depth += 10;
    if (hasSocialAttending) depth += 20;
    if (hasFus && hasCompletedFu) depth += 15;
    if (hasTouchpoint) depth += 10;
    depth = Math.min(100, depth);
    totalDepth += depth;
    totalFus += fus.length;
    completedFus += fus.filter(f => Number(f.completed) === 1).length;
    const isGhost = !hasMeetingHeld && !hasNotes && !hasSocialAttending && !hasFus;
    if (isGhost) ghostCount++;
  }
  const avgDepth = totalDepth / confs.length;
  const fuScore = totalFus > 0 ? (completedFus / totalFus) * 100 : 0;
  const ghostPenalty = (ghostCount / confs.length) * 100;
  return Math.round(Math.max(0, Math.min(100, avgDepth * 0.60 + fuScore * 0.30 - ghostPenalty * 0.10)));
}

// Resolved at route-init time once users are fetched
let userIdToName: Map<string, string> = new Map();

function resolveIds(raw: unknown): string[] {
  if (!raw) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean)
    .map(id => userIdToName.get(id) ?? id);
}

function resolveIdsSingle(raw: unknown): string | null {
  if (!raw) return null;
  const ids = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  return ids.map(id => userIdToName.get(id) ?? id).join(', ');
}

function splitIds(raw: unknown): string[] {
  if (!raw) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

// ── Route ─────────────────────────────────────────────────────────────────────

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
  const conf = confRow.rows[0];
  const confStartDate = String(conf.start_date);
  const confEndDate = String(conf.end_date);
  const confName = String(conf.name);
  const today = new Date();
  const daysSinceEnd = Math.floor((today.getTime() - new Date(confEndDate + 'T00:00:00').getTime()) / 86400000);

  // ── Resolve user IDs → display names ─────────────────────────────────────
  const usersRes = await db.execute({
    sql: `SELECT u.id, u.config_id, COALESCE(co.value, u.display_name, CAST(u.id AS TEXT)) as display_name
          FROM users u LEFT JOIN config_options co ON u.config_id = co.id`,
    args: [],
  });
  userIdToName = new Map<string, string>();
  for (const u of usersRes.rows) {
    const name = u.display_name ? String(u.display_name) : String(u.id);
    userIdToName.set(String(u.id), name);
    // Also map by config_options ID so scheduled_by/assigned_rep that store co.id resolve correctly
    if (u.config_id != null) userIdToName.set(String(u.config_id), name);
  }

  // ── Phase 1: attendees, config ────────────────────────────────────────────
  const [attendeesRes, actionOptsRes, unplannedTypeRes, confMeetingsRes, confFollowUpsRes, operatorTypeRes, eventAttendeesRes, formSubmissionsRes, confEntityNotesRes, confDetailsNotesRes] = await Promise.all([
    db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority,
                   a.company_id, c.name as company_name, c.company_type, c.icp,
                   c.assigned_user as company_assigned_user
            FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id AND ca.conference_id = ?
            LEFT JOIN companies c ON a.company_id = c.id
            ORDER BY a.last_name, a.first_name`,
      args: [confId],
    }),
    db.execute({ sql: `SELECT value, action_key FROM config_options WHERE category = 'action' AND action_key IS NOT NULL`, args: [] }),
    db.execute({ sql: `SELECT value FROM config_options WHERE category = 'meeting_type' AND LOWER(value) LIKE '%unplanned%' LIMIT 1`, args: [] }),
    db.execute({
      sql: `SELECT m.id, m.attendee_id, m.meeting_date, m.meeting_time, m.location,
                   m.scheduled_by, m.outcome, m.meeting_type, m.created_at
            FROM meetings m WHERE m.conference_id = ?`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT f.id, f.attendee_id, f.assigned_rep, f.completed, f.created_at,
                   COALESCE(co.value, f.next_steps) as next_steps
            FROM follow_ups f
            LEFT JOIN config_options co ON co.id = CAST(f.next_steps AS INTEGER) AND co.category = 'next_steps'
            WHERE f.conference_id = ?`,
      args: [confId],
    }),
    db.execute({ sql: `SELECT value FROM site_settings WHERE key = 'prior_overlap_company_type' LIMIT 1`, args: [] }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM social_event_rsvps r
            JOIN social_events se ON r.social_event_id = se.id
            WHERE se.conference_id = ? AND r.rsvp_status LIKE '%attended%'`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM form_submissions WHERE conference_id = ?`,
      args: [confId],
    }),
    // Notes logged — all attendees, not just operators
    db.execute({
      sql: `SELECT COUNT(*) as count FROM entity_notes
            WHERE conference_name = ? AND entity_type = 'attendee'`,
      args: [confName],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM conference_attendee_details
            WHERE conference_id = ? AND notes IS NOT NULL AND TRIM(notes) != ''`,
      args: [confId],
    }),
  ]);

  const operatorType = operatorTypeRes.rows[0]?.value ? String(operatorTypeRes.rows[0].value) : 'Operator';

  // Filter to operator-type attendees only
  const attendees = attendeesRes.rows.filter(a => {
    if (!a.company_type) return false;
    const types = String(a.company_type).split(',').map(s => s.trim().toLowerCase());
    return types.includes(operatorType.toLowerCase());
  });

  const actionKeyMap = new Map<string, string>();
  for (const r of actionOptsRes.rows) {
    if (r.value && r.action_key) actionKeyMap.set(String(r.value), String(r.action_key));
  }
  const unplannedValue = unplannedTypeRes.rows[0]?.value ? String(unplannedTypeRes.rows[0].value) : 'Unplanned';

  const attendeeIds = attendees.map(a => Number(a.id));
  // Use a sentinel that matches nothing when no operator attendees exist
  const idPlaceholders = attendeeIds.length > 0 ? attendeeIds.map(() => '?').join(',') : '-1';

  // ── Phase 2: full history for all attendees ────────────────────────────────
  const [allConfAttRes, allDetailsRes, allMeetingsRes, allFuRes, allNotesRes,
    allSocialRes, allConfsRes, confTouchpointsRes, confSocialEventsRes, confTouchpointRowsRes] = await Promise.all([
    db.execute({
      sql: `SELECT ca.attendee_id, ca.conference_id
            FROM conference_attendees ca
            WHERE ca.attendee_id IN (${idPlaceholders})`,
      args: attendeeIds,
    }),
    db.execute({
      sql: `SELECT attendee_id, conference_id, action, notes
            FROM conference_attendee_details
            WHERE attendee_id IN (${idPlaceholders})`,
      args: attendeeIds,
    }),
    db.execute({
      sql: `SELECT attendee_id, conference_id, outcome, created_at
            FROM meetings WHERE attendee_id IN (${idPlaceholders})`,
      args: attendeeIds,
    }),
    db.execute({
      sql: `SELECT attendee_id, conference_id, completed
            FROM follow_ups WHERE attendee_id IN (${idPlaceholders})`,
      args: attendeeIds,
    }),
    db.execute({
      sql: `SELECT en.entity_id as attendee_id, en.conference_name
            FROM entity_notes en
            JOIN conferences c ON c.name = en.conference_name
            WHERE en.entity_type = 'attendee' AND en.entity_id IN (${idPlaceholders})`,
      args: attendeeIds,
    }),
    db.execute({
      sql: `SELECT r.attendee_id, se.conference_id, r.rsvp_status
            FROM social_event_rsvps r
            JOIN social_events se ON r.social_event_id = se.id
            WHERE r.attendee_id IN (${idPlaceholders})`,
      args: attendeeIds,
    }),
    db.execute({ sql: `SELECT id, name, start_date FROM conferences ORDER BY start_date ASC`, args: [] }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM attendee_touchpoints WHERE conference_id = ?`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT id, event_type, event_name, host, location, event_date, event_time,
                   invite_only, notes, internal_attendees
            FROM social_events WHERE conference_id = ?
            ORDER BY event_date, event_time`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT at.attendee_id, a.first_name, a.last_name, a.title,
                   c.name as company_name, c.id as company_id,
                   co.id as option_id, co.value as option_value, co.color, COUNT(*) as cnt
            FROM attendee_touchpoints at
            JOIN attendees a ON a.id = at.attendee_id
            LEFT JOIN companies c ON c.id = a.company_id
            JOIN config_options co ON co.id = at.option_id
            WHERE at.conference_id = ?
            GROUP BY at.attendee_id, at.option_id
            ORDER BY a.last_name, a.first_name`,
      args: [confId],
    }),
  ]);

  // ── Social events for this conference ────────────────────────────────────
  const confSocialEventIds = confSocialEventsRes.rows.map(r => Number(r.id));
  let confSocialRsvpsRes: { rows: Record<string, unknown>[] } = { rows: [] };
  if (confSocialEventIds.length > 0) {
    const rsvpPh = confSocialEventIds.map(() => '?').join(',');
    confSocialRsvpsRes = await db.execute({
      sql: `SELECT ser.social_event_id, ser.attendee_id, ser.rsvp_status,
                   a.first_name, a.last_name, a.title,
                   c.name as company_name, c.id as company_id, c.company_type,
                   c.assigned_user
            FROM social_event_rsvps ser
            JOIN attendees a ON a.id = ser.attendee_id
            LEFT JOIN companies c ON c.id = a.company_id
            WHERE ser.social_event_id IN (${rsvpPh})`,
      args: confSocialEventIds,
    });
  }

  // Build guestList per event
  const guestListByEvent = new Map<number, Array<{
    attendee_id: number; first_name: string; last_name: string; title: string | null;
    company_name: string | null; company_id: number | null; company_type: string | null;
    rsvp_status: string; assigned_user_names: string[];
  }>>();
  for (const r of confSocialRsvpsRes.rows) {
    const eid = Number(r.social_event_id);
    if (!guestListByEvent.has(eid)) guestListByEvent.set(eid, []);
    guestListByEvent.get(eid)!.push({
      attendee_id: Number(r.attendee_id),
      first_name: String(r.first_name ?? ''),
      last_name: String(r.last_name ?? ''),
      title: r.title ? String(r.title) : null,
      company_name: r.company_name ? String(r.company_name) : null,
      company_id: r.company_id ? Number(r.company_id) : null,
      company_type: r.company_type ? String(r.company_type) : null,
      rsvp_status: String(r.rsvp_status ?? 'maybe'),
      assigned_user_names: resolveIds(r.assigned_user),
    });
  }

  const socialEventRows = confSocialEventsRes.rows.map(se => {
    const gl = guestListByEvent.get(Number(se.id)) ?? [];
    const statuses = gl.map(g => g.rsvp_status.split(',').map(s => s.trim()));
    return {
      id: Number(se.id),
      event_type: se.event_type ? String(se.event_type) : null,
      event_name: se.event_name ? String(se.event_name) : null,
      host: se.host ? String(se.host) : null,
      location: se.location ? String(se.location) : null,
      event_date: se.event_date ? String(se.event_date) : null,
      event_time: se.event_time ? String(se.event_time) : null,
      invite_only: se.invite_only ? String(se.invite_only) : null,
      notes: se.notes ? String(se.notes) : null,
      internal_attendees: se.internal_attendees ? String(se.internal_attendees) : null,
      attending_count: statuses.filter(s => s.includes('attended')).length,
      declined_count: statuses.filter(s => s.includes('no')).length,
      guestList: gl,
    };
  });

  // ── Touchpoints per attendee ──────────────────────────────────────────────
  const tpByAttendee = new Map<number, {
    attendee_id: number; first_name: string; last_name: string; title: string | null;
    company_name: string | null; company_id: number | null; totalCount: number;
    options: { option_id: number; value: string; color: string | null; count: number }[];
  }>();
  for (const r of confTouchpointRowsRes.rows) {
    const aid = Number(r.attendee_id);
    if (!tpByAttendee.has(aid)) {
      tpByAttendee.set(aid, {
        attendee_id: aid,
        first_name: String(r.first_name ?? ''),
        last_name: String(r.last_name ?? ''),
        title: r.title ? String(r.title) : null,
        company_name: r.company_name ? String(r.company_name) : null,
        company_id: r.company_id ? Number(r.company_id) : null,
        totalCount: 0,
        options: [],
      });
    }
    const entry = tpByAttendee.get(aid)!;
    const cnt = Number(r.cnt);
    entry.totalCount += cnt;
    entry.options.push({ option_id: Number(r.option_id), value: String(r.option_value), color: r.color ? String(r.color) : null, count: cnt });
  }
  const touchpointRows = Array.from(tpByAttendee.values()).sort((a, b) => b.totalCount - a.totalCount);

  // Index conferences by id
  const confById = new Map<number, { id: number; name: string; start_date: string }>();
  for (const c of allConfsRes.rows) confById.set(Number(c.id), { id: Number(c.id), name: String(c.name), start_date: String(c.start_date) });

  // Conferences before this one (by start_date)
  const priorConfIds = new Set<number>();
  Array.from(confById.entries()).forEach(([cid, c]) => {
    if (c.start_date < confStartDate) priorConfIds.add(cid);
  });

  // ── Phase 3: prior conference averages ────────────────────────────────────
  // Compute per-conference metrics across prior conferences, then average them.
  const priorIdList = Array.from(priorConfIds);
  type PriorAvg = { contactsPerRep: number | null; meetingsPerRep: number | null; followUpRate: number | null; notesPerContact: number | null; icpCaptureRate: number | null; priorConferences: number };
  let priorAvg: PriorAvg = { contactsPerRep: null, meetingsPerRep: null, followUpRate: null, notesPerContact: null, icpCaptureRate: null, priorConferences: 0 };

  if (priorIdList.length > 0) {
    const ph = priorIdList.map(() => '?').join(',');
    const [pContactsRes, pMeetingsRes, pFuRes, pEntityNotesRes, pDetailsNotesRes, pIcpRes, pConfsRes] = await Promise.all([
      db.execute({
        sql: `SELECT ca.conference_id, COUNT(DISTINCT ca.attendee_id) as contacts
              FROM conference_attendees ca
              JOIN attendees a ON a.id = ca.attendee_id
              JOIN companies c ON a.company_id = c.id
              WHERE LOWER(c.company_type) LIKE ? AND ca.conference_id IN (${ph})
              GROUP BY ca.conference_id`,
        args: [`%${operatorType.toLowerCase()}%`, ...priorIdList],
      }),
      db.execute({
        sql: `SELECT m.conference_id, COUNT(*) as meetings
              FROM meetings m
              JOIN config_options co ON LOWER(co.value) = LOWER(m.outcome) AND co.action_key = 'meeting_held'
              WHERE m.conference_id IN (${ph})
              GROUP BY m.conference_id`,
        args: priorIdList,
      }),
      db.execute({
        sql: `SELECT conference_id,
                     COUNT(*) as total,
                     SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done
              FROM follow_ups WHERE conference_id IN (${ph})
              GROUP BY conference_id`,
        args: priorIdList,
      }),
      db.execute({
        sql: `SELECT cf.id as conference_id, COUNT(*) as notes
              FROM entity_notes en JOIN conferences cf ON cf.name = en.conference_name
              WHERE en.entity_type = 'attendee' AND cf.id IN (${ph})
              GROUP BY cf.id`,
        args: priorIdList,
      }),
      db.execute({
        sql: `SELECT conference_id, COUNT(*) as notes
              FROM conference_attendee_details
              WHERE conference_id IN (${ph}) AND notes IS NOT NULL AND TRIM(notes) != ''
              GROUP BY conference_id`,
        args: priorIdList,
      }),
      db.execute({
        sql: `SELECT ca.conference_id, COUNT(DISTINCT ca.attendee_id) as icp
              FROM conference_attendees ca
              JOIN attendees a ON a.id = ca.attendee_id
              JOIN companies c ON a.company_id = c.id
              WHERE LOWER(c.company_type) LIKE ? AND LOWER(c.icp) = 'yes'
              AND ca.conference_id IN (${ph})
              GROUP BY ca.conference_id`,
        args: [`%${operatorType.toLowerCase()}%`, ...priorIdList],
      }),
      db.execute({
        sql: `SELECT id, internal_attendees FROM conferences WHERE id IN (${ph})`,
        args: priorIdList,
      }),
    ]);

    const pContactsByConf = new Map(pContactsRes.rows.map(r => [Number(r.conference_id), Number(r.contacts)]));
    const pMeetingsByConf = new Map(pMeetingsRes.rows.map(r => [Number(r.conference_id), Number(r.meetings)]));
    const pFuByConf = new Map(pFuRes.rows.map(r => [Number(r.conference_id), { total: Number(r.total), done: Number(r.done) }]));
    const pEntityNotesByConf = new Map(pEntityNotesRes.rows.map(r => [Number(r.conference_id), Number(r.notes)]));
    const pDetailsNotesByConf = new Map(pDetailsNotesRes.rows.map(r => [Number(r.conference_id), Number(r.notes)]));
    const pIcpByConf = new Map(pIcpRes.rows.map(r => [Number(r.conference_id), Number(r.icp)]));

    let sumCPR = 0, sumMPR = 0, sumFuR = 0, sumNPC = 0, sumICP = 0, count = 0;
    for (const row of pConfsRes.rows) {
      const cid = Number(row.id);
      const contacts = pContactsByConf.get(cid) ?? 0;
      const meetings = pMeetingsByConf.get(cid) ?? 0;
      if (contacts === 0 && meetings === 0) continue; // skip empty/cancelled conferences
      const repCount = Math.max(1, row.internal_attendees
        ? String(row.internal_attendees).split(',').map((s: string) => s.trim()).filter(Boolean).length
        : 1);
      const fu = pFuByConf.get(cid) ?? { total: 0, done: 0 };
      const notes = (pEntityNotesByConf.get(cid) ?? 0) + (pDetailsNotesByConf.get(cid) ?? 0);
      const icp = pIcpByConf.get(cid) ?? 0;
      sumCPR += contacts / repCount;
      sumMPR += meetings / repCount;
      sumFuR += fu.total > 0 ? (fu.done / fu.total) * 100 : 0;
      sumNPC += contacts > 0 ? notes / contacts : 0;
      sumICP += contacts > 0 ? (icp / contacts) * 100 : 0;
      count++;
    }
    if (count > 0) {
      priorAvg = {
        contactsPerRep: Math.round(sumCPR / count),
        meetingsPerRep: Math.round(sumMPR / count),
        followUpRate: Math.round(sumFuR / count),
        notesPerContact: Math.round(sumNPC / count),
        icpCaptureRate: Math.round(sumICP / count),
        priorConferences: count,
      };
    }
  }

  // Build per-attendee lookup maps
  // allConfByAttendee: attendee_id -> conference_ids[]
  const allConfByAttendee = new Map<number, number[]>();
  for (const r of allConfAttRes.rows) {
    const aid = Number(r.attendee_id), cid = Number(r.conference_id);
    if (!allConfByAttendee.has(aid)) allConfByAttendee.set(aid, []);
    allConfByAttendee.get(aid)!.push(cid);
  }

  // detailsByAttConf: `${aid}_${cid}` -> { action, notes }
  const detailsByAttConf = new Map<string, { action: string | null; notes: string | null }>();
  for (const r of allDetailsRes.rows) {
    detailsByAttConf.set(`${r.attendee_id}_${r.conference_id}`, {
      action: r.action ? String(r.action) : null,
      notes: r.notes ? String(r.notes) : null,
    });
  }

  // meetingsByAttConf: `${aid}_${cid}` -> outcomes[]
  const meetingsByAttConf = new Map<string, { outcome: string | null }[]>();
  for (const r of allMeetingsRes.rows) {
    const key = `${r.attendee_id}_${r.conference_id}`;
    if (!meetingsByAttConf.has(key)) meetingsByAttConf.set(key, []);
    meetingsByAttConf.get(key)!.push({ outcome: r.outcome ? String(r.outcome) : null });
  }

  // fusByAttConf: `${aid}_${cid}` -> {completed}[]
  const fusByAttConf = new Map<string, { completed: number }[]>();
  for (const r of allFuRes.rows) {
    const key = `${r.attendee_id}_${r.conference_id}`;
    if (!fusByAttConf.has(key)) fusByAttConf.set(key, []);
    fusByAttConf.get(key)!.push({ completed: Number(r.completed) });
  }

  // noteCountByAttConf: `${aid}_${cid}` -> count
  const noteCountByAttConf = new Map<string, number>();
  for (const r of allNotesRes.rows) {
    // match note to conference_id via conference_name
    Array.from(confById.entries()).forEach(([cid, c]) => {
      if (c.name === String(r.conference_name)) {
        const key = `${r.attendee_id}_${cid}`;
        noteCountByAttConf.set(key, (noteCountByAttConf.get(key) ?? 0) + 1);
      }
    });
  }

  // socialByAttConf: `${aid}_${cid}` -> {rsvp_status}[]
  const socialByAttConf = new Map<string, { rsvp_status: string }[]>();
  for (const r of allSocialRes.rows) {
    const key = `${r.attendee_id}_${r.conference_id}`;
    if (!socialByAttConf.has(key)) socialByAttConf.set(key, []);
    socialByAttConf.get(key)!.push({ rsvp_status: String(r.rsvp_status) });
  }

  // Helper: build per-conf maps for a given attendee_id
  function buildAttMaps(aid: number, confs: number[]) {
    const detailsByConf = new Map<number, { action: string | null; notes: string | null }>();
    const meetingsByConf = new Map<number, { outcome: string | null }[]>();
    const fusByConf = new Map<number, { completed: number }[]>();
    const noteCountByConf = new Map<number, number>();
    const socialByConf = new Map<number, { rsvp_status: string }[]>();
    for (const cid of confs) {
      const k = `${aid}_${cid}`;
      const det = detailsByAttConf.get(k);
      if (det) detailsByConf.set(cid, det);
      const m = meetingsByAttConf.get(k);
      if (m) meetingsByConf.set(cid, m);
      const f = fusByAttConf.get(k);
      if (f) fusByConf.set(cid, f);
      const nc = noteCountByAttConf.get(k);
      if (nc) noteCountByConf.set(cid, nc);
      const s = socialByAttConf.get(k);
      if (s) socialByConf.set(cid, s);
    }
    return { detailsByConf, meetingsByConf, fusByConf, noteCountByConf, socialByConf };
  }

  // Check per-attendee engagement at this conference
  function hasEngagementAt(aid: number, cid: number): boolean {
    const k = `${aid}_${cid}`;
    const det = detailsByAttConf.get(k);
    const hasDet = det && det.action && String(det.action).trim().length > 0;
    const hasMeetings = (meetingsByAttConf.get(k) ?? []).length > 0;
    const hasFus = (fusByAttConf.get(k) ?? []).length > 0;
    const hasNotes = (noteCountByAttConf.get(k) ?? 0) > 0 || (det?.notes && String(det.notes).trim().length > 0);
    return !!(hasDet || hasMeetings || hasFus || hasNotes);
  }

  // ── Compute per-attendee data ─────────────────────────────────────────────
  const contactRows: ContactRow[] = [];
  const healthDeltaByAttendee = new Map<number, number>();

  for (const a of attendees) {
    const aid = Number(a.id);
    const allConfs = allConfByAttendee.get(aid) ?? [confId]; // at least this conf
    const priorConfs = allConfs.filter(c => priorConfIds.has(c));
    const maps = buildAttMaps(aid, allConfs);

    const healthAfter = computeHealthScore({
      attendeeConfs: allConfs,
      detailsByConf: maps.detailsByConf,
      meetingsByConf: maps.meetingsByConf,
      followUpsByConf: maps.fusByConf,
      noteCountByConf: maps.noteCountByConf,
      socialByConf: maps.socialByConf,
      actionKeyMap,
    });
    const healthBefore = priorConfs.length === 0 ? 0 : computeHealthScore({
      attendeeConfs: allConfs,
      detailsByConf: maps.detailsByConf,
      meetingsByConf: maps.meetingsByConf,
      followUpsByConf: maps.fusByConf,
      noteCountByConf: maps.noteCountByConf,
      socialByConf: maps.socialByConf,
      actionKeyMap,
      excludeConfId: confId,
    });
    const healthDelta = healthAfter - healthBefore;
    healthDeltaByAttendee.set(aid, healthDelta);

    const currentDet = detailsByAttConf.get(`${aid}_${confId}`);
    const currentActionStr = currentDet?.action ? String(currentDet.action) : '';
    const currentActionVals = currentActionStr.split(',').map(s => s.trim()).filter(Boolean);
    const currentActionKeys = currentActionVals.map(v => actionKeyMap.get(v)).filter(Boolean) as string[];
    const meetingHeld = currentActionKeys.includes('meeting_held');
    const hasNotes = (noteCountByAttConf.get(`${aid}_${confId}`) ?? 0) > 0
      || (currentDet?.notes != null && String(currentDet.notes).trim().length > 0);

    // First seen conference
    const sortedConfs = allConfs
      .filter(c => priorConfIds.has(c))
      .map(c => confById.get(c))
      .filter(Boolean)
      .sort((x, y) => (x!.start_date < y!.start_date ? -1 : 1));
    const firstSeen = sortedConfs[0]?.name ?? null;

    const lastActionVal = currentActionVals.length > 0 ? currentActionVals[0] : null;

    contactRows.push({
      attendee_id: aid,
      first_name: String(a.first_name),
      last_name: String(a.last_name),
      title: a.title ? String(a.title) : null,
      company_id: a.company_id ? Number(a.company_id) : null,
      company_name: a.company_name ? String(a.company_name) : null,
      company_type: a.company_type ? String(a.company_type) : null,
      seniority: a.seniority ? String(a.seniority) : null,
      icp: a.icp ? String(a.icp) : null,
      assigned_user_names: resolveIds(a.company_assigned_user),
      firstSeenConference: firstSeen,
      priorConferenceCount: priorConfs.length,
      lastEngagementType: lastActionVal,
      healthScore: healthAfter,
      healthDelta,
      meetingHeld,
      hasNotes,
    });
  }

  // ── Categorize contacts ────────────────────────────────────────────────────
  const newlyEngaged: ContactRow[] = [];
  const reEngagements: ContactRow[] = [];
  const stillUnengaged: ContactRow[] = [];

  for (const c of contactRows) {
    const hasPriorEngagement = (allConfByAttendee.get(c.attendee_id) ?? [])
      .filter(cid => priorConfIds.has(cid))
      .some(cid => hasEngagementAt(c.attendee_id, cid));
    const hasCurrentEngagement = hasEngagementAt(c.attendee_id, confId);

    if (!hasCurrentEngagement) {
      stillUnengaged.push(c);
    } else if (hasPriorEngagement) {
      reEngagements.push(c);
    } else {
      newlyEngaged.push(c);
    }
  }

  // Sort: ICP first, then seniority
  const senioritySortMap: Record<string, number> = { 'C-Suite': 0, 'VP/SVP': 1, 'Director': 2, 'Manager': 3 };
  const sortContacts = (a: ContactRow, b: ContactRow) => {
    const aIcp = a.icp === 'Yes' ? 0 : 1;
    const bIcp = b.icp === 'Yes' ? 0 : 1;
    if (aIcp !== bIcp) return aIcp - bIcp;
    return (senioritySortMap[a.seniority ?? ''] ?? 99) - (senioritySortMap[b.seniority ?? ''] ?? 99);
  };
  newlyEngaged.sort(sortContacts);
  reEngagements.sort(sortContacts);
  // Unengaged: ICP first, then by priorConferenceCount desc
  stillUnengaged.sort((a, b) => {
    const aIcp = a.icp === 'Yes' ? 0 : 1;
    const bIcp = b.icp === 'Yes' ? 0 : 1;
    if (aIcp !== bIcp) return aIcp - bIcp;
    return b.priorConferenceCount - a.priorConferenceCount;
  });

  // ── Process meetings ──────────────────────────────────────────────────────
  // allAttendeesById: ALL conference attendees (no operator filter) — used for
  // meetings and follow-ups so every held meeting is counted regardless of company type.
  // attendeeById: operator-filtered — used only for contact/health analysis.
  const allAttendeesById = new Map<number, typeof attendeesRes.rows[0]>();
  for (const a of attendeesRes.rows) allAttendeesById.set(Number(a.id), a);
  const attendeeById = new Map<number, typeof attendees[0]>();
  for (const a of attendees) attendeeById.set(Number(a.id), a);

  const meetingRows: MeetingRow[] = [];
  for (const m of confMeetingsRes.rows) {
    const aid = Number(m.attendee_id);
    const a = allAttendeesById.get(aid);
    if (!a) continue;
    const attendeeName = `${a.first_name} ${a.last_name}`;
    const mtType = m.meeting_type ? String(m.meeting_type) : null;
    const isWalkIn = mtType === unplannedValue;

    // Derive status from the meeting's own outcome field — canonical source of truth
    const outcomeStr = m.outcome ? String(m.outcome).trim() : '';
    const outcomeKey = outcomeStr ? (actionKeyMap.get(outcomeStr) ?? null) : null;
    let status: MeetingRow['status'] = 'rescheduled'; // no outcome = not yet held
    if (outcomeKey === 'no_show') status = 'no_show';
    else if (outcomeKey === 'rescheduled') status = 'rescheduled';
    else if (outcomeKey === 'cancelled') status = 'cancelled';
    else if (outcomeKey === 'meeting_held') status = 'held';

    meetingRows.push({
      id: Number(m.id),
      attendee_id: aid,
      attendeeName,
      attendeeTitle: a.title ? String(a.title) : null,
      company_name: a.company_name ? String(a.company_name) : null,
      company_type: a.company_type ? String(a.company_type) : null,
      company_id: a.company_id ? Number(a.company_id) : null,
      seniority: a.seniority ? String(a.seniority) : null,
      meeting_date: m.meeting_date ? String(m.meeting_date) : null,
      meeting_time: m.meeting_time ? String(m.meeting_time) : null,
      location: m.location ? String(m.location) : null,
      scheduled_by: resolveIdsSingle(m.scheduled_by),
      outcome: m.outcome ? String(m.outcome) : null,
      meeting_type: mtType,
      isWalkIn,
      status,
    });
  }

  // ── Process follow-ups ────────────────────────────────────────────────────
  const followUpRows: FollowUpRow[] = [];
  for (const f of confFollowUpsRes.rows) {
    const aid = Number(f.attendee_id);
    const a = allAttendeesById.get(aid);
    if (!a) continue;
    const isCompleted = Number(f.completed) === 1;
    const status: FollowUpRow['status'] = isCompleted ? 'completed' : 'not_started';
    followUpRows.push({
      id: Number(f.id),
      attendee_id: aid,
      attendeeName: `${a.first_name} ${a.last_name}`,
      attendeeTitle: a.title ? String(a.title) : null,
      company_name: a.company_name ? String(a.company_name) : null,
      company_id: a.company_id ? Number(a.company_id) : null,
      next_steps: f.next_steps ? String(f.next_steps) : null,
      assigned_rep: resolveIdsSingle(f.assigned_rep),
      completed: Number(f.completed),
      created_at: f.created_at ? String(f.created_at) : null,
      daysSinceConference: Math.max(0, daysSinceEnd),
      status,
    });
  }

  // ── Rep performance ───────────────────────────────────────────────────────
  // Only include reps listed on the conference (internal_attendees) — resolve display names
  const repsFromConf = conf.internal_attendees
    ? splitIds(conf.internal_attendees)
    : [];
  // repsFromConf may store display names OR IDs — resolve each through the map
  // Build a canonical rep set: resolve IDs to names, keep as names
  const repDisplayNames = repsFromConf.map(r => userIdToName.get(r) ?? r);
  // Deduplicate
  const repSet = Array.from(new Set(repDisplayNames)).filter(Boolean);

  const currentDetails = allDetailsRes.rows.filter(r => Number(r.conference_id) === confId);

  // Build a helper to check if a raw field (possibly IDs or names) resolves to a given display name
  function rawFieldMatchesName(raw: unknown, displayName: string): boolean {
    if (!raw) return false;
    const parts = splitIds(raw);
    return parts.some(p => {
      const resolved = userIdToName.get(p) ?? p;
      return resolved === displayName || p === displayName;
    });
  }

  const repPerfRows: RepPerformanceRow[] = [];
  for (const repName of repSet) {
    const repDetails = currentDetails.filter(d => rawFieldMatchesName(d.assigned_rep, repName));

    // Meetings: use all conference meetings (not restricted to operator attendees)
    const repRawMeetings = confMeetingsRes.rows.filter(m => rawFieldMatchesName(m.scheduled_by, repName));
    const heldMeetings = repRawMeetings.filter(m => {
      const outcomeStr = m.outcome ? String(m.outcome).trim() : '';
      return (actionKeyMap.get(outcomeStr) ?? null) === 'meeting_held';
    });
    const walkIns = heldMeetings.filter(m => String(m.meeting_type ?? '') === unplannedValue);

    // Follow-ups: use all conference follow-ups (not restricted to operator attendees)
    const repFollowUps = confFollowUpsRes.rows.filter(r => rawFieldMatchesName(r.assigned_rep, repName));
    const fuCompleted = repFollowUps.filter(r => Number(r.completed) === 1).length;
    const fuRate = repFollowUps.length > 0 ? Math.round((fuCompleted / repFollowUps.length) * 100) : 0;

    // Contacts captured = operator attendees with this rep in their details.assigned_rep
    const repAttendeeIds = new Set(repDetails.map(d => Number(d.attendee_id)));
    const captured = Array.from(repAttendeeIds).map(aid => contactRows.find(c => c.attendee_id === aid)).filter(Boolean) as ContactRow[];

    // Get companies for this rep
    const companyMap = new Map<number, RepPerformanceRow['companies'][0]>();
    for (const c of captured) {
      if (!c.company_id) continue;
      if (companyMap.has(c.company_id)) continue;
      const fu = repFollowUps.find(r => Number(r.attendee_id) === c.attendee_id);
      let fuStatus: 'completed' | 'in_progress' | 'not_started' | 'none' = 'none';
      if (fu) fuStatus = Number(fu.completed) === 1 ? 'completed' : 'not_started';
      companyMap.set(c.company_id, {
        company_id: c.company_id,
        company_name: c.company_name ?? '',
        company_type: c.company_type,
        icp: c.icp,
        engagementType: c.lastEngagementType,
        followUpStatus: fuStatus,
        healthDelta: c.healthDelta,
      });
    }

    const repNewly = captured.filter(c => newlyEngaged.some(n => n.attendee_id === c.attendee_id)).length;
    const repReEngage = captured.filter(c => reEngagements.some(r => r.attendee_id === c.attendee_id)).length;

    repPerfRows.push({
      repName,
      contactsCaptured: captured.length,
      newlyEngaged: repNewly,
      reEngagements: repReEngage,
      meetingsHeld: heldMeetings.length,
      walkInMeetings: walkIns.length,
      followUpsCreated: repFollowUps.length,
      followUpsCompleted: fuCompleted,
      followUpRate: fuRate,
      companies: Array.from(companyMap.values()),
    });
  }
  repPerfRows.sort((a, b) => b.contactsCaptured - a.contactsCaptured);

  // ── Relationship shifts ───────────────────────────────────────────────────
  const improved: RelationshipShiftRow[] = [];
  const declined: RelationshipShiftRow[] = [];
  const unchanged: RelationshipShiftRow[] = [];

  for (const c of contactRows) {
    const aid = c.attendee_id;
    const allConfs = allConfByAttendee.get(aid) ?? [confId];
    const priorConfs = allConfs.filter(cc => priorConfIds.has(cc));
    const maps = buildAttMaps(aid, allConfs);
    const healthAfter = c.healthScore;
    const healthBefore = priorConfs.length === 0 ? 0 : computeHealthScore({
      attendeeConfs: allConfs,
      detailsByConf: maps.detailsByConf,
      meetingsByConf: maps.meetingsByConf,
      followUpsByConf: maps.fusByConf,
      noteCountByConf: maps.noteCountByConf,
      socialByConf: maps.socialByConf,
      actionKeyMap,
      excludeConfId: confId,
    });
    const delta = healthAfter - healthBefore;
    let shiftReason = '';
    if (delta > 0) {
      if (c.meetingHeld) shiftReason = 'Meeting held at conference';
      else if (c.hasNotes) shiftReason = 'Notes logged';
      else shiftReason = 'Conference engagement logged';
    } else if (delta < 0) {
      const wasGhost = !hasEngagementAt(aid, confId);
      if (wasGhost) shiftReason = 'Ghost penalty — no engagement logged';
      else shiftReason = 'Below-average engagement this conference';
    } else {
      shiftReason = 'Engagement level held steady';
    }
    // Compute engagement breakdown at this specific conference for the tooltip
    const confKey = `${aid}_${confId}`;
    const confDet = detailsByAttConf.get(confKey);
    const confMeetingsList = meetingsByAttConf.get(confKey) ?? [];
    const confFuList = fusByAttConf.get(confKey) ?? [];
    const confNoteCount = noteCountByAttConf.get(confKey) ?? 0;
    const confSocialList = socialByAttConf.get(confKey) ?? [];
    const confActionStr = confDet?.action ?? '';
    const confActionVals = confActionStr.split(',').map(s => s.trim()).filter(Boolean);
    const confActionKeys = confActionVals.map(v => actionKeyMap.get(v)).filter(Boolean) as string[];
    const hadMeeting = confActionKeys.includes('meeting_held');
    const hadOutcome = hadMeeting && confMeetingsList.some(m => m.outcome && String(m.outcome).trim().length > 0);
    const hadNotes = confNoteCount > 0 || (confDet?.notes != null && String(confDet.notes).trim().length > 0);
    const hadSocial = confSocialList.some(e => String(e.rsvp_status).split(',').map(s => s.trim()).includes('attended'));
    const hadFus = confFuList.length > 0;
    const hadCompletedFu = confFuList.some(f => Number(f.completed) === 1);
    const hadTouchpoint = confActionVals.length > 0 && confActionKeys.some(k => !MEETING_ACTION_KEYS.includes(k));
    const conferenceBreakdown: { label: string; points: number }[] = [];
    if (hadMeeting) conferenceBreakdown.push({ label: 'Meeting held', points: 25 });
    if (hadOutcome) conferenceBreakdown.push({ label: 'Meeting outcome logged', points: 20 });
    if (hadNotes) conferenceBreakdown.push({ label: 'Notes logged', points: 10 });
    if (hadSocial) conferenceBreakdown.push({ label: 'Social event attendance', points: 20 });
    if (hadFus && hadCompletedFu) conferenceBreakdown.push({ label: 'Follow-up completed', points: 15 });
    if (hadTouchpoint) conferenceBreakdown.push({ label: 'Touchpoint logged', points: 10 });
    if (conferenceBreakdown.length === 0) conferenceBreakdown.push({ label: 'No engagement logged', points: 0 });

    const row: RelationshipShiftRow = {
      attendee_id: aid,
      attendeeName: `${c.first_name} ${c.last_name}`,
      company_name: c.company_name,
      company_type: c.company_type,
      company_id: c.company_id,
      icp: c.icp,
      assignedUsers: c.assigned_user_names,
      priorConferenceCount: priorConfs.length,
      healthBefore,
      healthAfter,
      healthDelta: delta,
      shiftReason,
      conferenceBreakdown,
    };
    if (delta > 0) improved.push(row);
    else if (delta < 0) declined.push(row);
    else unchanged.push(row);
  }
  improved.sort((a, b) => b.healthDelta - a.healthDelta);
  declined.sort((a, b) => a.healthDelta - b.healthDelta);

  // ── Action items ──────────────────────────────────────────────────────────
  const actionItems: ActionItem[] = [];

  // Overdue follow-ups (high)
  for (const f of followUpRows.filter(f => f.status === 'not_started' && f.daysSinceConference > 5)) {
    actionItems.push({
      type: 'overdue_followup', priority: 'high',
      title: `Overdue follow-up: ${f.attendeeName}`,
      description: `${f.next_steps ?? 'Follow-up'} — ${f.daysSinceConference} days since conference ended`,
      repName: f.assigned_rep, attendeeName: f.attendeeName, companyName: f.company_name,
    });
  }

  // Missing outcome on held meetings (medium)
  for (const m of meetingRows.filter(m => m.status === 'held' && (!m.outcome || m.outcome.trim() === ''))) {
    actionItems.push({
      type: 'missing_outcome', priority: 'medium',
      title: `Log outcome: meeting with ${m.attendeeName}`,
      description: `Meeting held ${m.meeting_date ?? ''} — no outcome recorded yet`,
      repName: m.scheduled_by, attendeeName: m.attendeeName, companyName: m.company_name,
    });
  }

  // No-shows with no reschedule follow-up (high)
  for (const m of meetingRows.filter(m => m.status === 'no_show')) {
    const hasReschedule = followUpRows.some(f => f.attendee_id === m.attendee_id);
    if (!hasReschedule) {
      actionItems.push({
        type: 'no_show', priority: 'high',
        title: `Reschedule no-show: ${m.attendeeName}`,
        description: 'No-show with no follow-up created to reschedule',
        repName: m.scheduled_by, attendeeName: m.attendeeName, companyName: m.company_name,
      });
    }
  }

  // Ghost penalty — 3+ conferences, zero engagement (medium)
  for (const c of stillUnengaged.filter(c => c.priorConferenceCount >= 2)) {
    actionItems.push({
      type: 'ghost_penalty', priority: 'medium',
      title: `Ghost penalty: ${c.first_name} ${c.last_name}`,
      description: `Appeared at ${c.priorConferenceCount + 1} conferences with no logged engagement — health score declining`,
      repName: c.assigned_user_names[0] ?? null,
      attendeeName: `${c.first_name} ${c.last_name}`, companyName: c.company_name,
    });
  }

  // Pipeline: ICP contacts with meeting held but no follow-up (high)
  for (const c of contactRows.filter(c => c.icp === 'Yes' && c.meetingHeld)) {
    const hasFu = followUpRows.some(f => f.attendee_id === c.attendee_id);
    if (!hasFu) {
      actionItems.push({
        type: 'pipeline', priority: 'high',
        title: `Create follow-up: ${c.first_name} ${c.last_name} (ICP)`,
        description: 'ICP contact — meeting held with no follow-up created',
        repName: c.assigned_user_names[0] ?? null,
        attendeeName: `${c.first_name} ${c.last_name}`, companyName: c.company_name,
      });
    }
  }

  // New ICP C-Suite/VP contacts with no follow-up (medium)
  const seniorLevels = ['C-Suite', 'VP/SVP'];
  for (const c of newlyEngaged.filter(c => c.icp === 'Yes' && c.seniority && seniorLevels.includes(c.seniority))) {
    const hasFu = followUpRows.some(f => f.attendee_id === c.attendee_id);
    if (!hasFu) {
      actionItems.push({
        type: 'new_contact', priority: 'medium',
        title: `New ICP ${c.seniority}: ${c.first_name} ${c.last_name}`,
        description: `Newly engaged ${c.seniority}-level ICP contact — consider a follow-up`,
        repName: c.assigned_user_names[0] ?? null,
        attendeeName: `${c.first_name} ${c.last_name}`, companyName: c.company_name,
      });
    }
  }

  // Stats used in summary
  const totalFus = followUpRows.length;
  const completedFus = followUpRows.filter(f => f.status === 'completed').length;
  const fuRate = totalFus > 0 ? Math.round((completedFus / totalFus) * 100) : 0;
  const heldCount = meetingRows.filter(m => m.status === 'held').length;
  const walkInCount = meetingRows.filter(m => m.isWalkIn).length;
  const icpCount = contactRows.filter(c => c.icp === 'Yes').length;
  const icpCaptureRate = attendees.length > 0 ? Math.round((icpCount / attendees.length) * 100) : 0;

  // Notes logged for this conference — all attendees, not operator-filtered
  const notesLoggedCount =
    Number(confEntityNotesRes.rows[0]?.count ?? 0) +
    Number(confDetailsNotesRes.rows[0]?.count ?? 0);

  // Touchpoints for this conference — from attendee_touchpoints table
  const touchpointCount = Number(confTouchpointsRes.rows[0]?.count ?? 0);

  // Event attendees — all attendees with 'attended' RSVP status for this conference's social events
  const eventAttendeesCount = Number(eventAttendeesRes.rows[0]?.count ?? 0);

  // Form submissions — all submissions for this conference
  const formSubmissionsCount = Number(formSubmissionsRes.rows[0]?.count ?? 0);

  // ── Company type breakdown — only captured contacts (not still-unengaged) ──
  const ctCount: Record<string, number> = {};
  for (const c of [...newlyEngaged, ...reEngagements]) {
    const ct = c.company_type ?? 'Unknown';
    for (const t of ct.split(',').map(s => s.trim())) {
      ctCount[t] = (ctCount[t] ?? 0) + 1;
    }
  }
  const companyTypeBreakdown = Object.entries(ctCount)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const meetingsHeld = meetingRows.filter(m => m.status === 'held').length;
  const noShows = meetingRows.filter(m => m.status === 'no_show').length;
  const walkIns = meetingRows.filter(m => m.isWalkIn).length;
  const meetingsWithOutcome = meetingRows.filter(m => m.status === 'held' && m.outcome && m.outcome.trim()).length;
  const fuCreated = followUpRows.length;
  const fuCompleted = followUpRows.filter(f => f.status === 'completed').length;
  const fuNotStarted = followUpRows.filter(f => f.status === 'not_started').length;

  const summary = {
    conference: {
      id: confId, name: confName,
      start_date: confStartDate, end_date: confEndDate,
      location: String(conf.location ?? ''),
    },
    totalCaptured: newlyEngaged.length + reEngagements.length,
    newlyEngaged: newlyEngaged.length,
    reEngagements: reEngagements.length,
    stillUnengaged: stillUnengaged.length,
    icpContacts: icpCount,
    icpCaptureRate,
    meetingsScheduled: meetingRows.length,
    meetingsHeld,
    walkInMeetings: walkIns,
    noShows,
    meetingsWithOutcome,
    followUpsCreated: fuCreated,
    followUpsCompleted: fuCompleted,
    followUpsInProgress: 0,
    followUpsNotStarted: fuNotStarted,
    formSubmissions: formSubmissionsCount,
    relationshipsImproved: improved.length,
    relationshipsDeclined: declined.length,
    repsAttended: repsFromConf.length || repPerfRows.length,
    engagementByType: {
      meetingsHeld,
      socialConversations: eventAttendeesCount,
      touchpoints: touchpointCount,
      notesLogged: notesLoggedCount,
      zeroEngagement: stillUnengaged.length,
    },
    companyTypeBreakdown,
    priorAverageComparison: {
      contactsPerRep: { current: repPerfRows.length > 0 ? Math.round(contactRows.length / repPerfRows.length) : 0, avg: priorAvg.contactsPerRep },
      meetingsPerRep: { current: repPerfRows.length > 0 ? Math.round(meetingsHeld / Math.max(1, repPerfRows.length)) : 0, avg: priorAvg.meetingsPerRep },
      icpCaptureRate: { current: icpCaptureRate, avg: priorAvg.icpCaptureRate },
      followUpRate: { current: fuRate, avg: priorAvg.followUpRate },
      notesPerContact: { current: contactRows.length > 0 ? Math.round(notesLoggedCount / contactRows.length) : 0, avg: priorAvg.notesPerContact },
    },
  };

  return NextResponse.json({
    summary,
    contacts: { newlyEngaged, reEngagements, stillUnengaged },
    meetings: meetingRows,
    followUps: followUpRows,
    repPerformance: repPerfRows,
    relationshipShifts: { improved, declined, unchanged },
    socialEvents: socialEventRows,
    touchpoints: touchpointRows,
    actionItems,
  });
}
