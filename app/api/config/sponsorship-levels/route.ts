import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  try {
    const result = await db.execute({
      sql: `SELECT * FROM config_options WHERE category = 'sponsorship_level' ORDER BY sort_order ASC`,
      args: [],
    });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/config/sponsorship-levels error:', error);
    return NextResponse.json({ error: 'Failed to fetch sponsorship levels' }, { status: 500 });
  }
}
