import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  await dbReady;
  const rows = await db.execute({ sql: `SELECT c.id, c.name, c.date, c.location, c.is_historical,
      (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) AS attendee_count,
      (SELECT COUNT(DISTINCT a.company_id) FROM conference_attendees ca JOIN attendees a ON a.id = ca.attendee_id WHERE ca.conference_id = c.id) AS company_count,
      (SELECT COUNT(*) FROM meetings m WHERE m.conference_id = c.id) AS meeting_count,
      (SELECT COUNT(*) FROM follow_ups f WHERE f.conference_id = c.id) AS followup_count,
      (SELECT COUNT(*) FROM conference_budget cb WHERE cb.conference_id = c.id) AS budget_count
      FROM conferences c ORDER BY c.date DESC`, args: [] });

  const conferences = (rows.rows as any[]).map((r) => {
    const isHistorical = Number(r.is_historical ?? 0) === 1;
    const meetingCount = Number(r.meeting_count ?? 0);
    const followupCount = Number(r.followup_count ?? 0);
    const status = isHistorical ? 'historical' : (meetingCount > 0 || followupCount > 0 ? 'completed' : 'active');
    return {
      conference_id: Number(r.id),
      conference_name: String(r.name ?? ''),
      status,
      is_historical: isHistorical,
      start_date: r.date ? String(r.date) : null,
      end_date: r.date ? String(r.date) : null,
      location: r.location ? String(r.location) : null,
      attendee_count: Number(r.attendee_count ?? 0),
      company_count: Number(r.company_count ?? 0),
      has_targeting_data: Number(r.company_count ?? 0) > 0,
      has_budget_data: Number(r.budget_count ?? 0) > 0,
      has_company_units: Number(r.company_count ?? 0) > 0,
      has_execution_data: meetingCount > 0 || followupCount > 0,
    };
  });

  return NextResponse.json({ conferences });
}
