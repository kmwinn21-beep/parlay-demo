import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getGoogleCredentials } from '@/lib/oauthCredentials';

export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const { clientId } = await getGoogleCredentials();
  if (!clientId) {
    return NextResponse.redirect(`${base}/auth/account?error=google_not_configured`);
  }

  const redirectUri = `${base}/api/oauth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state: String(user.id),
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
