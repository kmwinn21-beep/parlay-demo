import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await dbReady;
    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) {
      return NextResponse.json({ attendees: [], companies: [], conferences: [], events: [] });
    }

    const like = `%${q}%`;

    const [attendeesResult, companiesResult, conferencesResult, eventsResult] = await Promise.all([
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
    });
  } catch (error) {
    console.error('GET /api/search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
