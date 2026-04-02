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

    const master = db.prepare('SELECT id FROM companies WHERE id = ?').get(master_id);
    if (!master) {
      return NextResponse.json({ error: 'Master company not found' }, { status: 404 });
    }

    const mergeTransaction = db.transaction(() => {
      for (const dupId of duplicate_ids) {
        if (dupId === master_id) continue;

        // Reassign all attendees from duplicate to master
        db.prepare('UPDATE attendees SET company_id = ? WHERE company_id = ?').run(master_id, dupId);

        // Delete the duplicate company
        db.prepare('DELETE FROM companies WHERE id = ?').run(dupId);
      }
    });

    mergeTransaction();

    const merged = db
      .prepare(
        `SELECT co.*, COUNT(DISTINCT a.id) as attendee_count
         FROM companies co
         LEFT JOIN attendees a ON co.id = a.company_id
         WHERE co.id = ?
         GROUP BY co.id`
      )
      .get(master_id);

    return NextResponse.json({ success: true, company: merged });
  } catch (error) {
    console.error('POST /api/companies/merge error:', error);
    return NextResponse.json({ error: 'Failed to merge companies' }, { status: 500 });
  }
}
