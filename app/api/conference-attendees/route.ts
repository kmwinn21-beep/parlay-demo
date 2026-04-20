import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const result = await db.execute({
      sql: 'SELECT conference_id, attendee_id FROM conference_attendees',
      args: [],
    });
    return NextResponse.json(
      result.rows.map(r => ({ conference_id: Number(r.conference_id), attendee_id: Number(r.attendee_id) })),
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (error) {
    console.error('GET /api/conference-attendees error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
