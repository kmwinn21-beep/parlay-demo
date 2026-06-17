import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

// GET /api/calendar-intelligence/my-input-status
// Returns the current user's input decisions + pending input requests across all conferences.
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const [decisionsRes, requestsRes] = await Promise.all([
    db.execute({
      sql: `SELECT conference_id, decision FROM user_conference_decisions WHERE user_id = ?`,
      args: [authResult.id],
    }),
    db.execute({
      sql: `SELECT conference_id FROM input_requests WHERE recipient_email = ? AND status = 'pending'`,
      args: [authResult.email.trim().toLowerCase()],
    }).catch(() => ({ rows: [] as Row[] })),
  ]);

  const decisions: Record<number, string> = {};
  for (const r of decisionsRes.rows as Row[]) {
    decisions[Number(r.conference_id)] = String(r.decision);
  }

  const pendingConferenceIds = (requestsRes.rows as Row[]).map(r => Number(r.conference_id));

  return NextResponse.json({
    decisions,
    pendingConferenceIds,
    totalPending: pendingConferenceIds.length,
  });
}
