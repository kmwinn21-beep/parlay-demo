import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findDbByToken } from '@/lib/getDb';
import { validatePassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Reset token is required.' }, { status: 400 });
    }

    const passwordCheck = validatePassword(password ?? '');
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    const found = await findDbByToken('reset_token', token, 'id, reset_token_expires');
    if (!found) {
      return NextResponse.json({ error: 'Invalid or expired reset link.' }, { status: 400 });
    }

    const { client: userDb, row: user } = found;
    const expires = Number(user.reset_token_expires);
    if (!expires || Date.now() > expires) {
      return NextResponse.json({ error: 'This reset link has expired. Please request a new one.' }, { status: 400 });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await userDb.execute({
      sql: 'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      args: [password_hash, Number(user.id)],
    });

    return NextResponse.json({ message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return NextResponse.json({ error: 'Failed to reset password.' }, { status: 500 });
  }
}
