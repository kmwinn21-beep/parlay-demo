import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// DELETE /api/conferences/[id]/outreach/[companyId]/attendees/[attendeeId] —
// removes one attendee from a company's outreach section. The attendee list is
// otherwise fully derived (every conference attendee at an assigned company),
// so this just records an exclusion rather than deleting any attendee/activity
// data — their past logged activity and notes are untouched, they simply stop
// appearing in this company's outreach attendee list.
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
