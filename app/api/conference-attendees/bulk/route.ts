import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json() as {
      conference_ids: number[];
      attendee_ids?: number[];
      company_ids?: number[];
    };
    const { conference_ids, attendee_ids = [], company_ids = [] } = body;

    if (!conference_ids?.length) {
      return NextResponse.json({ error: 'conference_ids is required' }, { status: 400 });
    }

    // Resolve attendees for any company_ids
    let allAttendeeIds = [...attendee_ids];
    if (company_ids.length > 0) {
      const placeholders = company_ids.map(() => '?').join(',');
      const result = await db.execute({
        sql: `SELECT id FROM attendees WHERE company_id IN (${placeholders})`,
        args: company_ids,
      });
      allAttendeeIds.push(...result.rows.map(r => Number(r.id)));
    }

    const uniqueIds = Array.from(new Set(allAttendeeIds));
    if (uniqueIds.length === 0) {
      return NextResponse.json({ added: 0 });
    }

    // Build all pairs and batch-insert in chunks of 100
    const stmts: { sql: string; args: number[] }[] = [];
    for (const confId of conference_ids) {
      for (const attId of uniqueIds) {
        stmts.push({
          sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
          args: [confId, attId],
        });
      }
    }

    const CHUNK = 100;
    for (let i = 0; i < stmts.length; i += CHUNK) {
      await db.batch(stmts.slice(i, i + CHUNK), 'write');
    }

    return NextResponse.json({ added: uniqueIds.length * conference_ids.length });
  } catch (error) {
    console.error('POST /api/conference-attendees/bulk error:', error);
    return NextResponse.json({ error: 'Failed to add to conferences' }, { status: 500 });
  }
}
