import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { parent_id, child_ids } = body as { parent_id: number; child_ids: number[] };

    if (!parent_id || !child_ids || child_ids.length === 0) {
      return NextResponse.json({ error: 'parent_id and child_ids are required' }, { status: 400 });
    }

    // Verify parent exists
    const parentResult = await db.execute({
      sql: 'SELECT id FROM companies WHERE id = ?',
      args: [parent_id],
    });
    if (parentResult.rows.length === 0) {
      return NextResponse.json({ error: 'Parent company not found' }, { status: 404 });
    }

    // Set parent company's entity_structure to 'Parent'
    await db.execute({
      sql: "UPDATE companies SET entity_structure = 'Parent' WHERE id = ?",
      args: [parent_id],
    });

    // For each child: set parent_company_id and entity_structure (attendees stay with their child company)
    for (const childId of child_ids) {
      if (childId === parent_id) continue;

      await db.batch(
        [
          // Set child's parent and entity_structure
          {
            sql: "UPDATE companies SET parent_company_id = ?, entity_structure = 'Child' WHERE id = ?",
            args: [parent_id, childId],
          },
          // Reassign any grandchild companies to parent
          {
            sql: 'UPDATE companies SET parent_company_id = ? WHERE parent_company_id = ?',
            args: [parent_id, childId],
          },
        ],
        'write'
      );
    }

    // Re-set child companies' parent (the ones we just processed) back to parent
    // since the grandchild reassignment above may have moved them
    for (const childId of child_ids) {
      if (childId === parent_id) continue;
      await db.execute({
        sql: "UPDATE companies SET parent_company_id = ?, entity_structure = 'Child' WHERE id = ?",
        args: [parent_id, childId],
      });
    }

    const result = await db.execute({
      sql: `SELECT co.*, COUNT(DISTINCT a.id) as attendee_count
            FROM companies co
            LEFT JOIN attendees a ON co.id = a.company_id
            WHERE co.id = ?
            GROUP BY co.id`,
      args: [parent_id],
    });

    return NextResponse.json({ success: true, company: result.rows[0] });
  } catch (error) {
    console.error('POST /api/companies/parent-child error:', error);
    return NextResponse.json({ error: 'Failed to create parent/child relationship' }, { status: 500 });
  }
}
