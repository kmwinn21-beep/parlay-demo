import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getMicrosoftCredentials } from '@/lib/oauthCredentials';

export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const { clientId, tenantId } = await getMicrosoftCredentials();
  if (!clientId) {
    return NextResponse.redirect(`${base}/auth/account?error=microsoft_not_configured`);
  }

  const redirectUri = `${base}/api/oauth/microsoft/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://graph.microsoft.com/mail.send https://graph.microsoft.com/user.read offline_access',
    response_mode: 'query',
    state: String(user.id),
  });

  return NextResponse.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`);
}
