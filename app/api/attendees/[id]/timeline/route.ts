import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

const MEETING_ACTION_KEYS = ['meeting_held', 'meeting_scheduled', 'rescheduled', 'cancelled', 'no_show'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const attendeeId = parseInt(id, 10);
  if (isNaN(attendeeId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  await dbReady;

  const [attRow, actionOptsRes] = await Promise.all([
    db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.email, a.status, a.seniority,
                   c.name as company_name, c.company_type, c.icp, c.wse
            FROM attendees a LEFT JOIN companies c ON a.company_id = c.id
            WHERE a.id = ?`,
      args: [attendeeId],
    }),
    db.execute({
      sql: `SELECT value, action_key FROM config_options WHERE category = 'action'`,
      args: [],
    }),
  ]);

  if (attRow.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const attendee = attRow.rows[0];

  // Build action value → action_key lookup
  const actionKeyMap = new Map<string, string>();
  for (const row of actionOptsRes.rows) {
    if (row.action_key) actionKeyMap.set(String(row.value), String(row.action_key));
  }

  const confRows = await db.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location
          FROM conference_attendees ca
          JOIN conferences c ON ca.conference_id = c.id
          WHERE ca.attendee_id = ?
          ORDER BY c.start_date ASC`,
    args: [attendeeId],
  });

  const touchpointResults = await Promise.all(
    confRows.rows.map(async (conf) => {
      const confId = conf.id as number;

      const [detailsRes, meetingsRes, notesRes, followUpsRes, socialRes] = await Promise.all([
        db.execute({
          sql: `SELECT action, notes, next_steps, assigned_rep, completed
                FROM conference_attendee_details WHERE attendee_id = ? AND conference_id = ?`,
          args: [attendeeId, confId],
        }),
        db.execute({
          sql: `SELECT id, meeting_date, meeting_time, location, scheduled_by, outcome, meeting_type
                FROM meetings WHERE attendee_id = ? AND conference_id = ?`,
          args: [attendeeId, confId],
        }),
        db.execute({
          sql: `SELECT id, content, created_at, conference_name, rep
                FROM entity_notes
                WHERE entity_type = 'attendee' AND entity_id = ?
                  AND (conference_name = ? OR conference_name IS NULL OR conference_name = '')`,
          args: [attendeeId, conf.name],
        }),
        db.execute({
          sql: `SELECT f.id, f.conference_id,
                       COALESCE(co.value, f.next_steps) as next_steps,
                       f.next_steps_notes, f.assigned_rep, f.completed, f.created_at
                FROM follow_ups f
                LEFT JOIN config_options co
                  ON co.id = CAST(f.next_steps AS INTEGER) AND co.category = 'next_steps'
                WHERE f.attendee_id = ? AND f.conference_id = ?`,
          args: [attendeeId, confId],
        }),
        db.execute({
          sql: `SELECT r.social_event_id, r.rsvp_status, se.conference_id,
                       se.event_type, se.event_name, se.event_date
                FROM social_event_rsvps r
                JOIN social_events se ON r.social_event_id = se.id
                WHERE r.attendee_id = ? AND se.conference_id = ?`,
          args: [attendeeId, confId],
        }),
      ]);

      const details = detailsRes.rows[0] ?? null;
      const meetings = meetingsRes.rows;
      const notes = notesRes.rows;
      const followUps = followUpsRes.rows;
      const socialEvents = socialRes.rows;

      // Resolve action_keys from conference_attendee_details.action
      const detailActions = (details?.action ? String(details.action) : '').split(',').map(s => s.trim()).filter(Boolean);
      const detailActionKeys = detailActions.map(v => actionKeyMap.get(v) ?? null).filter((k): k is string => k !== null);

      const hasMeetingHeld = detailActionKeys.some(k => k === 'meeting_held');
      const meetingHasOutcome = hasMeetingHeld && meetings.some(m => m.outcome && String(m.outcome).trim().length > 0);
      const hasNotes = notes.length > 0 || (details?.notes != null && String(details.notes).trim().length > 0);
      const hasSocialAttending = socialEvents.some(e => String(e.rsvp_status).split(',').map(s => s.trim()).includes('attending'));
      const hasFollowUps = followUps.length > 0;
      const hasCompletedFu = followUps.some(f => Number(f.completed) === 1);
      // Non-meeting touchpoint: action is set and its key is not a formal meeting action
      const hasTouchpoint = detailActions.length > 0 && detailActionKeys.some(k => !MEETING_ACTION_KEYS.includes(k));

      let depth = 0;
      if (hasMeetingHeld) depth += 25;
      if (meetingHasOutcome) depth += 20;
      if (hasNotes) depth += 10;
      if (hasSocialAttending) depth += 20;
      if (hasFollowUps && hasCompletedFu) depth += 15;
      if (hasTouchpoint) depth += 10;
      depth = Math.min(100, depth);

      const isZeroEngagement = !hasMeetingHeld && !hasNotes && !hasSocialAttending && !hasFollowUps;

      return {
        touchpoint: {
          conference: {
            id: conf.id,
            name: conf.name,
            start_date: conf.start_date,
            end_date: conf.end_date,
            location: conf.location,
          },
          details: details
            ? {
                action: details.action,
                notes: details.notes,
                next_steps: details.next_steps,
                assigned_rep: details.assigned_rep,
                completed: details.completed,
              }
            : null,
          meetings: meetings.map((m) => ({
            id: m.id,
            meeting_date: m.meeting_date,
            meeting_time: m.meeting_time,
            location: m.location,
            scheduled_by: m.scheduled_by,
            outcome: m.outcome,
            meeting_type: m.meeting_type,
          })),
          notes: notes.map((n) => ({
            id: n.id,
            content: n.content,
            created_at: n.created_at,
            conference_name: n.conference_name,
            rep: n.rep,
          })),
          followUps: followUps.map((f) => ({
            id: f.id,
            conference_id: f.conference_id,
            next_steps: f.next_steps,
            assigned_rep: f.assigned_rep,
            completed: f.completed,
            created_at: f.created_at,
          })),
          socialEvents: socialEvents.map((e) => ({
            social_event_id: e.social_event_id,
            rsvp_status: e.rsvp_status,
            conference_id: e.conference_id,
            event_type: e.event_type,
            event_name: e.event_name,
            event_date: e.event_date,
          })),
          depthScore: depth,
        },
        isZeroEngagement,
      };
    })
  );

  const touchpoints = touchpointResults.map(r => r.touchpoint);

  const totalConferences = touchpoints.length;
  const lastConfDate =
    confRows.rows.length > 0
      ? String(confRows.rows[confRows.rows.length - 1].end_date || confRows.rows[confRows.rows.length - 1].start_date)
      : null;
  const daysSinceLastTouch = lastConfDate
    ? Math.floor((Date.now() - new Date(lastConfDate + 'T00:00:00').getTime()) / 86400000)
    : null;

  const avgDepthScore =
    totalConferences > 0
      ? touchpoints.reduce((sum, t) => sum + t.depthScore, 0) / totalConferences
      : 0;

  const allFollowUps = touchpoints.flatMap((t) => t.followUps);
  const totalFus = allFollowUps.length;
  const completedFus = allFollowUps.filter((f) => Number(f.completed) === 1).length;
  const followUpCompletionRate = totalFus > 0 ? Math.round((completedFus / totalFus) * 100) : null;

  const followUpScore = totalFus > 0 ? (completedFus / totalFus) * 100 : 50;

  const ghostCount = touchpointResults.filter(r => r.isZeroEngagement).length;
  const ghostPenalty = totalConferences > 0 ? (ghostCount / totalConferences) * 100 : 0;

  const rawScore = avgDepthScore * 0.60 + followUpScore * 0.30 - ghostPenalty * 0.10;
  const healthScore = Math.round(Math.max(0, Math.min(100, rawScore)));

  // Total logged touchpoints from attendee_touchpoints table
  const tpCountRes = await db.execute({
    sql: `SELECT COUNT(*) as total FROM attendee_touchpoints WHERE attendee_id = ?`,
    args: [attendeeId],
  });
  const loggedTouchpoints = Number(tpCountRes.rows[0]?.total ?? 0);

  return NextResponse.json({
    attendee,
    touchpoints,
    healthScore,
    daysSinceLastTouch,
    totalTouchpoints: totalConferences,
    followUpCompletionRate,
    loggedTouchpoints,
  });
}
