import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${base}/auth/account?error=microsoft_not_configured`);
  }

  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common';
  const redirectUri = `${base}/api/oauth/microsoft/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://graph.microsoft.com/mail.send https://graph.microsoft.com/user.read offline_access',
    response_mode: 'query',
    state: String(user.id),
  });

  return NextResponse.redirect(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`);
}
