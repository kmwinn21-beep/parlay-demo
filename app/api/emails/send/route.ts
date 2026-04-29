import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getValidToken, sendViaGoogle, sendViaMicrosoft, type OAuthProvider } from '@/lib/oauthEmail';
import { db, dbReady } from '@/lib/db';

export async function POST(request: NextRequest) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  const formData = await request.formData();
  const provider = formData.get('provider') as OAuthProvider | null;
  const to = formData.get('to') as string | null;
  const subject = formData.get('subject') as string | null;
  const body = formData.get('body') as string | null;

  if (!provider || !to || !subject || !body) {
    return NextResponse.json({ error: 'provider, to, subject, and body are required.' }, { status: 400 });
  }
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 });
  }

  // Collect attachments
  const attachments: { filename: string; contentType: string; data: Buffer }[] = [];
  const files = formData.getAll('attachments');
  for (const file of files) {
    if (file instanceof File && file.size > 0) {
      const buf = Buffer.from(await file.arrayBuffer());
      attachments.push({ filename: file.name, contentType: file.type || 'application/octet-stream', data: buf });
    }
  }

  try {
    const accessToken = await getValidToken(user.id, provider);

    if (provider === 'google') {
      // Get provider email for From header
      await dbReady;
      const row = await db.execute({
        sql: 'SELECT provider_email FROM oauth_connections WHERE user_id = ? AND provider = ?',
        args: [user.id, 'google'],
      });
      const fromEmail = row.rows[0]?.provider_email ? String(row.rows[0].provider_email) : user.email;

      await sendViaGoogle({ accessToken, from: fromEmail, to, subject, htmlBody: body, attachments });
    } else {
      await sendViaMicrosoft({ accessToken, to, subject, htmlBody: body, attachments });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
