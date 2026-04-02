import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { master_id, duplicate_ids } = body as { master_id: number; duplicate_ids: number[] };

    if (!master_id || !duplicate_ids || duplicate_ids.length === 0) {
      return NextResponse.json({ error: 'master_id and duplicate_ids are required' }, { status: 400 });
    }

    const masterResult = await db.execute({
      sql: 'SELECT id FROM attendees WHERE id = ?',
      args: [master_id],
    });
    if (masterResult.rows.length === 0) {
      return NextResponse.json({ error: 'Master attendee not found' }, { status: 404 });
    }

    for (const dupId of duplicate_ids) {
      if (dupId === master_id) continue;

      // Get all conference associations from the duplicate
      const dupConferencesResult = await db.execute({
        sql: 'SELECT conference_id FROM conference_attendees WHERE attendee_id = ?',
        args: [dupId],
      });

      const statements: Array<{ sql: string; args: (string | number | null)[] }> = [];

      // Move conference associations to master
      for (const ca of dupConferencesResult.rows) {
        statements.push({
          sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
          args: [ca.conference_id as number, master_id],
        });
      }

      // Delete the duplicate attendee's conference associations and the duplicate itself
      statements.push({ sql: 'DELETE FROM conference_attendees WHERE attendee_id = ?', args: [dupId] });
      statements.push({ sql: 'DELETE FROM attendees WHERE id = ?', args: [dupId] });

      if (statements.length > 0) {
        await db.batch(statements, 'write');
      }
    }

    const mergedResult = await db.execute({
      sql: `SELECT a.*, co.name as company_name
            FROM attendees a
            LEFT JOIN companies co ON a.company_id = co.id
            WHERE a.id = ?`,
      args: [master_id],
    });

    return NextResponse.json({ success: true, attendee: mergedResult.rows[0] });
  } catch (error) {
    console.error('POST /api/attendees/merge error:', error);
    return NextResponse.json({ error: 'Failed to merge attendees' }, { status: 500 });
  }
}
