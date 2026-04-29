import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { sendInviteEmail } from '@/lib/email';

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  await dbReady;
  const result = await db.execute({
    sql: `SELECT id, email, first_name, last_name, display_name, role, email_verified, active, config_id, created_at
          FROM users ORDER BY created_at ASC`,
    args: [],
  });

  return NextResponse.json(result.rows.map(r => ({
    id: Number(r.id),
    email: String(r.email),
    firstName: r.first_name ? String(r.first_name) : null,
    lastName: r.last_name ? String(r.last_name) : null,
    displayName: r.display_name ? String(r.display_name) : null,
    role: String(r.role),
    emailVerified: Boolean(r.email_verified),
    active: r.active !== 0 && r.active !== '0',
    configId: r.config_id ? Number(r.config_id) : null,
    createdAt: String(r.created_at),
  })));
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  await dbReady;
  const { firstName, lastName, email: rawEmail, role } = await request.json() as {
    firstName: string; lastName: string; email: string; role: 'user' | 'administrator';
  };

  if (!firstName?.trim() || !lastName?.trim() || !rawEmail?.trim()) {
    return NextResponse.json({ error: 'First name, last name, and email are required.' }, { status: 400 });
  }
  if (!['user', 'administrator'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }

  const email = rawEmail.trim().toLowerCase();

  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  const inviteToken = crypto.randomUUID();
  const inviteExpires = Date.now() + 72 * 60 * 60 * 1000; // 72 hours
  const displayName = `${firstName.trim()} ${lastName.trim()}`;

  // Create user with a placeholder password hash (invite flow sets the real one)
  const userResult = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, email_verified, active, first_name, last_name, display_name, invite_token, invite_expires)
          VALUES (?, '$2a$12$placeholder-no-login-until-invite-accepted', ?, 0, 1, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [email, role, firstName.trim(), lastName.trim(), displayName, inviteToken, inviteExpires],
  });

  const userId = Number(userResult.rows[0].id);

  // Add to config_options as a 'user' type so they appear in rep dropdowns
  const configResult = await db.execute({
    sql: `INSERT INTO config_options (category, value, sort_order) VALUES ('user', ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM config_options WHERE category='user'))
          RETURNING id`,
    args: [displayName],
  });
  const configId = Number(configResult.rows[0].id);

  // Link the user record to their config option
  await db.execute({
    sql: 'UPDATE users SET config_id = ? WHERE id = ?',
    args: [configId, userId],
  });

  // Send invite email (non-blocking in prod)
  let devLink: string | undefined;
  try {
    const emailResult = await sendInviteEmail(email, firstName.trim(), inviteToken);
    devLink = emailResult.devLink;
  } catch (err) {
    console.error('Failed to send invite email:', err);
  }

  return NextResponse.json({
    id: userId,
    email,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    displayName,
    role,
    emailVerified: false,
    active: true,
    configId,
    ...(devLink ? { devInviteLink: devLink } : {}),
  }, { status: 201 });
}
