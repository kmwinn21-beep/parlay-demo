import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { sendInputRequestEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ??
  (process.env.NODE_ENV === 'production' ? 'https://work.useparlay.app' : 'http://localhost:3000');

type Row = Record<string, unknown>;

type Recipient = {
  userId?: number;
  email: string;
  name: string;
  title?: string;
};

// ── POST /api/calendar-intelligence/request-input ─────────────────────────────
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const body = await request.json() as {
    conferenceId: number;
    recipients: Recipient[];
  };
  const { conferenceId, recipients } = body;

  if (!conferenceId || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: 'conferenceId and at least one recipient are required' }, { status: 400 });
  }

  // Look up conference name + cal score for email
  const confRes = await db.execute({
    sql: `SELECT c.name, date(c.end_date) AS end_date, cis.score_payload
          FROM conferences c
          LEFT JOIN calendar_intelligence_scores cis ON cis.conference_id = c.id
          WHERE c.id = ?`,
    args: [conferenceId],
  });
  const conf = confRes.rows[0] as Row | undefined;
  if (!conf) return NextResponse.json({ error: 'Conference not found' }, { status: 404 });

  const conferenceName = String(conf.name ?? '');
  const conferenceYear = conf.end_date ? new Date(String(conf.end_date)).getUTCFullYear() : new Date().getUTCFullYear();

  // Parse cached score payload (may be absent if scoring hasn't run yet)
  let calScore: number | null = null;
  let calTier: string | null = null;
  if (conf.score_payload) {
    try {
      const payload = JSON.parse(String(conf.score_payload)) as Record<string, unknown>;
      calScore = payload.calendarRecommendationScore != null ? Number(payload.calendarRecommendationScore) : null;
      calTier = payload.recommendationTier ? String(payload.recommendationTier) : null;
    } catch { /* ignore malformed payload */ }
  }

  // Requester display name
  const requesterRes = await db.execute({
    sql: `SELECT display_name, first_name, last_name FROM users WHERE id = ?`,
    args: [authResult.id],
  });
  const reqRow = requesterRes.rows[0] as Row | undefined;
  const requesterName = reqRow?.display_name
    ? String(reqRow.display_name)
    : [reqRow?.first_name, reqRow?.last_name].filter(Boolean).join(' ') || authResult.email;

  const parlayLink = `${BASE_URL}/calendar-intelligence?conference=${conferenceId}`;
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  let requestsSent = 0;

  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();
    const name = recipient.name.trim();
    const title = recipient.title?.trim() ?? null;
    const recipientUserId = recipient.userId ?? null;

    // Generate 32-char hex token
    const token = crypto.randomUUID().replace(/-/g, '');

    // Insert token record
    await db.execute({
      sql: `INSERT INTO input_request_tokens
              (token, account_id, conference_id, requester_user_id, recipient_user_id,
               recipient_email, recipient_name, recipient_title, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        token,
        String(authResult.accountId),
        conferenceId,
        authResult.id,
        recipientUserId,
        email,
        name,
        title,
        expiresAt.toISOString(),
      ],
    });

    // Upsert into input_requests (update status + reset if re-requesting)
    await db.execute({
      sql: `INSERT INTO input_requests
              (conference_id, requester_user_id, recipient_email, recipient_name, recipient_title, recipient_user_id, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
            ON CONFLICT(conference_id, recipient_email)
            DO UPDATE SET
              status = 'pending',
              requester_user_id = excluded.requester_user_id,
              recipient_name = excluded.recipient_name,
              recipient_title = excluded.recipient_title,
              recipient_user_id = excluded.recipient_user_id,
              created_at = datetime('now')`,
      args: [conferenceId, authResult.id, email, name, title, recipientUserId],
    });

    // In-app notification for system users
    if (recipientUserId) {
      await db.execute({
        sql: `INSERT INTO notifications
                (user_id, type, record_id, record_name, message, changed_by_email, entity_type, entity_id, is_read)
              VALUES (?, 'conference', ?, ?, ?, ?, 'conference', ?, 0)`,
        args: [
          recipientUserId,
          conferenceId,
          conferenceName,
          `${requesterName} has requested your input on ${conferenceName}`,
          authResult.email,
          conferenceId,
        ],
      }).catch(() => {}); // best-effort
    }

    // Build one-click decision links
    const decisions = ['confirmed', 'attend_but_reduce', 'watching', 'passed', 'pending_approval'];
    const decisionLabels = ['attend', 'attend-reduced', 'fence', 'pass', 'evaluating'];
    const tokenLinks = {
      attend:        `${BASE_URL}/input/respond?token=${token}&decision=confirmed&aid=${authResult.accountId}`,
      attendReduced: `${BASE_URL}/input/respond?token=${token}&decision=attend_but_reduce&aid=${authResult.accountId}`,
      onTheFence:    `${BASE_URL}/input/respond?token=${token}&decision=watching&aid=${authResult.accountId}`,
      dontAttend:    `${BASE_URL}/input/respond?token=${token}&decision=passed&aid=${authResult.accountId}`,
      evaluating:    `${BASE_URL}/input/respond?token=${token}&decision=pending_approval&aid=${authResult.accountId}`,
    };
    void decisions; void decisionLabels; // suppress unused warning

    // Send email (best-effort)
    await sendInputRequestEmail({
      to: email,
      recipientName: name,
      conferenceName,
      conferenceYear,
      requesterName,
      calScore,
      calTier,
      tokenLinks,
      parlayLink,
      expiresAt: expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    }).catch(() => {});

    requestsSent++;
  }

  return NextResponse.json({ success: true, requestsSent });
}

// ── GET /api/calendar-intelligence/request-input?conferenceId= ────────────────
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const conferenceId = Number(request.nextUrl.searchParams.get('conferenceId'));
  if (!conferenceId) return NextResponse.json({ error: 'conferenceId required' }, { status: 400 });

  const res = await db.execute({
    sql: `SELECT id, recipient_email, recipient_name, recipient_title, recipient_user_id, status, created_at
          FROM input_requests
          WHERE conference_id = ?
          ORDER BY created_at DESC`,
    args: [conferenceId],
  });

  const requests = (res.rows as Row[]).map(r => ({
    id: Number(r.id),
    recipientEmail: String(r.recipient_email),
    recipientName: String(r.recipient_name),
    recipientTitle: r.recipient_title ? String(r.recipient_title) : null,
    recipientUserId: r.recipient_user_id != null ? Number(r.recipient_user_id) : null,
    status: String(r.status) as 'pending' | 'responded' | 'expired',
    createdAt: String(r.created_at ?? ''),
  }));

  return NextResponse.json({ requests });
}
