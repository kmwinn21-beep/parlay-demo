import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions, validatePassword } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 });

  await dbReady;
  const result = await db.execute({
    sql: 'SELECT id, email, first_name, invite_expires FROM users WHERE invite_token = ?',
    args: [token],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Invalid or already used invitation link.' }, { status: 404 });
  }

  const user = result.rows[0];
  const expires = Number(user.invite_expires);
  if (expires && Date.now() > expires) {
    return NextResponse.json({ error: 'This invitation has expired. Ask an administrator to resend it.' }, { status: 410 });
  }

  return NextResponse.json({
    email: String(user.email),
    firstName: user.first_name ? String(user.first_name) : '',
  });
}

export async function POST(request: NextRequest) {
  const { token, password } = await request.json() as { token: string; password: string };

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required.' }, { status: 400 });
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
  }

  await dbReady;
  const result = await db.execute({
    sql: 'SELECT id, email, role, first_name, last_name, invite_expires FROM users WHERE invite_token = ?',
    args: [token],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Invalid or already used invitation link.' }, { status: 404 });
  }

  const user = result.rows[0];
  const expires = Number(user.invite_expires);
  if (expires && Date.now() > expires) {
    return NextResponse.json({ error: 'This invitation has expired. Ask an administrator to resend it.' }, { status: 410 });
  }

  const password_hash = await bcrypt.hash(password, 12);

  await db.execute({
    sql: `UPDATE users
          SET password_hash = ?, email_verified = 1, invite_token = NULL, invite_expires = NULL, active = 1
          WHERE id = ?`,
    args: [password_hash, Number(user.id)],
  });

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
  const sessionUser = {
    id: Number(user.id),
    email: String(user.email),
    role: String(user.role) as 'user' | 'administrator',
    emailVerified: true,
  };

  const sessionToken = await signToken(sessionUser);
  const response = NextResponse.json({
    message: 'Password set. Welcome!',
    user: { email: sessionUser.email, role: sessionUser.role, displayName },
  });
  response.cookies.set({ ...authCookieOptions(), value: sessionToken });
  return response;
}
