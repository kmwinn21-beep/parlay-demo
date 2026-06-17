import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { sendInputRequestEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ??
  (process.env.NODE_ENV === 'production' ? 'https://work.useparlay.app' : 'http://localhost:3000');

type Row = Record<string, unknown>;

// POST /api/calendar-intelligence/request-input/remind
// Body: { conferenceId: number, recipientEmail: string }
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const body = await request.json() as { conferenceId?: number; recipientEmail?: string };
  const { conferenceId, recipientEmail } = body;

  if (!conferenceId || !recipientEmail) {
    return NextResponse.json({ error: 'conferenceId and recipientEmail are required' }, { status: 400 });
  }

  // Look up latest unused token for this conference + recipient
  const tokenRes = await db.execute({
    sql: `SELECT t.token, t.recipient_name, t.expires_at,
                 c.name AS conference_name, c.end_date,
                 cis.score_payload,
                 u.display_name AS req_display, u.first_name, u.last_name, u.email AS req_email
          FROM input_request_tokens t
          JOIN conferences c ON c.id = t.conference_id
          LEFT JOIN calendar_intelligence_scores cis ON cis.conference_id = c.id
          JOIN users u ON u.id = t.requester_user_id
          WHERE t.conference_id = ? AND t.recipient_email = ? AND t.used_at IS NULL
          ORDER BY t.created_at DESC
          LIMIT 1`,
    args: [conferenceId, recipientEmail.trim().toLowerCase()],
  });

  const row = tokenRes.rows[0] as Row | undefined;
  if (!row) {
    return NextResponse.json({ error: 'No active token found for this recipient' }, { status: 404 });
  }

  const token = String(row.token);
  const recipientName = String(row.recipient_name ?? '');
  const conferenceName = String(row.conference_name ?? '');
  const conferenceYear = row.end_date
    ? new Date(String(row.end_date)).getUTCFullYear()
    : new Date().getUTCFullYear();
  const expiresAt = new Date(String(row.expires_at));

  const requesterName = row.req_display
    ? String(row.req_display)
    : [row.first_name, row.last_name].filter(Boolean).join(' ') || String(row.req_email);

  // Parse cal score
  let calScore: number | null = null;
  let calTier: string | null = null;
  if (row.score_payload) {
    try {
      const p = JSON.parse(String(row.score_payload)) as Record<string, unknown>;
      calScore = p.calendarRecommendationScore != null ? Number(p.calendarRecommendationScore) : null;
      calTier = p.recommendationTier ? String(p.recommendationTier) : null;
    } catch { /* ignore */ }
  }

  const aidParam = authResult.accountId ?? 'master';
  const tokenLinks = {
    attend:        `${BASE_URL}/input/respond?token=${token}&decision=confirmed&aid=${aidParam}`,
    attendReduced: `${BASE_URL}/input/respond?token=${token}&decision=attend_but_reduce&aid=${aidParam}`,
    onTheFence:    `${BASE_URL}/input/respond?token=${token}&decision=watching&aid=${aidParam}`,
    dontAttend:    `${BASE_URL}/input/respond?token=${token}&decision=passed&aid=${aidParam}`,
    evaluating:    `${BASE_URL}/input/respond?token=${token}&decision=pending_approval&aid=${aidParam}`,
  };

  const parlayLink = `${BASE_URL}/calendar-intelligence?conference=${conferenceId}`;

  await sendInputRequestEmail({
    to: recipientEmail,
    recipientName,
    conferenceName,
    conferenceYear,
    requesterName,
    calScore,
    calTier,
    tokenLinks,
    parlayLink,
    expiresAt: expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    isReminder: true,
  }).catch(() => {});

  // Log reminder
  await db.execute({
    sql: `INSERT INTO input_request_reminders (account_id, conference_id, recipient_email) VALUES (?, ?, ?)`,
    args: [authResult.accountId ?? 'master', conferenceId, recipientEmail.trim().toLowerCase()],
  });

  return NextResponse.json({ success: true });
}
