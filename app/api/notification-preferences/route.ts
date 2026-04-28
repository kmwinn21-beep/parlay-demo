import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const OPT_OUT_KEYS = [
  'company_status_change', 'follow_up_assigned', 'note_tagged',
  'company_status_change_email', 'follow_up_assigned_email', 'note_tagged_email',
] as const;

// New engagement prefs default to 0 (opted out); existing rows missing the columns also read as false
const OPT_IN_KEYS = [
  'note_comment_received', 'note_comment_received_email',
  'note_comment_thread', 'note_comment_thread_email',
  'note_reaction_received', 'note_reaction_received_email',
  'note_lets_talk', 'note_lets_talk_email',
  'comment_reaction_received', 'comment_reaction_received_email',
] as const;

const ALL_KEYS = [...OPT_OUT_KEYS, ...OPT_IN_KEYS] as const;
type PrefKey = typeof ALL_KEYS[number];

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbReady;

    const result = await db.execute({
      sql: `SELECT ${ALL_KEYS.join(', ')} FROM notification_preferences WHERE user_id = ?`,
      args: [user.id],
    });

    if (result.rows.length === 0) {
      // No row yet — return defaults
      const defaults: Record<string, boolean> = {};
      for (const k of OPT_OUT_KEYS) defaults[k] = true;
      for (const k of OPT_IN_KEYS) defaults[k] = false;
      return NextResponse.json(defaults);
    }

    const row = result.rows[0];
    const out: Record<string, boolean> = {};
    for (const k of OPT_OUT_KEYS) out[k] = row[k] == null ? true : Boolean(row[k]);
    for (const k of OPT_IN_KEYS) out[k] = row[k] == null ? false : Boolean(row[k]);
    return NextResponse.json(out);
  } catch (err) {
    console.error('GET notification-preferences error:', err);
    return NextResponse.json({ error: 'Failed to load preferences.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as Record<string, unknown>;
    const updates: string[] = [];
    const args: (number | string)[] = [];

    for (const key of ALL_KEYS) {
      if (key in body) {
        updates.push(`${key} = ?`);
        args.push(body[key] ? 1 : 0);
      }
    }

    if (updates.length === 0) return NextResponse.json({ error: 'No valid fields provided.' }, { status: 400 });

    await dbReady;

    await db.execute({
      sql: `INSERT INTO notification_preferences (user_id, company_status_change, follow_up_assigned, note_tagged,
               company_status_change_email, follow_up_assigned_email, note_tagged_email)
            VALUES (?, 1, 1, 1, 1, 1, 1)
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
    console.error('PATCH notification-preferences error:', err);
    return NextResponse.json({ error: 'Failed to update preferences.' }, { status: 500 });
  }
}
