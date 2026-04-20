import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: 'Email is already verified.' }, { status: 400 });
    }

    await dbReady;

    const newToken = crypto.randomUUID();
    await db.execute({
      sql: 'UPDATE users SET verification_token = ? WHERE id = ?',
      args: [newToken, user.id],
    });

    let devLink: string | undefined;
    try {
      const result = await sendVerificationEmail(user.email, newToken);
      devLink = result.devLink;
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

    return NextResponse.json({
      message: 'Verification email sent.',
      ...(devLink ? { devVerifyLink: devLink } : {}),
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    return NextResponse.json({ error: 'Failed to resend verification email.' }, { status: 500 });
  }
}
