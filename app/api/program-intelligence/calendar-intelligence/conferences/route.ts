import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    await dbReady;
    const rows = await db.execute({
      sql: `SELECT c.id, c.name, c.date, c.location, c.is_historical
        FROM conferences c
        ORDER BY c.date DESC`,
      args: [],
    });

    const safeCount = async (sql: string, args: Array<string | number | null> = []) => {
      try {
        const res = await db.execute({ sql, args });
        return Number((res.rows[0] as Record<string, unknown>)?.cnt ?? 0);
      } catch {
        return 0;
      }
    };

    const conferences = await Promise.all((rows.rows as any[]).map(async (r) => {
      const isHistorical = Number(r.is_historical ?? 0) === 1;
      const conferenceId = Number(r.id);
      const attendeeCount = await safeCount('SELECT COUNT(*) AS cnt FROM conference_attendees WHERE conference_id=?', [conferenceId]);
      const companyCount = await safeCount(
        'SELECT COUNT(DISTINCT a.company_id) AS cnt FROM conference_attendees ca JOIN attendees a ON a.id = ca.attendee_id WHERE ca.conference_id=?',
        [conferenceId],
      );
      const meetingCount = await safeCount('SELECT COUNT(*) AS cnt FROM meetings WHERE conference_id=?', [conferenceId]);
      const followupCount = await safeCount('SELECT COUNT(*) AS cnt FROM follow_ups WHERE conference_id=?', [conferenceId]);
      const budgetCount = await safeCount('SELECT COUNT(*) AS cnt FROM conference_budget WHERE conference_id=?', [conferenceId]);
      const status = isHistorical ? 'historical' : (meetingCount > 0 || followupCount > 0 ? 'completed' : 'active');
      return {
        conference_id: conferenceId,
        conference_name: String(r.name ?? ''),
        status,
        is_historical: isHistorical,
        start_date: r.date ? String(r.date) : null,
        end_date: r.date ? String(r.date) : null,
        location: r.location ? String(r.location) : null,
        attendee_count: attendeeCount,
        company_count: companyCount,
        has_targeting_data: companyCount > 0,
        has_budget_data: budgetCount > 0,
        has_company_units: companyCount > 0,
        has_execution_data: meetingCount > 0 || followupCount > 0,
      };
    }));

    return NextResponse.json({ conferences });
  } catch (error) {
    console.error('GET /api/program-intelligence/calendar-intelligence/conferences error:', error);
    return NextResponse.json({ conferences: [] });
  }
}
