import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, dbReady } from '@/lib/db';
import { getSessionUser, validatePassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Both current and new passwords are required.' }, { status: 400 });
    }

    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    await dbReady;

    const result = await db.execute({
      sql: 'SELECT password_hash FROM users WHERE id = ?',
      args: [user.id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const valid = await bcrypt.compare(currentPassword, String(result.rows[0].password_hash));
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.execute({
      sql: 'UPDATE users SET password_hash = ? WHERE id = ?',
      args: [newHash, user.id],
    });

    return NextResponse.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    return NextResponse.json({ error: 'Failed to change password.' }, { status: 500 });
  }
}
