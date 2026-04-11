import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const attendeeId = searchParams.get('attendee_id');
    const conferenceId = searchParams.get('conference_id');
    const companyId = searchParams.get('company_id');
    const companyIds = searchParams.get('company_ids'); // comma-separated list

    const conditions: string[] = [];
    const args: (string | number)[] = [];

    if (attendeeId) {
      conditions.push('m.attendee_id = ?');
      args.push(attendeeId);
    }
    if (conferenceId) {
      conditions.push('m.conference_id = ?');
      args.push(conferenceId);
    }
    if (companyIds) {
      const ids = companyIds.split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length > 0) {
        conditions.push(`a.company_id IN (${ids.map(() => '?').join(',')})`);
        args.push(...ids);
      }
    } else if (companyId) {
      conditions.push('a.company_id = ?');
      args.push(companyId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.execute({
      sql: `
        SELECT
          m.id,
          m.attendee_id,
          m.conference_id,
          m.meeting_date,
          m.meeting_time,
          m.location,
          m.scheduled_by,
          m.additional_attendees,
          m.outcome,
          m.created_at,
          a.first_name,
          a.last_name,
          a.title,
          co.id AS company_id,
          co.name AS company_name,
          co.wse AS company_wse,
          c.name AS conference_name
        FROM meetings m
        JOIN attendees a ON m.attendee_id = a.id
        LEFT JOIN companies co ON a.company_id = co.id
        JOIN conferences c ON m.conference_id = c.id
        ${where}
        ORDER BY m.meeting_date DESC, m.meeting_time DESC
      `,
      args,
    });

    return NextResponse.json(
      result.rows.map((r) => ({
        id: Number(r.id),
        attendee_id: Number(r.attendee_id),
        conference_id: Number(r.conference_id),
        meeting_date: String(r.meeting_date ?? ''),
        meeting_time: String(r.meeting_time ?? ''),
        location: r.location != null ? String(r.location) : null,
        scheduled_by: r.scheduled_by != null ? String(r.scheduled_by) : null,
        additional_attendees: r.additional_attendees != null ? String(r.additional_attendees) : null,
        outcome: r.outcome != null ? String(r.outcome) : null,
        created_at: String(r.created_at ?? ''),
        first_name: String(r.first_name ?? ''),
        last_name: String(r.last_name ?? ''),
        title: r.title != null ? String(r.title) : null,
        company_id: r.company_id != null ? Number(r.company_id) : null,
        company_name: r.company_name != null ? String(r.company_name) : null,
        company_wse: r.company_wse != null ? Number(r.company_wse) : null,
        conference_name: String(r.conference_name ?? ''),
      })),
      { headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=30' } }
    );
  } catch (error) {
    console.error('GET /api/meetings error:', error);
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { attendee_id, conference_id, meeting_date, meeting_time, location, scheduled_by, additional_attendees } = body;

    if (!attendee_id || !conference_id || !meeting_date || !meeting_time) {
      return NextResponse.json({ error: 'attendee_id, conference_id, meeting_date, and meeting_time are required' }, { status: 400 });
    }

    // Look up the current display name for "Meeting Scheduled" by action_key
    const meetingScheduledConfig = await db.execute({
      sql: "SELECT value FROM config_options WHERE category = 'action' AND action_key = 'meeting_scheduled' LIMIT 1",
      args: [],
    });
    const meetingScheduledName = meetingScheduledConfig.rows.length > 0
      ? String(meetingScheduledConfig.rows[0].value)
      : 'Meeting Scheduled';

    const result = await db.execute({
      sql: `INSERT INTO meetings (attendee_id, conference_id, meeting_date, meeting_time, location, scheduled_by, additional_attendees, outcome)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        attendee_id,
        conference_id,
        meeting_date,
        meeting_time,
        location ?? null,
        scheduled_by ?? null,
        additional_attendees ?? null,
        meetingScheduledName,
      ],
    });

    // Also update the conference_attendee_details action to include the meeting scheduled action
    const existing = await db.execute({
      sql: 'SELECT action FROM conference_attendee_details WHERE attendee_id = ? AND conference_id = ?',
      args: [attendee_id, conference_id],
    });

    if (existing.rows.length > 0) {
      const currentAction = String(existing.rows[0].action ?? '');
      const actions = new Set(currentAction.split(',').map(a => a.trim()).filter(Boolean));
      actions.add(meetingScheduledName);
      await db.execute({
        sql: 'UPDATE conference_attendee_details SET action = ? WHERE attendee_id = ? AND conference_id = ?',
        args: [Array.from(actions).join(','), attendee_id, conference_id],
      });
    } else {
      await db.execute({
        sql: 'INSERT OR REPLACE INTO conference_attendee_details (attendee_id, conference_id, action) VALUES (?, ?, ?)',
        args: [attendee_id, conference_id, meetingScheduledName],
      });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('POST /api/meetings error:', error);
    return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { id, outcome } = body;

    if (!id || outcome === undefined) {
      return NextResponse.json({ error: 'id and outcome are required' }, { status: 400 });
    }

    await db.execute({
      sql: 'UPDATE meetings SET outcome = ? WHERE id = ?',
      args: [outcome, id],
    });

    // Update the conference_attendee_details action to match outcome
    const meeting = await db.execute({
      sql: 'SELECT attendee_id, conference_id FROM meetings WHERE id = ?',
      args: [id],
    });

    if (meeting.rows.length > 0) {
      const { attendee_id, conference_id } = meeting.rows[0];
      const existing = await db.execute({
        sql: 'SELECT action FROM conference_attendee_details WHERE attendee_id = ? AND conference_id = ?',
        args: [attendee_id as number, conference_id as number],
      });

      if (existing.rows.length > 0) {
        const currentAction = String(existing.rows[0].action ?? '');
        const actions = new Set(currentAction.split(',').map(a => a.trim()).filter(Boolean));
        if (outcome) {
          actions.add(outcome);

          // Fetch all action configs once to resolve keys and conflicting values
          const actionConfigs = await db.execute({
            sql: "SELECT value, action_key FROM config_options WHERE category = 'action'",
            args: [],
          });
          const byValue = new Map(actionConfigs.rows.map(r => [String(r.value), r.action_key ? String(r.action_key) : null]));
          const byKey = new Map(actionConfigs.rows.filter(r => r.action_key).map(r => [String(r.action_key), String(r.value)]));

          const outcomeKey = byValue.get(outcome) ?? null;
          if (outcomeKey === 'cancelled' || outcomeKey === 'no_show') {
            const held = byKey.get('meeting_held'); if (held) actions.delete(held);
            const pending = byKey.get('pending'); if (pending) actions.delete(pending);
          }
          if (outcomeKey === 'meeting_scheduled') {
            const cancelled = byKey.get('cancelled'); if (cancelled) actions.delete(cancelled);
          }
        }
        await db.execute({
          sql: 'UPDATE conference_attendee_details SET action = ? WHERE attendee_id = ? AND conference_id = ?',
          args: [Array.from(actions).join(','), attendee_id as number, conference_id as number],
        });
      } else if (outcome) {
        await db.execute({
          sql: 'INSERT OR REPLACE INTO conference_attendee_details (attendee_id, conference_id, action) VALUES (?, ?, ?)',
          args: [attendee_id as number, conference_id as number, outcome],
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/meetings error:', error);
    return NextResponse.json({ error: 'Failed to update meeting' }, { status: 500 });
  }
}
