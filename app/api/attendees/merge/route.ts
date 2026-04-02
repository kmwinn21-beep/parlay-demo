import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { master_id, duplicate_ids } = body as { master_id: number; duplicate_ids: number[] };

    if (!master_id || !duplicate_ids || duplicate_ids.length === 0) {
      return NextResponse.json({ error: 'master_id and duplicate_ids are required' }, { status: 400 });
    }

    const db = getDb();

    const master = db.prepare('SELECT id FROM attendees WHERE id = ?').get(master_id);
    if (!master) {
      return NextResponse.json({ error: 'Master attendee not found' }, { status: 404 });
    }

    const mergeTransaction = db.transaction(() => {
      for (const dupId of duplicate_ids) {
        if (dupId === master_id) continue;

        // Get all conference associations from the duplicate
        const dupConferences = db
          .prepare('SELECT conference_id FROM conference_attendees WHERE attendee_id = ?')
          .all(dupId) as Array<{ conference_id: number }>;

        // Move conference associations to master
        for (const ca of dupConferences) {
          db.prepare(
            'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)'
          ).run(ca.conference_id, master_id);
        }

        // Delete the duplicate attendee's conference associations
        db.prepare('DELETE FROM conference_attendees WHERE attendee_id = ?').run(dupId);

        // Delete the duplicate attendee
        db.prepare('DELETE FROM attendees WHERE id = ?').run(dupId);
      }
    });

    mergeTransaction();

    const merged = db
      .prepare(
        `SELECT a.*, co.name as company_name
         FROM attendees a
         LEFT JOIN companies co ON a.company_id = co.id
         WHERE a.id = ?`
      )
      .get(master_id);

    return NextResponse.json({ success: true, attendee: merged });
  } catch (error) {
    console.error('POST /api/attendees/merge error:', error);
    return NextResponse.json({ error: 'Failed to merge attendees' }, { status: 500 });
  }
}
