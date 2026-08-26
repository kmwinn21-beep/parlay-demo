import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// DELETE /api/conferences/[id]/outreach/[companyId]/attendees/[attendeeId] —
// removes one attendee from a company's outreach section by dropping their
// outreach assignments: since assignment is per attendee, being unassigned is
// what "not on the list" means.
//
// Their logged activity and notes are deliberately left alone — removing
// someone from the list shouldn't erase the record of having contacted them.
// The exclusion row is still written so an attendee can't reappear through any
// path that predates per-attendee assignment.
export async function DELETE(request: NextRequest, { params }: { params: { id: string; companyId: string; attendeeId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  const companyId = Number(params.companyId);
  const attendeeId = Number(params.attendeeId);
  if (!conferenceId || !companyId || !attendeeId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    await db.execute({
      sql: `DELETE FROM outreach_assignments WHERE conference_id = ? AND attendee_id = ?`,
      args: [conferenceId, attendeeId],
    });
    await db.execute({
      sql: `INSERT INTO outreach_excluded_attendees (conference_id, company_id, attendee_id)
            VALUES (?, ?, ?)
            ON CONFLICT (conference_id, company_id, attendee_id) DO NOTHING`,
      args: [conferenceId, companyId, attendeeId],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id]/outreach/[companyId]/attendees/[attendeeId] error:', error);
    return NextResponse.json({ error: 'Failed to remove attendee' }, { status: 500 });
  }
}
