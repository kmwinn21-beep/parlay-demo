import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { getSessionUser } from '@/lib/auth';

/**
 * Push a parent's company type and assigned rep onto everything beneath it.
 *
 * Only non-empty values travel: a parent with no rep should not strip the reps
 * off its children.
 */
async function applyInheritance(
  db: Awaited<ReturnType<typeof getDb>>,
  parentId: number,
  parentType: string | null,
  parentRep: string | null,
): Promise<number> {
  const sets: string[] = [];
  const args: string[] = [];
  if (parentType != null && String(parentType).trim() !== '') { sets.push('company_type = ?'); args.push(String(parentType)); }
  if (parentRep != null && String(parentRep).trim() !== '') { sets.push('assigned_user = ?'); args.push(String(parentRep)); }
  if (sets.length === 0) return 0;
  const res = await db.execute({
    sql: `UPDATE companies SET ${sets.join(', ')}, updated_at = datetime('now') WHERE parent_company_id = ?`,
    args: [...args, parentId],
  });
  return Number(res.rowsAffected ?? 0);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const body = await request.json();
    const { parent_id, child_ids } = body as { parent_id: number; child_ids: number[] };

    if (!parent_id || !child_ids || child_ids.length === 0) {
      return NextResponse.json({ error: 'parent_id and child_ids are required' }, { status: 400 });
    }

    // Verify parent exists, and read what its children inherit from it.
    const parentResult = await db.execute({
      sql: 'SELECT id, company_type, assigned_user FROM companies WHERE id = ?',
      args: [parent_id],
    });
    if (parentResult.rows.length === 0) {
      return NextResponse.json({ error: 'Parent company not found' }, { status: 404 });
    }
    const parentType = parentResult.rows[0].company_type as string | null;
    const parentRep = parentResult.rows[0].assigned_user as string | null;

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

    // Type and rep come down from the parent: a child of a customer is a
    // customer, and whoever owns the parent owns the family. Applied to every
    // company now hanging off this parent, which includes the grandchildren the
    // step above re-pointed here.
    //
    // A blank on the parent is left alone rather than copied down — clearing a
    // child's rep because nobody owns the parent loses information the parent
    // never had.
    await applyInheritance(db, parent_id, parentType, parentRep);

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
