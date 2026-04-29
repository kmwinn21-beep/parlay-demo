import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { sendInviteEmail } from '@/lib/email';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });

  await dbReady;
  const body = await request.json() as {
    role?: 'user' | 'administrator';
    active?: boolean;
    resendInvite?: boolean;
  };

  if (body.resendInvite) {
    const user = await db.execute({
      sql: 'SELECT email, first_name, email_verified FROM users WHERE id = ?',
      args: [userId],
    });
    if (user.rows.length === 0) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    const u = user.rows[0];
    if (Number(u.email_verified) === 1) {
      return NextResponse.json({ error: 'User has already accepted their invitation.' }, { status: 400 });
    }
    const newToken = crypto.randomUUID();
    const newExpires = Date.now() + 72 * 60 * 60 * 1000;
    await db.execute({
      sql: 'UPDATE users SET invite_token = ?, invite_expires = ? WHERE id = ?',
      args: [newToken, newExpires, userId],
    });
    let devLink: string | undefined;
    try {
      const result = await sendInviteEmail(String(u.email), u.first_name ? String(u.first_name) : 'there', newToken);
      devLink = result.devLink;
    } catch (err) {
      console.error('Failed to resend invite:', err);
    }
    return NextResponse.json({ message: 'Invite resent.', ...(devLink ? { devInviteLink: devLink } : {}) });
  }

  const updates: string[] = [];
  const args: (string | number)[] = [];

  if (body.role !== undefined) {
    if (!['user', 'administrator'].includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }
    updates.push('role = ?');
    args.push(body.role);
  }

  if (body.active !== undefined) {
    updates.push('active = ?');
    args.push(body.active ? 1 : 0);
  }

  if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  args.push(userId);
  await db.execute({ sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`, args });

  return NextResponse.json({ message: 'User updated.' });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const adminUser = authResult;

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
  if (userId === adminUser.id) return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });

  await dbReady;
  const { reassignToUserId } = await request.json() as { reassignToUserId: number };
  if (!reassignToUserId) return NextResponse.json({ error: 'reassignToUserId is required.' }, { status: 400 });

  // Fetch deleted user's rep name (config_options value) and email
  const deletedUser = await db.execute({
    sql: 'SELECT email, display_name, config_id FROM users WHERE id = ?',
    args: [userId],
  });
  if (deletedUser.rows.length === 0) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  const du = deletedUser.rows[0];

  // Fetch reassign target's rep name and email
  const targetUser = await db.execute({
    sql: 'SELECT email, display_name, config_id FROM users WHERE id = ?',
    args: [reassignToUserId],
  });
  if (targetUser.rows.length === 0) return NextResponse.json({ error: 'Reassign target user not found.' }, { status: 404 });
  const tu = targetUser.rows[0];

  const oldRepName = du.display_name ? String(du.display_name) : String(du.email);
  const newRepName = tu.display_name ? String(tu.display_name) : String(tu.email);
  const oldEmail = String(du.email);
  const newEmail = String(tu.email);

  // Also check config_options for the old user's rep name
  let oldConfigValue: string | null = null;
  if (du.config_id) {
    const cfg = await db.execute({ sql: 'SELECT value FROM config_options WHERE id = ?', args: [Number(du.config_id)] });
    if (cfg.rows.length > 0) oldConfigValue = String(cfg.rows[0].value);
  }
  let newConfigValue: string | null = null;
  if (tu.config_id) {
    const cfg = await db.execute({ sql: 'SELECT value FROM config_options WHERE id = ?', args: [Number(tu.config_id)] });
    if (cfg.rows.length > 0) newConfigValue = String(cfg.rows[0].value);
  }

  // Reassign incomplete follow-ups
  if (oldConfigValue && newConfigValue) {
    await db.execute({
      sql: `UPDATE follow_ups SET assigned_rep = ? WHERE assigned_rep = ? AND completed = 0`,
      args: [newConfigValue, oldConfigValue],
    });
  }
  // Also try by email/display_name fallback
  await db.execute({
    sql: `UPDATE follow_ups SET assigned_rep = ? WHERE assigned_rep = ? AND completed = 0`,
    args: [newRepName, oldRepName],
  });

  // Reassign companies
  await db.execute({
    sql: `UPDATE companies SET assigned_user = ? WHERE assigned_user = ?`,
    args: [newEmail, oldEmail],
  });
  if (oldConfigValue && newConfigValue) {
    await db.execute({
      sql: `UPDATE companies SET assigned_user = ? WHERE assigned_user = ?`,
      args: [newConfigValue, oldConfigValue],
    });
  }

  // Remove from config_options (user type entry)
  if (du.config_id) {
    await db.execute({ sql: 'DELETE FROM config_options WHERE id = ?', args: [Number(du.config_id)] });
  }

  // Delete the user
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });

  return NextResponse.json({ message: 'User deleted and records reassigned.' });
}
