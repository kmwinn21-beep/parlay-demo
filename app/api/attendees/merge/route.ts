import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { requireCapability } from '@/lib/requireCapability';
import { reassignReferences, previewMerge } from '@/lib/mergeReferences';

export async function POST(request: NextRequest) {
  // Merging is destructive — one record absorbs another and the loser is
  // gone. Governed by the Role Scope matrix, which until now only hid the UI.
  const authResult = await requireCapability(request, 'delete_merge');
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const body = await request.json();
    const { master_id, duplicate_ids, preview } = body as { master_id: number; duplicate_ids: number[]; preview?: boolean };

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

    // Same request, same validation, same code — but rolled back. Asking the
    // merge itself what it would do is the only way the preview cannot drift
    // from it. See previewMerge.
    if (preview) {
      return NextResponse.json(await previewMerge(db, 'attendee', duplicate_ids, master_id));
    }

    for (const dupId of duplicate_ids) {
      if (dupId === master_id) continue;

      // Everything pointing at the duplicate moves to the master FIRST.
      //
      // This used to move only the conference links, so the delete below
      // cascaded away the duplicate's meetings, follow-ups, conference targets,
      // per-conference details, product signals, outreach assignments and
      // social RSVPs, and orphaned its touchpoints and notes. It could also
      // simply fail: contact_conference_history and form_submissions reference
      // attendees ON DELETE NO ACTION, so deleting an attendee that had either
      // raised a constraint error.
      //
      // conference_attendees is carried by the same pass. Its UNIQUE
      // (conference_id, attendee_id) is what makes a link the master already
      // has collapse rather than duplicate — the membership is the same
      // membership, and `source` stays on whichever row survives, so a
      // bulk-imported row is not turned into an individual add.
      await reassignReferences(db, 'attendee', dupId, master_id);

      await db.execute({ sql: 'DELETE FROM attendees WHERE id = ?', args: [dupId] });
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
