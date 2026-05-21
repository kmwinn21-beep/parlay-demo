import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const body = await request.json();
    const {
      quick_note_id,
      attendee_id,
      conference_id,
      company_id,
      interaction_type, // 'booth-stop' | 'booth-demo' | 'booth-meeting' | 'booth-followup'
      notes_text,
      meeting_date,
      meeting_time,
      follow_up_type, // next_steps value string (for booth-followup)
    } = body as {
      quick_note_id: number;
      attendee_id?: number | null;
      conference_id?: number | null;
      company_id?: number | null;
      interaction_type: string;
      notes_text?: string | null;
      meeting_date?: string | null;
      meeting_time?: string | null;
      follow_up_type?: string | null;
    };

    if (!interaction_type) {
      return NextResponse.json({ error: 'interaction_type is required' }, { status: 400 });
    }

    const results: Record<string, unknown> = {};

    // All interaction types: record a touchpoint if attendee + conference provided
    if (attendee_id && conference_id) {
      // Map interaction_type to touchpoint value
      const touchpointMap: Record<string, string> = {
        'booth-stop': 'Booth Stop',
        'booth-demo': 'Booth Stop',
        'booth-meeting': 'Booth Stop',
        'booth-followup': 'Booth Stop',
      };
      const touchpointValue = touchpointMap[interaction_type] ?? 'Booth Stop';

      // Look up the touchpoint config option to check auto_follow_up
      const tpOption = await db.execute({
        sql: "SELECT id, auto_follow_up FROM config_options WHERE category = 'touchpoints' AND value = ? LIMIT 1",
        args: [touchpointValue],
      });

      if (tpOption.rows.length > 0) {
        const tpId = Number(tpOption.rows[0].id);
        await db.execute({
          sql: `INSERT INTO attendee_touchpoints (attendee_id, conference_id, touchpoint_id, notes, created_by)
                VALUES (?, ?, ?, ?, ?)`,
          args: [attendee_id, conference_id, tpId, notes_text ?? null, authResult.email],
        });
        results.touchpoint = 'created';
      }
    }

    // For booth-demo: create a meeting with type "Booth Demo"
    if (interaction_type === 'booth-demo' && attendee_id && conference_id) {
      const dateStr = meeting_date ?? new Date().toISOString().slice(0, 10);
      const timeStr = meeting_time ?? '12:00';

      // Look up "Meeting Scheduled" action name
      const scheduledRes = await db.execute({
        sql: "SELECT value FROM config_options WHERE category = 'action' AND action_key = 'meeting_scheduled' LIMIT 1",
        args: [],
      });
      const scheduledName = scheduledRes.rows.length > 0 ? String(scheduledRes.rows[0].value) : 'Scheduled';

      const mtgRes = await db.execute({
        sql: `INSERT INTO meetings (attendee_id, conference_id, meeting_date, meeting_time, location, outcome, meeting_type)
              VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [attendee_id, conference_id, dateStr, timeStr, 'Booth', scheduledName, 'Booth Demo'],
      });
      results.meeting_id = mtgRes.rows[0]?.id ?? null;

      // Update conference_attendee_details
      const existing = await db.execute({
        sql: 'SELECT action FROM conference_attendee_details WHERE attendee_id = ? AND conference_id = ?',
        args: [attendee_id, conference_id],
      });
      if (existing.rows.length > 0) {
        const actions = new Set(String(existing.rows[0].action ?? '').split(',').map((a: string) => a.trim()).filter(Boolean));
        actions.add(scheduledName);
        await db.execute({
          sql: 'UPDATE conference_attendee_details SET action = ? WHERE attendee_id = ? AND conference_id = ?',
          args: [Array.from(actions).join(','), attendee_id, conference_id],
        });
      } else {
        await db.execute({
          sql: 'INSERT OR REPLACE INTO conference_attendee_details (attendee_id, conference_id, action) VALUES (?, ?, ?)',
          args: [attendee_id, conference_id, scheduledName],
        });
      }
    }

    // For booth-meeting: create a meeting with type "Booth Meeting"
    if (interaction_type === 'booth-meeting' && attendee_id && conference_id) {
      const dateStr = meeting_date ?? new Date().toISOString().slice(0, 10);
      const timeStr = meeting_time ?? '12:00';

      const scheduledRes = await db.execute({
        sql: "SELECT value FROM config_options WHERE category = 'action' AND action_key = 'meeting_scheduled' LIMIT 1",
        args: [],
      });
      const scheduledName = scheduledRes.rows.length > 0 ? String(scheduledRes.rows[0].value) : 'Scheduled';

      const mtgRes = await db.execute({
        sql: `INSERT INTO meetings (attendee_id, conference_id, meeting_date, meeting_time, location, outcome, meeting_type)
              VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [attendee_id, conference_id, dateStr, timeStr, 'Booth', scheduledName, 'Booth Meeting'],
      });
      results.meeting_id = mtgRes.rows[0]?.id ?? null;

      const existing = await db.execute({
        sql: 'SELECT action FROM conference_attendee_details WHERE attendee_id = ? AND conference_id = ?',
        args: [attendee_id, conference_id],
      });
      if (existing.rows.length > 0) {
        const actions = new Set(String(existing.rows[0].action ?? '').split(',').map((a: string) => a.trim()).filter(Boolean));
        actions.add(scheduledName);
        await db.execute({
          sql: 'UPDATE conference_attendee_details SET action = ? WHERE attendee_id = ? AND conference_id = ?',
          args: [Array.from(actions).join(','), attendee_id, conference_id],
        });
      } else {
        await db.execute({
          sql: 'INSERT OR REPLACE INTO conference_attendee_details (attendee_id, conference_id, action) VALUES (?, ?, ?)',
          args: [attendee_id, conference_id, scheduledName],
        });
      }
    }

    // For booth-followup: create a follow_up record
    if (interaction_type === 'booth-followup' && attendee_id && conference_id && follow_up_type) {
      await db.execute({
        sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, completed)
              VALUES (?, ?, ?, ?, 0)`,
        args: [attendee_id, conference_id, follow_up_type, notes_text ?? `Booth follow-up`],
      });
      results.follow_up = 'created';
    }

    // Write entity_note if notes_text provided and we have at least attendee or company
    if (notes_text?.trim() && (attendee_id || company_id || conference_id)) {
      const noteContent = notes_text.trim();
      const inserts: Promise<unknown>[] = [];
      if (attendee_id) inserts.push(db.execute({
        sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_id, created_by)
              VALUES ('attendee', ?, ?, ?, ?)`,
        args: [attendee_id, noteContent, conference_id ?? null, authResult.email],
      }));
      if (company_id && !attendee_id) inserts.push(db.execute({
        sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_id, created_by)
              VALUES ('company', ?, ?, ?, ?)`,
        args: [company_id, noteContent, conference_id ?? null, authResult.email],
      }));
      await Promise.all(inserts).catch(() => {});
      results.note = 'created';
    }

    // Delete the quick_note (it's been processed)
    if (quick_note_id) {
      await db.execute({ sql: 'DELETE FROM quick_notes WHERE id = ?', args: [quick_note_id] });
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('POST /api/booth-scan/submit error:', error);
    return NextResponse.json({ error: 'Failed to submit booth scan' }, { status: 500 });
  }
}
