import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let sql = `
      SELECT cad.action, COUNT(*) as count
      FROM conference_attendee_details cad
      JOIN conferences c ON cad.conference_id = c.id
      WHERE cad.action IS NOT NULL AND cad.action != ''
    `;
    const args: (string | number)[] = [];

    if (year) {
      sql += ` AND strftime('%Y', c.start_date) = ?`;
      args.push(year);
    }
    if (month) {
      sql += ` AND strftime('%m', c.start_date) = ?`;
      args.push(month.padStart(2, '0'));
    }

    sql += ` GROUP BY cad.action`;

    const result = await db.execute({ sql, args });

    const counts: Record<string, number> = {
      'Meeting Scheduled': 0,
      'Meeting Held': 0,
      'Social Conversation': 0,
      'Meeting No-Show': 0,
    };

    for (const row of result.rows) {
      const action = String(row.action ?? '');
      if (action) counts[action] = Number(row.count ?? 0);
    }

    return NextResponse.json(counts);
  } catch (error) {
    console.error('GET /api/activity-stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch activity stats' }, { status: 500 });
  }
}
