import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id } = await params;
  const meetingId = Number(id);

  try {
    const meetingRes = await db.execute({
      sql: 'SELECT outcome, attendee_id, conference_id FROM meetings WHERE id = ?',
      args: [meetingId],
    });
    if (!meetingRes.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const mtg = meetingRes.rows[0];
    const currentOutcome = mtg.outcome ? String(mtg.outcome) : null;

    // Find the display value for meeting_held action_key
    const heldRes = await db.execute({
      sql: "SELECT value FROM config_options WHERE action_key = 'meeting_held' AND category = 'action' LIMIT 1",
      args: [],
    });
    if (!heldRes.rows.length) return NextResponse.json({ skipped: true, reason: 'no_config' });
    const heldValue = String(heldRes.rows[0].value);

    if (currentOutcome === heldValue) return NextResponse.json({ skipped: true, reason: 'already_held' });

    // Update meeting outcome
    await db.execute({ sql: 'UPDATE meetings SET outcome = ? WHERE id = ?', args: [heldValue, meetingId] });

    // Sync conference_attendee_details.action
    const { attendee_id, conference_id } = mtg;
    const cadRes = await db.execute({
      sql: 'SELECT action FROM conference_attendee_details WHERE attendee_id = ? AND conference_id = ?',
      args: [attendee_id as number, conference_id as number],
    });
    if (cadRes.rows.length > 0) {
      const actions = new Set(String(cadRes.rows[0].action ?? '').split(',').map(a => a.trim()).filter(Boolean));
      actions.add(heldValue);
      await db.execute({
        sql: 'UPDATE conference_attendee_details SET action = ? WHERE attendee_id = ? AND conference_id = ?',
        args: [Array.from(actions).join(','), attendee_id as number, conference_id as number],
      });
    } else {
      await db.execute({
        sql: 'INSERT OR REPLACE INTO conference_attendee_details (attendee_id, conference_id, action) VALUES (?, ?, ?)',
        args: [attendee_id as number, conference_id as number, heldValue],
      });
    }

    // Auto-create Post-Mtg follow-up if transitioning from Scheduled
    if (currentOutcome) {
      const oldKeyRes = await db.execute({
        sql: "SELECT action_key FROM config_options WHERE category = 'action' AND value = ?",
        args: [currentOutcome],
      });
      const oldKey = oldKeyRes.rows.length > 0 && oldKeyRes.rows[0].action_key ? String(oldKeyRes.rows[0].action_key) : null;
      if (oldKey === 'meeting_scheduled') {
        const postMtgRes = await db.execute({
          sql: "SELECT value FROM config_options WHERE category = 'next_steps' AND action_key = 'post_mtg' LIMIT 1",
          args: [],
        });
        if (postMtgRes.rows.length > 0) {
          await db.execute({
            sql: 'INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, completed) VALUES (?, ?, ?, ?, 0)',
            args: [attendee_id as number, conference_id as number, String(postMtgRes.rows[0].value), `Auto-created from ${heldValue} Meeting`],
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('set-held error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
