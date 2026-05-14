import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findDbByToken } from '@/lib/getDb';
import { signToken, authCookieOptions, validatePassword } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 });

  const found = await findDbByToken('invite_token', token, 'id, email, first_name, invite_expires');
  if (!found) {
    return NextResponse.json({ error: 'Invalid or already used invitation link.' }, { status: 404 });
  }

  const user = found.row;
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

  const found = await findDbByToken(
    'invite_token',
    token,
    'id, email, role, first_name, last_name, config_id, invite_expires'
  );

  if (!found) {
    return NextResponse.json({ error: 'Invalid or already used invitation link.' }, { status: 404 });
  }

  const { client: userDb, row: user } = found;
  const expires = Number(user.invite_expires);
  if (expires && Date.now() > expires) {
    return NextResponse.json({ error: 'This invitation has expired. Ask an administrator to resend it.' }, { status: 410 });
  }

  const password_hash = await bcrypt.hash(password, 12);

  await userDb.execute({
    sql: `UPDATE users
          SET password_hash = ?, email_verified = 1, invite_token = NULL, invite_expires = NULL, active = 1
          WHERE id = ?`,
    args: [password_hash, Number(user.id)],
  });

  // Ensure the user is linked to their rep profile in config_options.
  // Normally set during invite creation, but may be null for users created before
  // that workflow existed — look up by display name and link automatically.
  if (user.config_id == null) {
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    if (displayName) {
      const coRes = await userDb.execute({
        sql: `SELECT id FROM config_options WHERE category = 'user' AND LOWER(value) = LOWER(?) LIMIT 1`,
        args: [displayName],
      });
      if (coRes.rows.length) {
        await userDb.execute({
          sql: 'UPDATE users SET config_id = ? WHERE id = ?',
          args: [Number(coRes.rows[0].id), Number(user.id)],
        });
      }
    }
  }

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
  const userRole = String(user.role) as import('@/lib/auth').UserRole;
  const sessionUser = {
    id: Number(user.id),
    email: String(user.email),
    role: userRole,
    emailVerified: true,
    accountId: found.accountId,
  };

  const sessionToken = await signToken(sessionUser);
  const redirectTo = userRole === 'stakeholder' ? '/calendar-intelligence?tab=decisions' : '/';
  const response = NextResponse.json({
    message: 'Password set. Welcome!',
    user: { email: sessionUser.email, role: sessionUser.role, displayName },
    redirectTo,
  });
  response.cookies.set({ ...authCookieOptions(), value: sessionToken });
  return response;
}
