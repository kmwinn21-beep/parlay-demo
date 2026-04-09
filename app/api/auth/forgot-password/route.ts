import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';

const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail } = await request.json();
    if (!rawEmail) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const email = String(rawEmail).trim().toLowerCase();

    // Always return success to prevent email enumeration
    const genericOk = NextResponse.json({
      message: 'If that email has an account, a reset link has been sent.',
    });

    await dbReady;

    const result = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email],
    });
    if (result.rows.length === 0) return genericOk;

    const userId = Number(result.rows[0].id);
    const resetToken = crypto.randomUUID();
    const expiresAt = Date.now() + RESET_EXPIRY_MS;

    await db.execute({
      sql: 'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      args: [resetToken, expiresAt, userId],
    });

    let devLink: string | undefined;
    try {
      const result = await sendPasswordResetEmail(email, resetToken);
      devLink = result.devLink;
    } catch (err) {
      console.error('Failed to send reset email:', err);
    }

    const response = NextResponse.json({
      message: 'If that email has an account, a reset link has been sent.',
      ...(devLink ? { devResetLink: devLink } : {}),
    });
    return response;
  } catch (err) {
    console.error('Forgot password error:', err);
    return NextResponse.json({ error: 'Request failed.' }, { status: 500 });
  }
}
