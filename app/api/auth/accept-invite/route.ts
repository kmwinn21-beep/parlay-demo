import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions, validatePassword } from '@/lib/auth';
import { createNotifications } from '@/lib/notifications';

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
    sql: 'SELECT id, email, role, first_name, last_name, config_id, invite_expires FROM users WHERE invite_token = ?',
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

  // Notify administrators that an invited user has activated their account.
  try {
    const adminRows = await db.execute({
      sql: 'SELECT id FROM users WHERE role = ? AND active = 1',
      args: ['administrator'],
    });
    const adminUserIds = adminRows.rows.map(row => Number(row.id)).filter(id => !Number.isNaN(id));
    const activatedName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || String(user.email);
    await createNotifications({
      userIds: adminUserIds,
      type: 'conference',
      recordId: Number(user.id),
      recordName: 'User Activation',
      message: `${activatedName} has activated their invited account.`,
      changedByEmail: String(user.email),
      changedByConfigId: user.config_id == null ? null : Number(user.config_id),
      entityType: 'system',
      entityId: 0,
    });
  } catch (error) {
    console.error('Failed to notify administrators of invite activation:', error);
  }

  // Ensure the user is linked to their rep profile in config_options.
  // Normally set during invite creation, but may be null for users created before
  // that workflow existed — look up by display name and link automatically.
  if (user.config_id == null) {
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    if (displayName) {
      const coRes = await db.execute({
        sql: `SELECT id FROM config_options WHERE category = 'user' AND LOWER(value) = LOWER(?) LIMIT 1`,
        args: [displayName],
      });
      if (coRes.rows.length) {
        await db.execute({
          sql: 'UPDATE users SET config_id = ? WHERE id = ?',
          args: [Number(coRes.rows[0].id), Number(user.id)],
        });
      }
    }
  }

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
