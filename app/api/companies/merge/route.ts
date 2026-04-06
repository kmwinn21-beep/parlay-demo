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
      sql: 'SELECT id FROM companies WHERE id = ?',
      args: [master_id],
    });
    if (masterResult.rows.length === 0) {
      return NextResponse.json({ error: 'Master company not found' }, { status: 404 });
    }

    for (const dupId of duplicate_ids) {
      if (dupId === master_id) continue;

      await db.batch(
        [
          // Reassign all attendees from duplicate to master
          { sql: 'UPDATE attendees SET company_id = ? WHERE company_id = ?', args: [master_id, dupId] },
          // Reassign child companies from duplicate to master
          { sql: 'UPDATE companies SET parent_company_id = ? WHERE parent_company_id = ?', args: [master_id, dupId] },
          // Delete the duplicate company
          { sql: 'DELETE FROM companies WHERE id = ?', args: [dupId] },
        ],
        'write'
      );
    }

    const mergedResult = await db.execute({
      sql: `SELECT co.*, COUNT(DISTINCT a.id) as attendee_count
            FROM companies co
            LEFT JOIN attendees a ON co.id = a.company_id
            WHERE co.id = ?
            GROUP BY co.id`,
      args: [master_id],
    });

    return NextResponse.json({ success: true, company: mergedResult.rows[0] });
  } catch (error) {
    console.error('POST /api/companies/merge error:', error);
    return NextResponse.json({ error: 'Failed to merge companies' }, { status: 500 });
  }
}
