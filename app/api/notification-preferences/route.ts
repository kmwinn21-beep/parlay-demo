import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbReady;

    const result = await db.execute({
      sql: 'SELECT company_status_change, follow_up_assigned, note_tagged FROM notification_preferences WHERE user_id = ?',
      args: [user.id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({
        company_status_change: true,
        follow_up_assigned: true,
        note_tagged: true,
      });
    }

    const row = result.rows[0];
    return NextResponse.json({
      company_status_change: Boolean(row.company_status_change),
      follow_up_assigned: Boolean(row.follow_up_assigned),
      note_tagged: Boolean(row.note_tagged),
    });
  } catch (err) {
    console.error('Get notification preferences error:', err);
    return NextResponse.json({ error: 'Failed to load preferences.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const allowed = ['company_status_change', 'follow_up_assigned', 'note_tagged'] as const;

    const updates: string[] = [];
    const args: (number | string)[] = [];

    for (const key of allowed) {
      if (key in body) {
        updates.push(`${key} = ?`);
        args.push(body[key] ? 1 : 0);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields provided.' }, { status: 400 });
    }

    await dbReady;

    await db.execute({
      sql: `INSERT INTO notification_preferences (user_id, company_status_change, follow_up_assigned, note_tagged)
            VALUES (?, 1, 1, 1)
            ON CONFLICT(user_id) DO NOTHING`,
      args: [user.id],
    });

    args.push(user.id);
    await db.execute({
      sql: `UPDATE notification_preferences SET ${updates.join(', ')} WHERE user_id = ?`,
      args,
    });

    return NextResponse.json({ message: 'Preferences updated.' });
  } catch (err) {
    console.error('Update notification preferences error:', err);
    return NextResponse.json({ error: 'Failed to update preferences.' }, { status: 500 });
  }
}
