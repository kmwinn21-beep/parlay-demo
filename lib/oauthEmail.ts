import { db, dbReady } from './db';

export type OAuthProvider = 'google' | 'microsoft';

export interface OAuthConnection {
  id: number;
  user_id: number;
  provider: OAuthProvider;
  provider_email: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: number | null;
}

// ── Token management ──────────────────────────────────────────────────────────

async function refreshGoogle(conn: OAuthConnection): Promise<string> {
  if (!conn.refresh_token) throw new Error('No refresh token available. Reconnect your Google account.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Failed to refresh Google token. Reconnect your Google account.');
  const data = await res.json();
  const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  await db.execute({
    sql: 'UPDATE oauth_connections SET access_token = ?, token_expires_at = ? WHERE id = ?',
    args: [data.access_token, expiresAt, conn.id],
  });
  return data.access_token as string;
}

async function refreshMicrosoft(conn: OAuthConnection): Promise<string> {
  if (!conn.refresh_token) throw new Error('No refresh token available. Reconnect your Microsoft account.');
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common';
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/mail.send offline_access',
    }),
  });
  if (!res.ok) throw new Error('Failed to refresh Microsoft token. Reconnect your Microsoft account.');
  const data = await res.json();
  const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  await db.execute({
    sql: 'UPDATE oauth_connections SET access_token = ?, refresh_token = COALESCE(?, refresh_token), token_expires_at = ? WHERE id = ?',
    args: [data.access_token, data.refresh_token ?? null, expiresAt, conn.id],
  });
  return data.access_token as string;
}

export async function getValidToken(userId: number, provider: OAuthProvider): Promise<string> {
  await dbReady;
  const row = await db.execute({
    sql: 'SELECT * FROM oauth_connections WHERE user_id = ? AND provider = ?',
    args: [userId, provider],
  });
  if (row.rows.length === 0) throw new Error(`No ${provider} account connected.`);
  const conn = row.rows[0] as unknown as OAuthConnection;

  // Refresh proactively if expiry is within 60 s
  const expiresAt = conn.token_expires_at ? Number(conn.token_expires_at) : null;
  if (!expiresAt || expiresAt < Date.now() + 60_000) {
    return provider === 'google' ? refreshGoogle(conn) : refreshMicrosoft(conn);
  }
  return conn.access_token;
}

// ── Send helpers ──────────────────────────────────────────────────────────────

interface Attachment {
  filename: string;
  contentType: string;
  data: Buffer;
}

function buildMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  attachments: Attachment[];
}): string {
  const boundary = `boundary_${Date.now().toString(36)}`;
  const lines: string[] = [];
  lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to}`);
  lines.push(`Subject: ${opts.subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push('');
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: quoted-printable');
  lines.push('');
  lines.push(opts.htmlBody);

  for (const att of opts.attachments) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.contentType}; name="${att.filename}"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    lines.push('');
    lines.push(att.data.toString('base64'));
  }

  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

export async function sendViaGoogle(opts: {
  accessToken: string;
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  attachments: Attachment[];
}): Promise<void> {
  const raw = buildMimeMessage({ from: opts.from, to: opts.to, subject: opts.subject, htmlBody: opts.htmlBody, attachments: opts.attachments });
  const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Gmail send failed');
  }
}

export async function sendViaMicrosoft(opts: {
  accessToken: string;
  to: string;
  subject: string;
  htmlBody: string;
  attachments: Attachment[];
}): Promise<void> {
  const body = {
    message: {
      subject: opts.subject,
      body: { contentType: 'HTML', content: opts.htmlBody },
      toRecipients: [{ emailAddress: { address: opts.to } }],
      attachments: opts.attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType,
        contentBytes: att.data.toString('base64'),
      })),
    },
    saveToSentItems: true,
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 202) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: { message?: string } }).error?.message ?? 'Microsoft Graph send failed';
    throw new Error(msg);
  }
}
