import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// GET /api/conferences/[id]/outreach/companies-with-attendees — powers the
// company picker in OutreachAssignModal when opened without a pre-selected
// company. Not one of the original Section 2 routes — added because the
// assign flow needs a distinct-companies-at-this-conference list that no
// existing endpoint returns directly.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  if (!conferenceId) return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });

  try {
    const rows = await db.execute({
      sql: `SELECT DISTINCT c.id, c.name
            FROM conference_attendees ca
            JOIN attendees a ON a.id = ca.attendee_id
            JOIN companies c ON c.id = a.company_id
            WHERE ca.conference_id = ?
            ORDER BY c.name ASC`,
      args: [conferenceId],
    });

    return NextResponse.json(rows.rows.map(r => ({ id: Number(r.id), name: String(r.name) })));
  } catch (error) {
    console.error('GET /api/conferences/[id]/outreach/companies-with-attendees error:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}
