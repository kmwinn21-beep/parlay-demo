import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

  if (error || !code || !state) {
    return NextResponse.redirect(`${base}/auth/account?error=microsoft_denied`);
  }

  const userId = parseInt(state, 10);
  if (isNaN(userId)) return NextResponse.redirect(`${base}/auth/account?error=invalid_state`);

  const clientId = process.env.MICROSOFT_CLIENT_ID!;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!;
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common';
  const redirectUri = `${base}/api/oauth/microsoft/callback`;

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'https://graph.microsoft.com/mail.send https://graph.microsoft.com/user.read offline_access',
    }),
  });

  if (!tokenRes.ok) return NextResponse.redirect(`${base}/auth/account?error=microsoft_token_failed`);
  const tokens = await tokenRes.json();

  let providerEmail: string | null = null;
  try {
    const infoRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (infoRes.ok) {
      const info = await infoRes.json();
      providerEmail = info.mail ?? info.userPrincipalName ?? null;
    }
  } catch { /* non-critical */ }

  const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;

  await dbReady;
  await db.execute({
    sql: `INSERT INTO oauth_connections (user_id, provider, provider_email, access_token, refresh_token, token_expires_at)
          VALUES (?, 'microsoft', ?, ?, ?, ?)
          ON CONFLICT (user_id, provider) DO UPDATE SET
            provider_email = excluded.provider_email,
            access_token = excluded.access_token,
            refresh_token = COALESCE(excluded.refresh_token, refresh_token),
            token_expires_at = excluded.token_expires_at`,
    args: [userId, providerEmail, tokens.access_token, tokens.refresh_token ?? null, expiresAt],
  });

  return NextResponse.redirect(`${base}/auth/account?connected=microsoft`);
}
