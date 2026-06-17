import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { buildInputRequestEmailHtml, sendInputRequestEmail } from '@/lib/email';
import { getValidToken, sendViaGoogle, sendViaMicrosoft, type OAuthProvider } from '@/lib/oauthEmail';

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
    expiryDays?: number;
  };
  const { conferenceId, recipients, expiryDays = 7 } = body;

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
  const clampedDays = Math.max(1, Math.min(90, Number(expiryDays) || 7));
  const expiresAt = new Date(Date.now() + clampedDays * 24 * 60 * 60 * 1000);

  // Check if requester has a connected OAuth account for sending from their own email
  const oauthRow = await db.execute({
    sql: 'SELECT provider, provider_email FROM oauth_connections WHERE user_id = ? LIMIT 1',
    args: [authResult.id],
  }).catch(() => ({ rows: [] }));
  const oauthConn = oauthRow.rows[0] as unknown as { provider: string; provider_email: string | null } | undefined;

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
        authResult.accountId ?? 'master',
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

    // Encode account — undefined means master DB; use sentinel 'master' so it round-trips cleanly
    const aidParam = authResult.accountId ?? 'master';

    // Build one-click decision links
    const tokenLinks = {
      attend:        `${BASE_URL}/input/respond?token=${token}&decision=confirmed&aid=${aidParam}`,
      attendReduced: `${BASE_URL}/input/respond?token=${token}&decision=attend_but_reduce&aid=${aidParam}`,
      onTheFence:    `${BASE_URL}/input/respond?token=${token}&decision=watching&aid=${aidParam}`,
      dontAttend:    `${BASE_URL}/input/respond?token=${token}&decision=passed&aid=${aidParam}`,
      evaluating:    `${BASE_URL}/input/respond?token=${token}&decision=pending_approval&aid=${aidParam}`,
    };

    // Send email — use requester's OAuth connection if available, otherwise fall back to SMTP
    const emailOpts = {
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
      expiryDays: clampedDays,
    };
    if (oauthConn) {
      await (async () => {
        const accessToken = await getValidToken(db, authResult.id, oauthConn.provider as OAuthProvider);
        const html = buildInputRequestEmailHtml(emailOpts);
        const subject = `${requesterName} wants your input on ${conferenceName}`;
        const fromEmail = oauthConn.provider_email ?? authResult.email;
        if (oauthConn.provider === 'google') {
          await sendViaGoogle({ accessToken, from: fromEmail, to: email, subject, htmlBody: html, attachments: [] });
        } else {
          await sendViaMicrosoft({ accessToken, to: email, subject, htmlBody: html, attachments: [] });
        }
      })().catch(() => sendInputRequestEmail(emailOpts).catch(() => {}));
    } else {
      await sendInputRequestEmail(emailOpts).catch(() => {});
    }

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

  const [res, remRes] = await Promise.all([
    db.execute({
      sql: `SELECT ir.id, ir.recipient_email, ir.recipient_name, ir.recipient_title,
                   ir.recipient_user_id, ir.status, ir.created_at,
                   (SELECT irt.expires_at FROM input_request_tokens irt
                    WHERE irt.conference_id = ir.conference_id
                      AND irt.recipient_email = ir.recipient_email
                    ORDER BY irt.created_at DESC LIMIT 1) AS expires_at
            FROM input_requests ir
            WHERE ir.conference_id = ?
            ORDER BY ir.created_at DESC`,
      args: [conferenceId],
    }),
    db.execute({
      sql: `SELECT recipient_email, sent_at FROM input_request_reminders WHERE conference_id = ? ORDER BY sent_at ASC`,
      args: [conferenceId],
    }).catch(() => ({ rows: [] })),
  ]);

  const remindersByEmail = new Map<string, string[]>();
  for (const row of remRes.rows as Row[]) {
    const email = String(row.recipient_email);
    if (!remindersByEmail.has(email)) remindersByEmail.set(email, []);
    remindersByEmail.get(email)!.push(String(row.sent_at));
  }

  const requests = (res.rows as Row[]).map(r => ({
    id: Number(r.id),
    recipientEmail: String(r.recipient_email),
    recipientName: String(r.recipient_name),
    recipientTitle: r.recipient_title ? String(r.recipient_title) : null,
    recipientUserId: r.recipient_user_id != null ? Number(r.recipient_user_id) : null,
    status: String(r.status) as 'pending' | 'responded' | 'expired',
    createdAt: String(r.created_at ?? ''),
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    reminders: remindersByEmail.get(String(r.recipient_email)) ?? [],
  }));

  return NextResponse.json({ requests });
}
