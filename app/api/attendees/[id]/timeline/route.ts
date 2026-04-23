import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

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

  const attRow = await db.execute({
    sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.email, a.status, a.seniority,
                 c.name as company_name, c.company_type, c.icp, c.wse
          FROM attendees a LEFT JOIN companies c ON a.company_id = c.id
          WHERE a.id = ?`,
    args: [attendeeId],
  });

  if (attRow.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const attendee = attRow.rows[0];

  const confRows = await db.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location
          FROM conference_attendees ca
          JOIN conferences c ON ca.conference_id = c.id
          WHERE ca.attendee_id = ?
          ORDER BY c.start_date ASC`,
    args: [attendeeId],
  });

  const touchpoints = await Promise.all(
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

      let depth = 0;
      if (details?.action) depth += 20;
      if (meetings.length > 0) depth += 30;
      if (meetings.some((m) => m.outcome)) depth += 15;
      if (notes.length > 0 || details?.notes) depth += 15;
      if (socialEvents.some((e) => e.rsvp_status === 'attending')) depth += 10;
      if (followUps.length > 0) depth += 5;
      if (followUps.some((f) => f.completed)) depth += 5;
      depth = Math.min(100, depth);

      return {
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
      };
    })
  );

  const totalConferences = touchpoints.length;
  const lastConfDate =
    confRows.rows.length > 0
      ? String(confRows.rows[confRows.rows.length - 1].end_date || confRows.rows[confRows.rows.length - 1].start_date)
      : null;
  const daysSinceLastTouch = lastConfDate
    ? Math.floor((Date.now() - new Date(lastConfDate + 'T00:00:00').getTime()) / 86400000)
    : null;

  const avgDepth =
    totalConferences > 0
      ? touchpoints.reduce((sum, t) => sum + t.depthScore, 0) / totalConferences
      : 0;

  const allFollowUps = touchpoints.flatMap((t) => t.followUps);
  const followUpCompletionRate =
    allFollowUps.length > 0
      ? Math.round((allFollowUps.filter((f) => f.completed).length / allFollowUps.length) * 100)
      : null;

  const recency =
    daysSinceLastTouch !== null
      ? Math.max(0, 100 - (daysSinceLastTouch / 365) * 100)
      : 0;
  const frequency = Math.min(100, (totalConferences / 5) * 100);
  const completionForScore = followUpCompletionRate ?? 50;
  const healthScore = Math.round(
    recency * 0.35 + avgDepth * 0.35 + frequency * 0.2 + completionForScore * 0.1
  );

  return NextResponse.json({
    attendee,
    touchpoints,
    healthScore,
    daysSinceLastTouch,
    totalTouchpoints: totalConferences,
    followUpCompletionRate,
  });
}
