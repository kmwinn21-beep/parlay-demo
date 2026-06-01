import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const [pastScheduledResult, overdueFollowupsResult, heldNoNotesResult] = await Promise.all([
      db.execute({
        sql: `
          SELECT m.id, m.meeting_date, m.outcome, m.conference_id, m.attendee_id, m.meeting_type,
                 a.first_name, a.last_name, a.title,
                 c.name as company_name, c.id as company_id,
                 conf.name as conference_name
          FROM meetings m
          JOIN attendees a ON a.id = m.attendee_id
          LEFT JOIN companies c ON c.id = a.company_id
          LEFT JOIN conferences conf ON conf.id = m.conference_id
          WHERE m.outcome = 'Scheduled' AND m.meeting_date < date('now')
          ORDER BY m.meeting_date DESC
        `,
        args: [],
      }),
      db.execute({
        sql: `
          SELECT fu.id, fu.attendee_id, fu.conference_id, fu.next_steps, fu.assigned_rep, fu.created_at,
                 a.first_name, a.last_name,
                 conf.name as conference_name
          FROM follow_ups fu
          LEFT JOIN attendees a ON a.id = fu.attendee_id
          LEFT JOIN conferences conf ON conf.id = fu.conference_id
          WHERE fu.completed = 0 AND fu.created_at < date('now', '-14 days')
          ORDER BY fu.created_at ASC
        `,
        args: [],
      }),
      db.execute({
        sql: `
          SELECT m.id, m.meeting_date, m.outcome, m.conference_id, m.attendee_id, m.scheduled_by,
                 a.first_name, a.last_name, a.title,
                 c.name as company_name,
                 conf.name as conference_name
          FROM meetings m
          JOIN attendees a ON a.id = m.attendee_id
          LEFT JOIN companies c ON c.id = a.company_id
          LEFT JOIN conferences conf ON conf.id = m.conference_id
          LEFT JOIN meeting_notes mn ON mn.meeting_id = m.id
          WHERE m.outcome = 'Held' AND mn.id IS NULL
          ORDER BY m.meeting_date DESC
        `,
        args: [],
      }),
    ]);

    const pastScheduled = pastScheduledResult.rows.map((r) => ({
      id: Number(r.id),
      meeting_date: String(r.meeting_date ?? ''),
      outcome: r.outcome != null ? String(r.outcome) : null,
      conference_id: Number(r.conference_id),
      attendee_id: Number(r.attendee_id),
      meeting_type: r.meeting_type != null ? String(r.meeting_type) : null,
      first_name: String(r.first_name ?? ''),
      last_name: String(r.last_name ?? ''),
      title: r.title != null ? String(r.title) : null,
      company_name: r.company_name != null ? String(r.company_name) : null,
      company_id: r.company_id != null ? Number(r.company_id) : null,
      conference_name: r.conference_name != null ? String(r.conference_name) : null,
    }));

    const overdueFollowups = overdueFollowupsResult.rows.map((r) => ({
      id: Number(r.id),
      attendee_id: Number(r.attendee_id),
      conference_id: Number(r.conference_id),
      next_steps: r.next_steps != null ? String(r.next_steps) : null,
      assigned_rep: r.assigned_rep != null ? String(r.assigned_rep) : null,
      created_at: String(r.created_at ?? ''),
      first_name: String(r.first_name ?? ''),
      last_name: String(r.last_name ?? ''),
      conference_name: r.conference_name != null ? String(r.conference_name) : null,
    }));

    const heldNoNotes = heldNoNotesResult.rows.map((r) => ({
      id: Number(r.id),
      meeting_date: String(r.meeting_date ?? ''),
      outcome: r.outcome != null ? String(r.outcome) : null,
      conference_id: Number(r.conference_id),
      attendee_id: Number(r.attendee_id),
      scheduled_by: r.scheduled_by != null ? String(r.scheduled_by) : null,
      first_name: String(r.first_name ?? ''),
      last_name: String(r.last_name ?? ''),
      title: r.title != null ? String(r.title) : null,
      company_name: r.company_name != null ? String(r.company_name) : null,
      conference_name: r.conference_name != null ? String(r.conference_name) : null,
    }));

    return NextResponse.json(
      { pastScheduled, overdueFollowups, heldNoNotes },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('GET /api/meetings/needs-attention error:', error);
    return NextResponse.json({ error: 'Failed to fetch needs-attention data' }, { status: 500 });
  }
}
