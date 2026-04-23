import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

function calcHealthScore(
  daysSinceLast: number | null,
  totalConfs: number,
  avgDepth: number,
  completionRate: number | null
) {
  const recency = daysSinceLast !== null ? Math.max(0, 100 - (daysSinceLast / 365) * 100) : 0;
  const frequency = Math.min(100, (totalConfs / 5) * 100);
  const completion = completionRate ?? 50;
  return Math.round(recency * 0.35 + avgDepth * 0.35 + frequency * 0.2 + completion * 0.1);
}

function uniqueNumbers(arr: (number | null | undefined)[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of arr) {
    if (v != null && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
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

  const [attendeesRes, meetingsRes, socialRes, followUpsRes, prevConfsRes] = await Promise.all([
    db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.email, a.status, a.seniority,
                   a.company_id, c.name as company_name, c.company_type, c.icp, c.wse,
                   c.assigned_user as company_assigned_user
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
                   se.internal_attendees,
                   COUNT(rsvp_yes.attendee_id) as attending_count,
                   COUNT(rsvp_no.attendee_id) as declined_count
            FROM social_events se
            LEFT JOIN social_event_rsvps rsvp_yes
              ON se.id = rsvp_yes.social_event_id AND rsvp_yes.rsvp_status = 'attending'
            LEFT JOIN social_event_rsvps rsvp_no
              ON se.id = rsvp_no.social_event_id AND rsvp_no.rsvp_status = 'declined'
            WHERE se.conference_id = ?
            GROUP BY se.id
            ORDER BY se.event_date, se.event_time`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT f.id, f.attendee_id, f.conference_id, f.assigned_rep, f.completed,
                   COALESCE(co.value, f.next_steps) as next_steps
            FROM follow_ups f
            LEFT JOIN config_options co
              ON co.id = CAST(f.next_steps AS INTEGER) AND co.category = 'next_steps'
            WHERE f.conference_id = ?`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT DISTINCT ca.attendee_id
            FROM conference_attendees ca
            JOIN conferences c ON ca.conference_id = c.id
            WHERE ca.conference_id != ? AND c.end_date < (SELECT start_date FROM conferences WHERE id = ?)`,
      args: [confId, confId],
    }),
  ]);

  const attendees = attendeesRes.rows;
  const meetings = meetingsRes.rows;
  const socialEvents = socialRes.rows;
  const followUps = followUpsRes.rows;

  const companyIds = uniqueNumbers(attendees.map((a) => a.company_id as number | null));

  const [internalRelsRes, companyNotesRes, attendeeConfsRes, detailsRes] = await Promise.all([
    companyIds.length > 0
      ? db.execute({
          sql: `SELECT id, company_id, rep_ids, relationship_status, description
                FROM internal_relationships
                WHERE company_id IN (${companyIds.map(() => '?').join(',')})`,
          args: companyIds,
        })
      : Promise.resolve({ rows: [] as typeof attendeesRes.rows }),
    companyIds.length > 0
      ? db.execute({
          sql: `SELECT id, entity_id as company_id, content, created_at, rep, attendee_name, conference_name
                FROM entity_notes
                WHERE entity_type = 'company' AND entity_id IN (${companyIds.map(() => '?').join(',')})
                ORDER BY created_at DESC`,
          args: companyIds,
        })
      : Promise.resolve({ rows: [] as typeof attendeesRes.rows }),
    attendees.length > 0
      ? db.execute({
          sql: `SELECT ca.attendee_id, c.end_date, c.start_date
                FROM conference_attendees ca
                JOIN conferences c ON ca.conference_id = c.id
                WHERE ca.attendee_id IN (${attendees.map(() => '?').join(',')})
                ORDER BY c.start_date DESC`,
          args: attendees.map((a) => a.id),
        })
      : Promise.resolve({ rows: [] as typeof attendeesRes.rows }),
    attendees.length > 0
      ? db.execute({
          sql: `SELECT cad.attendee_id, cad.conference_id, cad.action, cad.notes
                FROM conference_attendee_details cad
                WHERE cad.attendee_id IN (${attendees.map(() => '?').join(',')})`,
          args: attendees.map((a) => a.id),
        })
      : Promise.resolve({ rows: [] as typeof attendeesRes.rows }),
  ]);

  const internalRels = internalRelsRes.rows;
  const companyNotes = companyNotesRes.rows;

  // Build per-attendee conf history map
  const attendeeConfMap = new Map<number, Array<{ end_date: unknown; start_date: unknown }>>();
  for (const row of attendeeConfsRes.rows) {
    const aid = row.attendee_id as number;
    if (!attendeeConfMap.has(aid)) attendeeConfMap.set(aid, []);
    attendeeConfMap.get(aid)!.push({ end_date: row.end_date, start_date: row.start_date });
  }

  const detailsMap = new Map<string, { action: unknown; notes: unknown }>();
  for (const row of detailsRes.rows) {
    detailsMap.set(`${row.attendee_id}_${row.conference_id}`, { action: row.action, notes: row.notes });
  }

  const followUpsMap = new Map<number, typeof followUps>();
  for (const f of followUps) {
    const aid = f.attendee_id as number;
    if (!followUpsMap.has(aid)) followUpsMap.set(aid, []);
    followUpsMap.get(aid)!.push(f);
  }

  function calcAttendeeHealth(aid: number): number {
    const confs = attendeeConfMap.get(aid) ?? [];
    const totalConfs = confs.length;
    if (totalConfs === 0) return 0;
    const sorted = confs.slice().sort((a, b) =>
      String(b.end_date || b.start_date).localeCompare(String(a.end_date || a.start_date))
    );
    const lastDate = String(sorted[0].end_date || sorted[0].start_date);
    const daysSince = Math.floor((Date.now() - new Date(lastDate + 'T00:00:00').getTime()) / 86400000);
    const meetingsForAtt = meetings.filter((m) => m.attendee_id === aid);
    const fuForAtt = followUpsMap.get(aid) ?? [];
    let totalDepth = 0;
    for (const c of attendeeConfsRes.rows.filter((r) => r.attendee_id === aid)) {
      const det = detailsMap.get(`${aid}_${c.conference_id ?? ''}`);
      let d = 0;
      if (det?.action) d += 20;
      const confMeetings = meetingsForAtt.filter((m) => m.conference_id === c.conference_id);
      if (confMeetings.length > 0) d += 30;
      if (confMeetings.some((m) => m.outcome)) d += 15;
      if (det?.notes) d += 15;
      totalDepth += Math.min(100, d);
    }
    const avgDepth = totalConfs > 0 ? totalDepth / totalConfs : 0;
    const completion = fuForAtt.length > 0
      ? (fuForAtt.filter((f) => f.completed).length / fuForAtt.length) * 100
      : null;
    return calcHealthScore(daysSince, totalConfs, avgDepth, completion);
  }

  const attendeeHealthMap = new Map<number, number>();
  for (const a of attendees) {
    attendeeHealthMap.set(a.id as number, calcAttendeeHealth(a.id as number));
  }

  // --- Summary ---
  const totalAttendees = attendees.length;
  const totalCompanies = companyIds.length;
  const icpCompanyIds = uniqueNumbers(attendees.filter((a) => a.icp).map((a) => a.company_id as number | null));
  const icpCount = icpCompanyIds.length;
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
    const sen = String(a.seniority || 'Unknown');
    seniorityCount[sen] = (seniorityCount[sen] ?? 0) + 1;
    if (a.wse && a.company_id) wseCompanyIds.add(a.company_id as number);
  }
  const prevAttendeeSet = new Set<number>(prevConfsRes.rows.map((r) => r.attendee_id as number));
  const priorOverlapAttendees = attendees.filter((a) => prevAttendeeSet.has(a.id as number));
  const landscape = {
    totalAttendees, totalCompanies, icpCount, wseCount: wseCompanyIds.size,
    companyTypeBreakdown: Object.entries(companyTypeCount).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    seniorityBreakdown: Object.entries(seniorityCount).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    priorOverlapCount: priorOverlapAttendees.length,
    priorOverlapAttendees: priorOverlapAttendees.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, title: a.title, company_name: a.company_name })),
  };

  // --- ICP Companies ---
  const icpCompanyMap = new Map<number, { id: number; name: string; company_type: string | null; attendeeList: typeof attendees }>();
  for (const a of attendees) {
    if (!a.icp || !a.company_id) continue;
    const cid = a.company_id as number;
    if (!icpCompanyMap.has(cid)) {
      icpCompanyMap.set(cid, { id: cid, name: String(a.company_name || ''), company_type: (a.company_type as string) ?? null, attendeeList: [] });
    }
    icpCompanyMap.get(cid)!.attendeeList.push(a);
  }
  const icpCompanies: Array<{ id: number; name: string; company_type: string | null; avgHealth: number; attendees: Array<{ id: unknown; first_name: unknown; last_name: unknown; title: unknown; health: number }> }> = [];
  icpCompanyMap.forEach((c) => {
    const scores = c.attendeeList.map((a) => attendeeHealthMap.get(a.id as number) ?? 0);
    const avg = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    icpCompanies.push({
      ...c,
      avgHealth: avg,
      attendees: c.attendeeList.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, title: a.title, health: attendeeHealthMap.get(a.id as number) ?? 0 })),
    });
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
    const sorted = repMeetings.filter((m) => m.meeting_date && m.meeting_time).slice().sort((a, b) => {
      const aKey = `${a.meeting_date}T${a.meeting_time}`;
      const bKey = `${b.meeting_date}T${b.meeting_time}`;
      return aKey.localeCompare(bKey);
    });
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].meeting_date === sorted[i + 1].meeting_date && sorted[i].meeting_time === sorted[i + 1].meeting_time) {
        conflictIds.add(sorted[i].id as number);
        conflictIds.add(sorted[i + 1].id as number);
      }
    }
  });
  const meetingsData = meetings.map((m) => ({
    id: m.id, attendee_id: m.attendee_id, meeting_date: m.meeting_date,
    meeting_time: m.meeting_time, location: m.location,
    scheduled_by: m.scheduled_by, outcome: m.outcome, meeting_type: m.meeting_type,
    first_name: m.first_name, last_name: m.last_name, title: m.title,
    company_name: m.company_name, company_id: m.company_id,
    hasConflict: conflictIds.has(m.id as number),
  }));

  // --- Social Events ---
  const socialEventsData = socialEvents.map((se) => ({
    id: se.id, event_type: se.event_type, event_name: se.event_name,
    host: se.host, location: se.location, event_date: se.event_date,
    event_time: se.event_time, invite_only: se.invite_only, notes: se.notes,
    internal_attendees: se.internal_attendees,
    attending_count: se.attending_count, declined_count: se.declined_count,
  }));

  // --- By Rep ---
  const repCompaniesMap = new Map<string, Set<number>>();
  for (const rel of internalRels) {
    const repList = String(rel.rep_ids || '').split(',').map((r: string) => r.trim()).filter(Boolean);
    for (const rep of repList) {
      if (!repCompaniesMap.has(rep)) repCompaniesMap.set(rep, new Set());
      repCompaniesMap.get(rep)!.add(rel.company_id as number);
    }
  }
  for (const a of attendees) {
    if (a.company_assigned_user && a.company_id) {
      const rep = String(a.company_assigned_user);
      if (!repCompaniesMap.has(rep)) repCompaniesMap.set(rep, new Set());
      repCompaniesMap.get(rep)!.add(a.company_id as number);
    }
  }
  const byRep: Array<{ rep: string; companies: Array<{ company_id: number; company_name: string; company_type: string | null; relationship_status: string | null; description: string | null; attendees: Array<{ id: unknown; first_name: unknown; last_name: unknown; title: unknown; status: unknown; health: number }>; notes: Array<{ id: unknown; content: unknown; created_at: unknown; rep: unknown; attendee_name: unknown; conference_name: unknown }> }> }> = [];
  repCompaniesMap.forEach((cids, rep) => {
    const repCompanies: typeof byRep[0]['companies'] = [];
    cids.forEach((cid) => {
      const compAttendees = attendees.filter((a) => a.company_id === cid);
      const rel = internalRels.find((r) => r.company_id === cid);
      const notes = companyNotes.filter((n) => n.company_id === cid);
      repCompanies.push({
        company_id: cid,
        company_name: String(compAttendees[0]?.company_name ?? ''),
        company_type: (compAttendees[0]?.company_type as string) ?? null,
        relationship_status: (rel?.relationship_status as string) ?? null,
        description: (rel?.description as string) ?? null,
        attendees: compAttendees.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, title: a.title, status: a.status, health: attendeeHealthMap.get(a.id as number) ?? 0 })),
        notes: notes.slice(0, 5).map((n) => ({ id: n.id, content: n.content, created_at: n.created_at, rep: n.rep, attendee_name: n.attendee_name, conference_name: n.conference_name })),
      });
    });
    byRep.push({ rep, companies: repCompanies });
  });

  // --- Relationships ---
  const relationshipsData = internalRels.map((rel) => {
    const cid = rel.company_id as number;
    const compAttendees = attendees.filter((a) => a.company_id === cid);
    const repList = String(rel.rep_ids || '').split(',').map((r: string) => r.trim()).filter(Boolean);
    const notes = companyNotes.filter((n) => n.company_id === cid);
    return {
      id: rel.id, company_id: cid,
      company_name: String(compAttendees[0]?.company_name ?? ''),
      relationship_status: String(rel.relationship_status ?? ''),
      description: String(rel.description ?? ''),
      rep_ids: repList,
      attendees: compAttendees.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, title: a.title, health: attendeeHealthMap.get(a.id as number) ?? 0 })),
      recentNotes: notes.slice(0, 3).map((n) => ({ id: n.id, content: n.content, created_at: n.created_at, rep: n.rep })),
    };
  });

  // --- Coverage Gaps ---
  const attendeesWithMeeting = new Set<number>(meetings.map((m) => m.attendee_id as number));
  const icpAttendeesNoMeeting = attendees.filter((a) => a.icp && !attendeesWithMeeting.has(a.id as number));
  const icpCompaniesNoRel: Array<{ id: number; name: string; company_type: string | null }> = [];
  icpCompanyMap.forEach((c) => {
    if (!internalRels.some((r) => r.company_id === c.id)) {
      icpCompaniesNoRel.push({ id: c.id, name: c.name, company_type: c.company_type });
    }
  });
  const openFuAttendees = attendees.filter((a) => (followUpsMap.get(a.id as number) ?? []).some((f) => !f.completed));

  const gaps = {
    icpAttendeesNoMeeting: icpAttendeesNoMeeting.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, title: a.title, company_name: a.company_name })),
    icpCompaniesNoRelationship: icpCompaniesNoRel,
    attendeesWithOpenFollowUps: openFuAttendees.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, company_name: a.company_name, openCount: (followUpsMap.get(a.id as number) ?? []).filter((f) => !f.completed).length })),
    totalGaps: icpAttendeesNoMeeting.length + icpCompaniesNoRel.length,
  };

  return NextResponse.json({ summary, landscape, icpCompanies, meetings: meetingsData, socialEvents: socialEventsData, byRep, relationships: relationshipsData, gaps });
}
