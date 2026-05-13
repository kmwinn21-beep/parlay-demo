import { NextRequest, NextResponse } from 'next/server';
import { findDbByToken } from '@/lib/getDb';
import { signToken, authCookieOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    const found = await findDbByToken(
      'email_change_token',
      token,
      'id, role, email_pending, email_change_token, email_change_expires, email_verified'
    );

    if (!found) {
      return NextResponse.json({ error: 'Invalid or already-used link.' }, { status: 400 });
    }

    const { client: userDb, row } = found;
    const expires = Number(row.email_change_expires);
    if (Date.now() > expires) {
      return NextResponse.json({ error: 'This link has expired. Please request a new email change.' }, { status: 400 });
    }

    const newEmail = String(row.email_pending);
    const userId = Number(row.id);

    await userDb.execute({
      sql: `UPDATE users SET email = ?, email_pending = NULL, email_change_token = NULL, email_change_expires = NULL WHERE id = ?`,
      args: [newEmail, userId],
    });

    const newToken = await signToken({
      id: userId,
      email: newEmail,
      role: String(row.role) as 'user' | 'administrator',
      emailVerified: Boolean(row.email_verified),
      accountId: found.accountId,
    });

    const response = NextResponse.json({ message: 'Email address updated successfully.' });
    response.cookies.set({ ...authCookieOptions(), value: newToken });
    return response;
  } catch (err) {
    console.error('Verify email change error:', err);
    return NextResponse.json({ error: 'Verification failed.' }, { status: 500 });
  }
}
