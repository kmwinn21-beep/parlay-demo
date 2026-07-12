import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) {
      return NextResponse.json({ attendees: [], companies: [], conferences: [], events: [], meetings: [], followUps: [] });
    }

    const like = `%${q}%`;

    const [attendeesResult, companiesResult, conferencesResult, eventsResult, meetingsResult, followUpsResult] = await Promise.all([
      db.execute({
        sql: `SELECT a.id, a.first_name, a.last_name, a.title, co.name AS company_name
              FROM attendees a
              LEFT JOIN companies co ON a.company_id = co.id
              WHERE a.first_name LIKE ? OR a.last_name LIKE ? OR (a.first_name || ' ' || a.last_name) LIKE ?
              LIMIT 6`,
        args: [like, like, like],
      }),
      db.execute({
        sql: `SELECT id, name, company_type FROM companies WHERE name LIKE ? LIMIT 6`,
        args: [like],
      }),
      db.execute({
        sql: `SELECT id, name, start_date FROM conferences WHERE name LIKE ? ORDER BY start_date DESC LIMIT 6`,
        args: [like],
      }),
      db.execute({
        sql: `SELECT se.id, COALESCE(se.event_name, se.event_type) AS event_label, se.event_type,
                     se.conference_id, c.name AS conference_name
              FROM social_events se
              LEFT JOIN conferences c ON se.conference_id = c.id
              WHERE se.event_name LIKE ? OR se.event_type LIKE ? OR se.host LIKE ?
              LIMIT 6`,
        args: [like, like, like],
      }),
      db.execute({
        sql: `SELECT m.id, m.meeting_date, m.outcome, a.first_name, a.last_name,
                     co.name AS company_name, c.name AS conference_name
              FROM meetings m
              JOIN attendees a ON m.attendee_id = a.id
              LEFT JOIN companies co ON a.company_id = co.id
              LEFT JOIN conferences c ON m.conference_id = c.id
              WHERE (a.first_name || ' ' || a.last_name) LIKE ? OR co.name LIKE ?
                 OR c.name LIKE ? OR m.location LIKE ?
              ORDER BY m.meeting_date DESC
              LIMIT 6`,
        args: [like, like, like, like],
      }),
      db.execute({
        sql: `SELECT f.id, f.attendee_id, f.next_steps, f.completed, a.first_name, a.last_name,
                     co.name AS company_name, c.name AS conference_name
              FROM follow_ups f
              JOIN attendees a ON f.attendee_id = a.id
              LEFT JOIN companies co ON a.company_id = co.id
              LEFT JOIN conferences c ON f.conference_id = c.id
              WHERE (a.first_name || ' ' || a.last_name) LIKE ? OR co.name LIKE ?
                 OR c.name LIKE ? OR f.next_steps LIKE ?
              ORDER BY f.created_at DESC
              LIMIT 6`,
        args: [like, like, like, like],
      }),
    ]);

    return NextResponse.json({
      attendees: attendeesResult.rows.map(r => ({
        id: Number(r.id),
        name: `${r.first_name} ${r.last_name}`,
        subtitle: [r.title, r.company_name].filter(Boolean).join(' · ') || null,
      })),
      companies: companiesResult.rows.map(r => ({
        id: Number(r.id),
        name: String(r.name ?? ''),
        subtitle: r.company_type ? String(r.company_type) : null,
      })),
      conferences: conferencesResult.rows.map(r => ({
        id: Number(r.id),
        name: String(r.name ?? ''),
        subtitle: r.start_date
          ? new Date(String(r.start_date) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : null,
      })),
      events: eventsResult.rows.map(r => ({
        id: Number(r.id),
        name: r.event_label ? String(r.event_label) : 'Event',
        subtitle: r.conference_name ? String(r.conference_name) : null,
        conference_id: Number(r.conference_id),
      })),
      meetings: meetingsResult.rows.map(r => ({
        id: Number(r.id),
        name: `Meeting: ${r.first_name} ${r.last_name}`,
        subtitle: [r.company_name, r.conference_name].filter(Boolean).join(' · ') || null,
      })),
      followUps: followUpsResult.rows.map(r => ({
        id: Number(r.id),
        attendee_id: Number(r.attendee_id),
        name: `Follow-up: ${r.first_name} ${r.last_name}`,
        subtitle: r.next_steps ? String(r.next_steps) : ([r.company_name, r.conference_name].filter(Boolean).join(' · ') || null),
      })),
    });
  } catch (error) {
    console.error('GET /api/search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
