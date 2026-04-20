import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, dbReady } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { sendEmailChangeVerification, sendEmailChangeNotification } from '@/lib/email';

const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { newEmail: rawNew, currentPassword } = await request.json();
    if (!rawNew || !currentPassword) {
      return NextResponse.json({ error: 'New email and current password are required.' }, { status: 400 });
    }

    const newEmail = String(rawNew).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    if (newEmail === user.email) {
      return NextResponse.json({ error: 'New email must differ from current email.' }, { status: 400 });
    }

    await dbReady;

    const userRow = await db.execute({
      sql: 'SELECT password_hash FROM users WHERE id = ?',
      args: [user.id],
    });
    if (userRow.rows.length === 0) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const valid = await bcrypt.compare(currentPassword, String(userRow.rows[0].password_hash));
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [newEmail],
    });
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'That email address is already in use.' }, { status: 409 });
    }

    const token = crypto.randomUUID();
    const expires = Date.now() + EXPIRY_MS;

    await db.execute({
      sql: 'UPDATE users SET email_pending = ?, email_change_token = ?, email_change_expires = ? WHERE id = ?',
      args: [newEmail, token, expires, user.id],
    });

    let devLink: string | undefined;
    try {
      const result = await sendEmailChangeVerification(newEmail, token);
      devLink = result.devLink;
    } catch (err) {
      console.error('Failed to send email change verification:', err);
    }

    await sendEmailChangeNotification(user.email, newEmail);

    return NextResponse.json({
      message: 'Confirmation email sent to your new address. Check your inbox.',
      ...(devLink ? { devVerifyLink: devLink } : {}),
    });
  } catch (err) {
    console.error('Change email error:', err);
    return NextResponse.json({ error: 'Failed to initiate email change.' }, { status: 500 });
  }
}
