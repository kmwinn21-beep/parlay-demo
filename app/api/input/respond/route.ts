import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

const VALID_DECISIONS = new Set([
  'confirmed',
  'attend_but_reduce',
  'watching',
  'passed',
  'pending_approval',
]);

type Row = Record<string, unknown>;

// ── POST /api/input/respond ────────────────────────────────────────────────────
// Public endpoint — no auth. Validated by one-time token only.
// Body: { token: string, decision: string, aid: string }
export async function POST(request: NextRequest) {
  const body = await request.json() as { token?: string; decision?: string; aid?: string };
  const { token, decision, aid } = body;

  if (!token || !decision || !aid) {
    return NextResponse.json({ error: 'token, decision, and aid are required' }, { status: 400 });
  }
  if (!VALID_DECISIONS.has(decision)) {
    return NextResponse.json({ error: 'Invalid decision value' }, { status: 400 });
  }

  const db = await getDb(aid).catch(() => null);
  if (!db) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Look up token
  const tokenRes = await db.execute({
    sql: `SELECT t.*, c.name AS conference_name
          FROM input_request_tokens t
          JOIN conferences c ON c.id = t.conference_id
          WHERE t.token = ?`,
    args: [token],
  });
  const row = tokenRes.rows[0] as Row | undefined;

  if (!row) {
    return NextResponse.json({ error: 'invalid_token', message: 'This link is not valid.' }, { status: 404 });
  }

  if (row.used_at) {
    return NextResponse.json({
      error: 'already_used',
      message: 'Your input has already been recorded.',
      conferenceName: String(row.conference_name ?? ''),
      decisionLogged: String(row.decision_logged ?? ''),
    }, { status: 409 });
  }

  const expiresAt = new Date(String(row.expires_at));
  if (Date.now() > expiresAt.getTime()) {
    return NextResponse.json({
      error: 'expired',
      message: 'This link has expired.',
      conferenceName: String(row.conference_name ?? ''),
      expiresAt: expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    }, { status: 410 });
  }

  const conferenceId = Number(row.conference_id);
  const recipientUserId = row.recipient_user_id != null ? Number(row.recipient_user_id) : null;

  // Write decision for system users
  if (recipientUserId) {
    await db.execute({
      sql: `INSERT INTO user_conference_decisions (user_id, conference_id, decision, note, updated_at)
            VALUES (?, ?, ?, NULL, datetime('now'))
            ON CONFLICT(user_id, conference_id) DO UPDATE SET
              decision = excluded.decision, updated_at = datetime('now')`,
      args: [recipientUserId, conferenceId, decision],
    });
  }
  // Guest responses stored in token record only (user_conference_decisions requires NOT NULL user_id)

  // Mark token as used
  await db.execute({
    sql: `UPDATE input_request_tokens SET used_at = datetime('now'), decision_logged = ? WHERE token = ?`,
    args: [decision, token],
  });

  // Update request status
  await db.execute({
    sql: `UPDATE input_requests SET status = 'responded' WHERE conference_id = ? AND recipient_email = ?`,
    args: [conferenceId, String(row.recipient_email)],
  });

  return NextResponse.json({
    success: true,
    conferenceName: String(row.conference_name ?? ''),
    decision,
    isSystemUser: recipientUserId != null,
    conferenceId,
  });
}
