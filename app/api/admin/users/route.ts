import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, VALID_ROLES, type UserRole } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { sendInviteEmail } from '@/lib/email';
import { trackEvent } from '@/lib/trackEvent';

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

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
  const db = await getDb(authResult?.accountId);

  const { firstName, lastName, email: rawEmail, role } = await request.json() as {
    firstName: string; lastName: string; email: string; role: UserRole;
  };

  if (!firstName?.trim() || !lastName?.trim() || !rawEmail?.trim()) {
    return NextResponse.json({ error: 'First name, last name, and email are required.' }, { status: 400 });
  }
  if (!VALID_ROLES.has(role)) {
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

  // Resolve the 'user' config option they appear as in rep dropdowns. It is
  // often already there — reps are commonly set up as config options before
  // anyone invites them a login — and (category, value) is unique, so blindly
  // inserting threw and left a user with no config_id behind. Reuse the row
  // instead, which is also how the invitee inherits their existing
  // assignments. If another account already claims it, two people share a
  // display name, so this one gets a distinct value rather than their records.
  let configId: number;
  const existingConfig = await db.execute({
    sql: `SELECT id FROM config_options WHERE category = 'user' AND value = ? LIMIT 1`,
    args: [displayName],
  });

  const claimedBy = existingConfig.rows.length > 0
    ? await db.execute({
        sql: 'SELECT id FROM users WHERE config_id = ? LIMIT 1',
        args: [Number(existingConfig.rows[0].id)],
      })
    : null;

  if (existingConfig.rows.length > 0 && (claimedBy?.rows.length ?? 0) === 0) {
    configId = Number(existingConfig.rows[0].id);
  } else {
    const configValue = existingConfig.rows.length > 0
      ? `${displayName} (${email})`
      : displayName;
    const configResult = await db.execute({
      sql: `INSERT INTO config_options (category, value, sort_order) VALUES ('user', ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM config_options WHERE category='user'))
            RETURNING id`,
      args: [configValue],
    });
    configId = Number(configResult.rows[0].id);
  }

  // Create user with a placeholder password hash (invite flow sets the real one).
  // Created after the config option so a failure there can't leave a half-made
  // account behind, which is what produced "invited but errored" users.
  const userResult = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, email_verified, active, first_name, last_name, display_name, invite_token, invite_expires, config_id)
          VALUES (?, '$2a$12$placeholder-no-login-until-invite-accepted', ?, 0, 1, ?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [email, role, firstName.trim(), lastName.trim(), displayName, inviteToken, inviteExpires, configId],
  });

  const userId = Number(userResult.rows[0].id);

  // Send invite email (non-blocking in prod)
  let devLink: string | undefined;
  try {
    const emailResult = await sendInviteEmail(email, firstName.trim(), inviteToken);
    devLink = emailResult.devLink;
  } catch (err) {
    console.error('Failed to send invite email:', err);
  }

  trackEvent(authResult?.accountId, 'user_invited', authResult?.id).catch(() => {});
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
