import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { trackEvent, trackFeature } from '@/lib/trackEvent';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    // Resolve the current user's config_id — same pattern as card-scan/confirm
    const userRow = await db.execute({
      sql: `SELECT config_id FROM users WHERE id = ? AND config_id IS NOT NULL LIMIT 1`,
      args: [authResult.id],
    });
    const assignedRep: string | null = userRow.rows[0]?.config_id ? String(userRow.rows[0].config_id) : null;

    const body = await request.json();
    const {
      quick_note_id,
      attendee_id,
      conference_id,
      company_id,
      interaction_type,
      notes_text,
      products,         // string[] — selected product names
      sentiment,        // string | null — status option value
      schedule_follow_up, // boolean | null
    } = body as {
      quick_note_id?: number | null;
      attendee_id?: number | null;
      conference_id?: number | null;
      company_id?: number | null;
      interaction_type: string;
      notes_text?: string | null;
      products?: string[] | null;
      sentiment?: string | null;
      schedule_follow_up?: boolean | null;
    };

    if (!interaction_type) {
      return NextResponse.json({ error: 'interaction_type is required' }, { status: 400 });
    }

    const results: Record<string, unknown> = {};
    const isMeeting = interaction_type === 'booth-demo' || interaction_type === 'booth-meeting';
    const isConvo = interaction_type === 'booth-stop';
    const isFollowup = interaction_type === 'booth-followup';
    const productList = Array.isArray(products) ? products.filter(Boolean) : [];
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // ── Meeting path (booth-demo / booth-meeting) ──────────────────────────────
    if (isMeeting && attendee_id && conference_id) {
      // Read meeting type label from config at runtime
      const typeLabel = interaction_type === 'booth-demo' ? 'Booth Demo' : 'Booth Meeting';
      const typeRes = await db.execute({
        sql: "SELECT value FROM config_options WHERE category = 'meeting_type' AND value = ? LIMIT 1",
        args: [typeLabel],
      });
      const meetingTypeName = typeRes.rows.length > 0 ? String(typeRes.rows[0].value) : typeLabel;

      // Read "Meeting Held" outcome from config (action_key = 'meeting_held')
      const heldRes = await db.execute({
        sql: "SELECT value FROM config_options WHERE category = 'action' AND action_key = 'meeting_held' LIMIT 1",
        args: [],
      });
      const heldName = heldRes.rows.length > 0 ? String(heldRes.rows[0].value) : 'Held';

      const mtgRes = await db.execute({
        sql: `INSERT INTO meetings (attendee_id, conference_id, meeting_date, meeting_time, location, outcome, meeting_type, scheduled_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [attendee_id, conference_id, dateStr, timeStr, 'Booth', heldName, meetingTypeName, assignedRep],
      });
      const meetingId = mtgRes.rows[0]?.id ?? null;
      results.meeting_id = meetingId;

      // Update conference_attendee_details — add meeting_held action
      const existing = await db.execute({
        sql: 'SELECT action FROM conference_attendee_details WHERE attendee_id = ? AND conference_id = ?',
        args: [attendee_id, conference_id],
      });
      if (existing.rows.length > 0) {
        const actions = new Set(String(existing.rows[0].action ?? '').split(',').map((a: string) => a.trim()).filter(Boolean));
        actions.add(heldName);
        await db.execute({
          sql: 'UPDATE conference_attendee_details SET action = ? WHERE attendee_id = ? AND conference_id = ?',
          args: [Array.from(actions).join(','), attendee_id, conference_id],
        });
      } else {
        await db.execute({
          sql: 'INSERT OR REPLACE INTO conference_attendee_details (attendee_id, conference_id, action) VALUES (?, ?, ?)',
          args: [attendee_id, conference_id, heldName],
        });
      }

      // Build Post-Mtg follow-up subtext
      const verb = interaction_type === 'booth-demo' ? 'Demoed' : 'Met re:';
      const subtextLines: string[] = [];
      if (productList.length > 0) subtextLines.push(`${verb} ${productList.join(', ')}`);
      if (sentiment) subtextLines.push(sentiment);
      if (schedule_follow_up === true) subtextLines.push('Schedule Follow Up Meeting');
      const subtextNotes = subtextLines.length > 0 ? subtextLines.join('\n') : null;

      // Read Post-Mtg next_steps option from config (action_key = 'post_mtg')
      const postMtgRes = await db.execute({
        sql: "SELECT value FROM config_options WHERE category = 'next_steps' AND action_key = 'post_mtg' LIMIT 1",
        args: [],
      });
      if (postMtgRes.rows.length > 0) {
        const postMtgValue = String(postMtgRes.rows[0].value);
        await db.execute({
          sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep, completed)
                VALUES (?, ?, ?, ?, ?, 0)`,
          args: [attendee_id, conference_id, postMtgValue, subtextNotes, assignedRep],
        });
        results.follow_up = 'created';
      }
    }

    // ── Convo path (booth-stop) ───────────────────────────────────────────────
    if (isConvo && attendee_id && conference_id) {
      const tpOption = await db.execute({
        sql: "SELECT id, auto_follow_up FROM config_options WHERE category = 'touchpoints' AND value = 'Booth Stop' LIMIT 1",
        args: [],
      });

      if (tpOption.rows.length > 0) {
        const tpId = Number(tpOption.rows[0].id);
        await db.execute({
          sql: `INSERT INTO attendee_touchpoints (attendee_id, conference_id, option_id) VALUES (?, ?, ?)`,
          args: [attendee_id, conference_id, tpId],
        });
        results.touchpoint = 'created';

        // Build follow-up subtext
        const subtextLines: string[] = [];
        if (productList.length > 0) subtextLines.push(`Discussed: ${productList.join(', ')}`);
        if (sentiment) subtextLines.push(sentiment);
        if (schedule_follow_up === true) subtextLines.push('Schedule Follow Up Meeting');
        const subtextNotes = subtextLines.length > 0 ? subtextLines.join('\n') : null;

        // If auto_follow_up is set on the touchpoint option, create a follow-up with our subtext
        // Use the touchpoint value ("Booth Stop") directly as next_steps, same as attendee detail flow
        const tpValue = String(tpOption.rows[0].value);
        if (Number(tpOption.rows[0].auto_follow_up) === 1 || subtextNotes) {
          await db.execute({
            sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep, completed)
                  VALUES (?, ?, ?, ?, ?, 0)`,
            args: [attendee_id, conference_id, tpValue, subtextNotes ?? `Booth conversation`, assignedRep],
          });
          results.follow_up = 'created';
        }
      }
    }

    // ── Follow-up path (booth-followup) ──────────────────────────────────────
    if (isFollowup && attendee_id && conference_id) {
      const subtextLines: string[] = [];
      if (productList.length > 0) subtextLines.push(`Discussed: ${productList.join(', ')}`);
      if (sentiment) subtextLines.push(sentiment);
      if (schedule_follow_up === true) subtextLines.push('Schedule Follow Up Meeting');
      const subtextNotes = subtextLines.length > 0 ? subtextLines.join('\n') : notes_text ?? null;

      const followRes = await db.execute({
        sql: "SELECT value FROM config_options WHERE category = 'next_steps' AND action_key = 'post_mtg' LIMIT 1",
        args: [],
      });
      const followValue = followRes.rows.length > 0 ? String(followRes.rows[0].value) : 'Follow Up';
      await db.execute({
        sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep, completed)
              VALUES (?, ?, ?, ?, ?, 0)`,
        args: [attendee_id, conference_id, followValue, subtextNotes, assignedRep],
      });
      results.follow_up = 'created';
    }

    // ── Entity note ───────────────────────────────────────────────────────────
    if (notes_text?.trim() && attendee_id) {
      // Fetch names needed for entity_notes columns
      const [attRow, confRow, repRow2] = await Promise.all([
        db.execute({ sql: `SELECT first_name, last_name, company_id FROM attendees WHERE id = ? LIMIT 1`, args: [attendee_id] }),
        conference_id ? db.execute({ sql: `SELECT name FROM conferences WHERE id = ? LIMIT 1`, args: [conference_id] }) : Promise.resolve({ rows: [] }),
        db.execute({ sql: `SELECT co.value as rep_name FROM users u LEFT JOIN config_options co ON u.config_id = co.id WHERE u.id = ? LIMIT 1`, args: [authResult.id] }),
      ]);
      const attendeeName = attRow.rows[0] ? `${attRow.rows[0].first_name} ${attRow.rows[0].last_name}`.trim() : null;
      const confName = confRow.rows[0]?.name ? String(confRow.rows[0].name) : null;
      const repNameStr = repRow2.rows[0]?.rep_name ? String(repRow2.rows[0].rep_name) : authResult.email;
      const resolvedCompanyId = company_id ?? (attRow.rows[0]?.company_id ? Number(attRow.rows[0].company_id) : null);

      // Fetch company name if we have a company_id
      let companyName: string | null = null;
      if (resolvedCompanyId) {
        const coRow = await db.execute({ sql: `SELECT name FROM companies WHERE id = ? LIMIT 1`, args: [resolvedCompanyId] });
        companyName = coRow.rows[0]?.name ? String(coRow.rows[0].name) : null;
      }

      const noteContent = notes_text.trim();
      const insertNote = async (entityType: string, entityId: number) => {
        await db.execute({
          sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, attendee_name, company_name, author_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [entityType, entityId, noteContent, confName, repNameStr,
                 entityType !== 'attendee' ? attendeeName : null,
                 entityType !== 'company' ? companyName : null,
                 authResult.id],
        }).catch(() => {});
      };

      await insertNote('attendee', attendee_id);
      if (resolvedCompanyId) await insertNote('company', resolvedCompanyId);
      if (conference_id) await insertNote('conference', conference_id);
      results.note = 'created';
    }

    // ── Delete quick_note ─────────────────────────────────────────────────────
    if (quick_note_id) {
      await db.execute({ sql: 'DELETE FROM quick_notes WHERE id = ?', args: [quick_note_id] });
    }

    trackEvent(authResult?.accountId, 'booth_scan', authResult?.id).catch(() => {});
    trackFeature(authResult?.accountId, 'booth_capture', authResult?.id).catch(() => {});
    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('POST /api/booth-scan/submit error:', error);
    return NextResponse.json({ error: 'Failed to submit booth scan' }, { status: 500 });
  }
}
