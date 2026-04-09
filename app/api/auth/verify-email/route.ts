import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Verification token is required.' }, { status: 400 });
    }

    await dbReady;

    const result = await db.execute({
      sql: 'SELECT id, email, role FROM users WHERE verification_token = ?',
      args: [token],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or already-used verification link.' }, { status: 400 });
    }

    const user = result.rows[0];

    await db.execute({
      sql: 'UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?',
      args: [Number(user.id)],
    });

    // Issue a fresh token with emailVerified = true
    const newToken = await signToken({
      id: Number(user.id),
      email: String(user.email),
      role: String(user.role) as 'user' | 'administrator',
      emailVerified: true,
    });

    const response = NextResponse.json({ message: 'Email verified. Welcome!' });
    response.cookies.set({ ...authCookieOptions(), value: newToken });
    return response;
  } catch (err) {
    console.error('Verify email error:', err);
    return NextResponse.json({ error: 'Verification failed.' }, { status: 500 });
  }
}
