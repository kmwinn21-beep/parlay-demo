import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { contactFillFor } from '@/lib/scannedContact';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  const userEmail = authResult.email;

  try {
    const { attendee_id, conference_id, email, phone } = await request.json() as {
      attendee_id: number; conference_id: number;
      /** Read off the card. Fills the attendee's blanks; never replaces. */
      email?: string; phone?: string;
    };
    if (!attendee_id || !conference_id) {
      return NextResponse.json({ error: 'attendee_id and conference_id required' }, { status: 400 });
    }


    // Carry the card's contact details onto the attendee.
    //
    // A scan that captured a phone number and an email was throwing both away
    // the moment it was matched to somebody who already existed — which is the
    // common case, and the one where the details are most likely to be the
    // thing that was missing.
    //
    // Blanks only. An address somebody recorded beats one a camera read, and
    // the difference between the two is usually a personal address against a
    // work one rather than a correction.
    const filled: string[] = [];
    if (email || phone) {
      const current = await db.execute({
        sql: 'SELECT email, phone FROM attendees WHERE id = ?',
        args: [attendee_id],
      // A tenant whose table predates the phone column reads as having
      // neither, and the update below then fails the same way and is skipped.
      }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

      if (current.rows.length > 0) {
        const row = current.rows[0] as { email?: unknown; phone?: unknown };
        const fill = contactFillFor(row, { email, phone });
        if (fill.filled.length > 0) {
          const ok = await db.execute({
            // COALESCE rather than a built column list: a null leaves the
            // column as it was, so one statement covers either field or both.
            sql: `UPDATE attendees
                  SET email = COALESCE(?, email), phone = COALESCE(?, phone)
                  WHERE id = ?`,
            args: [fill.email, fill.phone, attendee_id],
          }).then(() => true).catch(() => false);
          if (ok) filled.push(...fill.filled);
        }
      }
    }

    // Resolve the current user's config_id for assigned_rep
    const userRow = await db.execute({
      sql: `SELECT config_id FROM users WHERE email = ? AND config_id IS NOT NULL LIMIT 1`,
      args: [userEmail],
    });
    const assignedRep = userRow.rows[0]?.config_id ? String(userRow.rows[0].config_id) : null;

    // Associate attendee with conference
    await db.execute({
      sql: `INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id, created_at, source) VALUES (?, ?, datetime('now'), 'manual')`,
      args: [conference_id, attendee_id],
    });

    // Find the "Bus. Card" next_steps config option
    const busCardRow = await db.execute({
      sql: `SELECT id, value FROM config_options
            WHERE category = 'next_steps' AND (LOWER(value) LIKE '%bus%card%' OR LOWER(value) LIKE '%business%card%')
            LIMIT 1`,
      args: [],
    });
    const nextStepsValue = busCardRow.rows[0] ? String(busCardRow.rows[0].value) : 'Bus. Card';

    // Create follow-up with assigned rep
    const result = await db.execute({
      sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep)
            VALUES (?, ?, ?, ?, ?)`,
      args: [attendee_id, conference_id, nextStepsValue, 'Follow up from business card scan', assignedRep],
    });

    // filled says which details the scan contributed, so the confirmation can
    // name them rather than leaving the reader to go and look.
    return NextResponse.json({
      success: true,
      follow_up_id: Number(result.lastInsertRowid),
      filled,
    });
  } catch (error) {
    console.error('POST /api/card-scan/confirm error:', error);
    return NextResponse.json({ error: 'Confirm failed' }, { status: 500 });
  }
}
