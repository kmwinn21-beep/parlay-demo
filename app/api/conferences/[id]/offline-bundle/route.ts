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
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  const [
    confRes,
    attendeesRes,
    meetingsRes,
    followUpsRes,
    targetsRes,
    configRes,
  ] = await Promise.all([
    db.execute({
      sql: 'SELECT id, name, start_date, end_date, location FROM conferences WHERE id = ?',
      args: [confId],
    }),
    db.execute({
      sql: `SELECT
              a.id, a.first_name, a.last_name, a.title, a.email,
              a.status, a.seniority, a.company_id,
              c.name AS company_name, c.company_type, c.assigned_user,
              ca.conference_id
            FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id AND ca.conference_id = ?
            LEFT JOIN companies c ON c.id = a.company_id
            ORDER BY a.last_name, a.first_name`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT m.id, m.attendee_id, m.conference_id, m.meeting_date, m.meeting_time,
                   m.location, m.scheduled_by, m.outcome, m.meeting_type,
                   a.first_name, a.last_name, a.title, a.company_id,
                   c.name AS company_name
            FROM meetings m
            JOIN attendees a ON a.id = m.attendee_id
            LEFT JOIN companies c ON c.id = a.company_id
            WHERE m.conference_id = ?
            ORDER BY m.meeting_date, m.meeting_time`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT f.id, f.attendee_id, f.conference_id, f.assigned_rep,
                   f.completed, f.due_date, f.notes, f.type
            FROM follow_ups f
            WHERE f.conference_id = ?`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT ct.attendee_id, ct.conference_id, ct.tier,
                   a.first_name, a.last_name, a.title
            FROM conference_targets ct
            JOIN attendees a ON a.id = ct.attendee_id
            WHERE ct.conference_id = ?`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT id, category, value, action_key FROM config_options
            WHERE category IN ('user', 'action', 'status', 'company_type',
                               'seniority', 'unit_type', 'rep_relationship_type')
            ORDER BY category, id`,
      args: [],
    }),
  ]);

  if (!confRes.rows[0]) {
    return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
  }

  // Collect unique companies from attendees for offline company store
  const companyMap = new Map<number, Record<string, unknown>>();
  for (const a of attendeesRes.rows) {
    const cid = a.company_id as number | null;
    if (cid != null && !companyMap.has(cid)) {
      companyMap.set(cid, {
        id: cid,
        name: a.company_name,
        company_type: a.company_type,
        assigned_user: a.assigned_user,
      });
    }
  }

  const bundle = {
    conference: confRes.rows[0],
    attendees: attendeesRes.rows,
    companies: Array.from(companyMap.values()),
    meetings: meetingsRes.rows,
    follow_ups: followUpsRes.rows,
    targets: targetsRes.rows,
    config_options: configRes.rows,
    synced_at: new Date().toISOString(),
  };

  return NextResponse.json(bundle);
}
