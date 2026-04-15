import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const { id } = params;
    const body = await request.json();
    const { attendee_id, rsvp_status } = body;

    if (!attendee_id || !rsvp_status) {
      return NextResponse.json({ error: 'attendee_id and rsvp_status are required' }, { status: 400 });
    }
    const validValues = ['yes', 'no', 'maybe', 'attended'];
    const parts = String(rsvp_status).split(',').map((s: string) => s.trim());
    if (!parts.every((p: string) => validValues.includes(p))) {
      return NextResponse.json({ error: 'rsvp_status must be comma-separated values of: yes, no, maybe, attended' }, { status: 400 });
    }

    // Fetch previous RSVP status before upserting so we can detect a new "attended" selection
    const prevResult = await db.execute({
      sql: 'SELECT rsvp_status FROM social_event_rsvps WHERE social_event_id = ? AND attendee_id = ?',
      args: [id, attendee_id],
    });
    const prevStatuses = prevResult.rows[0]?.rsvp_status
      ? String(prevResult.rows[0].rsvp_status).split(',').map(s => s.trim())
      : [];
    const attendedNewlyAdded = parts.includes('attended') && !prevStatuses.includes('attended');

    // Upsert RSVP
    await db.execute({
      sql: `INSERT INTO social_event_rsvps (social_event_id, attendee_id, rsvp_status, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT (social_event_id, attendee_id)
            DO UPDATE SET rsvp_status = excluded.rsvp_status, updated_at = excluded.updated_at`,
      args: [id, attendee_id, rsvp_status],
    });

    // Auto-create a "Post-Event" follow-up when "attended" is newly marked.
    // The next_steps value is fetched dynamically from config_options so it respects
    // whatever label the admin has configured (e.g. "Post-Event", "Post-Event Follow Up").
    if (attendedNewlyAdded) {
      // 1. Look up the Post-Event next_steps option (case-insensitive, partial match on
      //    "post" + "event" so minor label variations still match).
      const nextStepsResult = await db.execute({
        sql: `SELECT value FROM config_options
              WHERE category = 'next_steps'
                AND lower(value) LIKE '%post%event%'
              ORDER BY sort_order ASC
              LIMIT 1`,
        args: [],
      });
      const postEventLabel = nextStepsResult.rows[0]
        ? String(nextStepsResult.rows[0].value)
        : null;

      if (postEventLabel) {
        // 2. Get the conference_id for this social event
        const eventResult = await db.execute({
          sql: 'SELECT conference_id FROM social_events WHERE id = ?',
          args: [id],
        });

        if (eventResult.rows.length > 0) {
          const conferenceId = Number(eventResult.rows[0].conference_id);

          // 3. Avoid duplicates — only insert if no matching follow-up already exists
          const dupeCheck = await db.execute({
            sql: `SELECT id FROM follow_ups
                  WHERE attendee_id = ? AND conference_id = ? AND next_steps = ?
                  LIMIT 1`,
            args: [attendee_id, conferenceId, postEventLabel],
          });

          if (dupeCheck.rows.length === 0) {
            await db.execute({
              sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, completed)
                    VALUES (?, ?, ?, 0)`,
              args: [attendee_id, conferenceId, postEventLabel],
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true, rsvp_status });
  } catch (error) {
    console.error('PUT /api/social-events/[id]/rsvp error:', error);
    return NextResponse.json({ error: 'Failed to update RSVP' }, { status: 500 });
  }
}
