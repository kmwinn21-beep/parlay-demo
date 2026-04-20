import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { displayName, configId } = await request.json();

    await dbReady;

    const updates: string[] = [];
    const args: (string | number | null)[] = [];

    if (displayName !== undefined) {
      updates.push('display_name = ?');
      args.push(typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null);
    }
    if (configId !== undefined) {
      updates.push('config_id = ?');
      args.push(configId != null ? Number(configId) : null);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
    }

    args.push(user.id);
    await db.execute({
      sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      args,
    });

    return NextResponse.json({ message: 'Profile updated.' });
  } catch (err) {
    console.error('Update profile error:', err);
    return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
  }
}
