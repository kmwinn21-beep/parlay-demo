import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { reassignReferences, previewMerge } from '@/lib/mergeReferences';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const body = await request.json();
    const { master_id, duplicate_ids, preview } = body as { master_id: number; duplicate_ids: number[]; preview?: boolean };

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

    // Same request, same validation, same code — but rolled back. Asking the
    // merge itself what it would do is the only way the preview cannot drift
    // from it. See previewMerge.
    if (preview) {
      return NextResponse.json(await previewMerge(db, 'company', duplicate_ids, master_id));
    }

    for (const dupId of duplicate_ids) {
      if (dupId === master_id) continue;

      // Everything pointing at the duplicate moves to the master FIRST. This
      // used to be two hand-written UPDATEs — attendees and child companies —
      // and the delete below then cascaded away the nine other tables that
      // reference a company: closed deals, outreach notes and activity and
      // assignments, priority marks, user statuses, conference intel, internal
      // relationships. Merging was silently destructive. See
      // lib/mergeReferences.ts, which reads the references off the schema so a
      // table added later is carried without anyone remembering to.
      await reassignReferences(db, 'company', dupId, master_id);

      await db.execute({ sql: 'DELETE FROM companies WHERE id = ?', args: [dupId] });
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
