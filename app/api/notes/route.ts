import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { noteAuthorName } from '@/lib/noteAuthor';
import {
  getConfigIdByEmail,
  notifyCompanyAssignees,
  notifyForAttendee,
  notifyConferenceInternalAttendees,
  notifyMentionedUsers,
} from '@/lib/notifications';
import { trackEvent, trackFeature } from '@/lib/trackEvent';
import { waitUntil } from '@vercel/functions';
import { extractFromNote, storeSuggestions, noteProvenance } from '@/lib/suggestions/extract';
import { resolveNoteCompany } from '@/lib/suggestions/noteContext';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entity_type');
    const entityId = searchParams.get('entity_id');
    const entityIds = searchParams.get('entity_ids'); // comma-separated list

    if (!entityType || (!entityId && !entityIds)) {
      return NextResponse.json({ error: 'entity_type and entity_id (or entity_ids) are required' }, { status: 400 });
    }

    let result;
    if (entityIds) {
      const ids = entityIds.split(',').map(id => id.trim()).filter(Boolean);
      const joinCompany = entityType === 'company';
      result = await db.execute({
        sql: joinCompany
          ? `SELECT en.id, en.entity_type, en.entity_id, en.content, en.created_at, en.conference_name, en.rep, en.attendee_name, en.company_name, en.tagged_users, en.lets_talk, en.author_user_id, en.note_type, en.meeting_id, en.insight_counts, en.status, en.touchpoint_type, co.name AS joined_company_name, COUNT(nc.id) AS comment_count
                FROM entity_notes en
                LEFT JOIN companies co ON en.entity_id = co.id
                LEFT JOIN note_comments nc ON nc.note_id = en.id
                WHERE en.entity_type = ? AND en.entity_id IN (${ids.map(() => '?').join(',')})
                GROUP BY en.id
                ORDER BY en.created_at DESC`
          : `SELECT en.id, en.entity_type, en.entity_id, en.content, en.created_at, en.conference_name, en.rep, en.attendee_name, en.company_name, en.tagged_users, en.lets_talk, en.author_user_id, en.note_type, en.meeting_id, en.insight_counts, en.status, en.touchpoint_type, COUNT(nc.id) AS comment_count
                FROM entity_notes en
                LEFT JOIN note_comments nc ON nc.note_id = en.id
                WHERE en.entity_type = ? AND en.entity_id IN (${ids.map(() => '?').join(',')})
                GROUP BY en.id
                ORDER BY en.created_at DESC`,
        args: [entityType, ...ids],
      });
    } else {
      result = await db.execute({
        sql: `SELECT en.id, en.entity_type, en.entity_id, en.content, en.created_at, en.conference_name, en.rep, en.attendee_name, en.company_name, en.tagged_users, en.lets_talk, en.author_user_id, en.note_type, en.meeting_id, en.insight_counts, en.status, en.touchpoint_type, COUNT(nc.id) AS comment_count
              FROM entity_notes en
              LEFT JOIN note_comments nc ON nc.note_id = en.id
              WHERE en.entity_type = ? AND en.entity_id = ?
              GROUP BY en.id
              ORDER BY en.created_at DESC`,
        args: [entityType, entityId!],
      });
    }

    return NextResponse.json(
      result.rows.map((r) => ({
        id: Number(r.id),
        entity_type: String(r.entity_type),
        entity_id: Number(r.entity_id),
        content: String(r.content),
        created_at: String(r.created_at),
        conference_name: r.conference_name != null ? String(r.conference_name) : null,
        rep: r.rep != null ? String(r.rep) : null,
        attendee_name: r.attendee_name != null ? String(r.attendee_name) : null,
        company_name: r.joined_company_name != null
          ? String(r.joined_company_name)
          : (r.company_name != null ? String(r.company_name) : null),
        tagged_users: r.tagged_users != null ? String(r.tagged_users) : null,
        lets_talk: Number(r.lets_talk ?? 0),
        author_user_id: r.author_user_id != null ? Number(r.author_user_id) : null,
        comment_count: Number(r.comment_count ?? 0),
        note_type: r.note_type != null ? String(r.note_type) : 'note',
        meeting_id: r.meeting_id != null ? Number(r.meeting_id) : null,
        insight_counts: r.insight_counts != null ? String(r.insight_counts) : null,
        status: r.status != null ? String(r.status) : null,
        touchpoint_type: r.touchpoint_type != null ? String(r.touchpoint_type) : null,
      }))
    );
  } catch (error) {
    console.error('GET /api/notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

/**
 * The same note is saved against the attendee, the company and the conference.
 * Reading only one copy keeps a single note from producing three identical
 * sets of suggestions.
 */
function skipExtraction(entityType: string, attendeeName: unknown): boolean {
  if (entityType === 'attendee') return false;
  // A company note with no attendee named is the only copy there is.
  if (entityType === 'company') return !!String(attendeeName ?? '').trim();
  return true;
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  try {
    const {
      entity_type, entity_id, content, conference_name, rep,
      attendee_name, company_name, skip_notification, tagged_users,
      note_type, meeting_id, insight_counts, touchpoint_type, cascade,
    } = await request.json();

    if (!entity_type || !entity_id || !content?.trim()) {
      return NextResponse.json({ error: 'entity_type, entity_id, and content are required' }, { status: 400 });
    }

    /*
     * Resolve the rep server-side when the client did not send one — the user
     * may have no display name set.
     *
     * Falls back to the address, which names somebody even though the initials
     * it yields can be thin: `kwinn@…` has no separator in its local part, so
     * it is one letter, not "KW". That is the helper being honest rather than
     * inventing a surname, and it is why the name is looked up first.
     */
    const resolvedRep = rep || await noteAuthorName(db, user.email);

    // Callers pass the conference by name; resolve it to an id here so counting
    // notes per conference doesn't depend on that text staying identical.
    let resolvedConferenceId: number | null = null;
    if (conference_name && String(conference_name).trim()) {
      try {
        const confRow = await db.execute({
          sql: `SELECT id FROM conferences WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
          args: [String(conference_name)],
        });
        if (confRow.rows.length > 0) resolvedConferenceId = Number(confRow.rows[0].id);
      } catch { /* non-fatal — the name is still stored */ }
    }

    /*
     * Who the note is about, when the caller could not say.
     *
     * A note on an attendee belongs on their company and on the conference as
     * well — that is what makes it readable from any of the three. Every
     * caller has done that fan-out for itself, in nine different files, and
     * one of them could not: the notes popover on a row is handed an attendee
     * id and a conference NAME, and has no company at all. Its notes landed on
     * the attendee and nowhere else.
     *
     * So the server does it when asked. The attendee's company comes from the
     * attendee, and the conference from the name that was already being
     * resolved for conference_id, which means a caller needs nothing it does
     * not already have.
     *
     * Opt-in rather than automatic, because the other eight callers post the
     * copies themselves and would otherwise write each note twice. They can
     * move over to this one at a time; this is the shape they would move to.
     */
    let cascadeCompanyId: number | null = null;
    let resolvedAttendeeName: string | null = attendee_name || null;
    let resolvedCompanyName: string | null = company_name || null;
    if (cascade && entity_type === 'attendee') {
      try {
        const att = await db.execute({
          sql: `SELECT a.first_name, a.last_name, a.company_id, c.name AS company_name
                FROM attendees a LEFT JOIN companies c ON c.id = a.company_id
                WHERE a.id = ? LIMIT 1`,
          args: [entity_id],
        });
        if (att.rows.length > 0) {
          const r = att.rows[0];
          cascadeCompanyId = r.company_id != null ? Number(r.company_id) : null;
          resolvedAttendeeName ||= `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || null;
          resolvedCompanyName ||= r.company_name != null ? String(r.company_name) : null;
        }
      } catch { /* non-fatal — the note still lands on the attendee */ }
    }

    const result = await db.execute({
      sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, conference_id, rep, attendee_name, company_name, tagged_users, author_user_id, note_type, meeting_id, insight_counts, touchpoint_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id, entity_type, entity_id, content, created_at, conference_name, rep, attendee_name, company_name, tagged_users, author_user_id, note_type, meeting_id, insight_counts, touchpoint_type`,
      args: [
        entity_type, entity_id, content.trim(),
        conference_name || null, resolvedConferenceId,
        resolvedRep,
        resolvedAttendeeName, resolvedCompanyName,
        tagged_users || null, user.id,
        note_type || 'note', meeting_id ?? null, insight_counts ?? null,
        touchpoint_type || null,
      ],
    });

    /*
     * The copies. Written after the attendee's own row, so a failure here
     * cannot cost the note itself — the thing that must not be lost is the
     * note, and a missing copy is recoverable where a missing note is not.
     *
     * They carry no notification: the primary row has already sent one, and a
     * reader does not want three for one note.
     */
    if (cascade && entity_type === 'attendee') {
      const copies: Array<{ type: string; id: number }> = [];
      if (cascadeCompanyId) copies.push({ type: 'company', id: cascadeCompanyId });
      if (resolvedConferenceId) copies.push({ type: 'conference', id: resolvedConferenceId });
      if (copies.length > 0) {
        await db.batch(copies.map(c => ({
          sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, conference_id, rep, attendee_name, company_name, tagged_users, author_user_id, note_type, touchpoint_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            c.type, c.id, content.trim(),
            conference_name || null, resolvedConferenceId,
            resolvedRep,
            resolvedAttendeeName, resolvedCompanyName,
            tagged_users || null, user.id,
            note_type || 'note', touchpoint_type || null,
          ],
        })), 'write').catch(err => {
          console.error('POST /api/notes cascade failed:', err);
        });
      }
    }

    const row = result.rows[0];
    const response = {
      id: Number(row.id),
      entity_type: String(row.entity_type),
      entity_id: Number(row.entity_id),
      content: String(row.content),
      created_at: String(row.created_at),
      conference_name: row.conference_name != null ? String(row.conference_name) : null,
      rep: row.rep != null ? String(row.rep) : null,
      attendee_name: row.attendee_name != null ? String(row.attendee_name) : null,
      company_name: row.company_name != null ? String(row.company_name) : null,
      tagged_users: row.tagged_users != null ? String(row.tagged_users) : null,
      lets_talk: 0,
      author_user_id: Number(user.id),
      comment_count: 0,
      note_type: row.note_type != null ? String(row.note_type) : 'note',
      meeting_id: row.meeting_id != null ? Number(row.meeting_id) : null,
      insight_counts: row.insight_counts != null ? String(row.insight_counts) : null,
      touchpoint_type: row.touchpoint_type != null ? String(row.touchpoint_type) : null,
    };

    // Read the note for facts worth recording elsewhere, and offer them.
    //
    // After the response, never blocking it: the note is the thing that must
    // not be lost, and suggestions are upside. Off unless the account has
    // opted in, so it can't quietly start costing anything.
    //
    // One note is written three times — against the attendee, the company and
    // the conference — so only the attendee copy is read, and the company copy
    // when there is no attendee. Otherwise the same sentence would be
    // extracted three times and proposed three times over.
    if (process.env.NOTE_EXTRACTION_ENABLED === '1' && !skipExtraction(entity_type, attendee_name)) {
      const noteId = Number(row.id);
      const noteText = String(row.content ?? '');
      const noteConference = row.conference_name != null ? String(row.conference_name) : null;
      const noteLoggedAt = row.created_at != null ? String(row.created_at) : null;
      waitUntil((async () => {
        try {
          const ctx = await resolveNoteCompany(db, String(row.entity_type), Number(row.entity_id));
          if (!ctx.companyId) return;
          // The author, not the note's `rep` — some flows put the person the
          // follow-up was assigned to in that column, which is someone else.
          const author = await noteAuthorName(db, user.email);
          const result = await extractFromNote(db, {
            noteId,
            content: noteText,
            companyId: ctx.companyId,
            companyName: ctx.companyName,
            attendeeId: ctx.attendeeId,
            provenance: noteProvenance({
              author,
              conferenceName: noteConference,
              loggedAt: noteLoggedAt,
            }),
          });
          // Rejections are the only record of an extraction that was read and
          // then thrown away — without this a suggestion that never appears
          // leaves no trace anywhere to explain why.
          if (result.rejected.length > 0) {
            console.warn('[suggestions] note %d: rejected %d proposal(s):', noteId,
              result.rejected.length, result.rejected.map(r => `${r.target_key}: ${r.reason}`));
          }
          if (result.accepted.length > 0) await storeSuggestions(db, noteId, result.accepted);
        } catch (err) {
          console.error('[suggestions] extraction after note save failed:', err);
        }
      })());
    }

    // Fire standard notifications (best-effort) — skipped on cross-posts to avoid duplicates
    if (!skip_notification) {
      const changedByConfigId = await getConfigIdByEmail(db, user.email);
      const snippet = content.trim().slice(0, 80);
      if (entity_type === 'attendee') {
        const attRow = await db.execute({
          sql: 'SELECT first_name, last_name FROM attendees WHERE id = ?',
          args: [entity_id],
        });
        const nameStr = attRow.rows.length > 0
          ? `${attRow.rows[0].first_name} ${attRow.rows[0].last_name}`.trim()
          : `Attendee #${entity_id}`;
        notifyForAttendee(db, {
          attendeeId: Number(entity_id),
          attendeeName: nameStr,
          message: `New note added: "${snippet}"`,
          changedByEmail: user.email,
          changedByConfigId,
        });
      } else if (entity_type === 'company') {
        const coRow = await db.execute({
          sql: 'SELECT name FROM companies WHERE id = ?',
          args: [entity_id],
        });
        const nameStr = coRow.rows.length > 0 ? String(coRow.rows[0].name) : `Company #${entity_id}`;
        notifyCompanyAssignees(db, {
          companyId: Number(entity_id),
          companyName: nameStr,
          message: `New note added: "${snippet}"`,
          changedByEmail: user.email,
          changedByConfigId,
        });
      } else if (entity_type === 'conference') {
        const confRow = await db.execute({
          sql: 'SELECT name FROM conferences WHERE id = ?',
          args: [entity_id],
        });
        const nameStr = confRow.rows.length > 0 ? String(confRow.rows[0].name) : `Conference #${entity_id}`;
        notifyConferenceInternalAttendees(db, {
          conferenceId: Number(entity_id),
          conferenceName: nameStr,
          message: `New note added: "${snippet}"`,
          changedByEmail: user.email,
          changedByConfigId,
        });
      }
    }

    // Fire @mention notifications — always, regardless of skip_notification
    if (tagged_users) {
      const taggedConfigIds = String(tagged_users)
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);

      if (taggedConfigIds.length > 0) {
        const changedByConfigId = await getConfigIdByEmail(db, user.email);
        // Resolve entity name for the notification message
        let entityName = '';
        try {
          if (entity_type === 'company') {
            const r = await db.execute({ sql: 'SELECT name FROM companies WHERE id = ?', args: [entity_id] });
            entityName = r.rows.length > 0 ? String(r.rows[0].name) : company_name || `Company #${entity_id}`;
          } else if (entity_type === 'attendee') {
            const r = await db.execute({ sql: 'SELECT first_name, last_name FROM attendees WHERE id = ?', args: [entity_id] });
            entityName = r.rows.length > 0
              ? `${r.rows[0].first_name} ${r.rows[0].last_name}`.trim()
              : attendee_name || `Attendee #${entity_id}`;
          } else if (entity_type === 'conference') {
            const r = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [entity_id] });
            entityName = r.rows.length > 0 ? String(r.rows[0].name) : conference_name || `Conference #${entity_id}`;
          }
        } catch { /* non-fatal */ }

        // Resolve mentioner display name from config_options using the already-looked-up configId
        const emailUsername = user.email.split('@')[0];
        const emailInitials = ((emailUsername[0] || '') + (emailUsername[1] || '')).toUpperCase();
        let mentionerName = emailInitials || user.email;
        if (changedByConfigId) {
          try {
            const nameRow = await db.execute({
              sql: 'SELECT value FROM config_options WHERE id = ?',
              args: [changedByConfigId],
            });
            if (nameRow.rows.length > 0 && nameRow.rows[0].value) {
              mentionerName = String(nameRow.rows[0].value);
            }
          } catch { /* non-fatal */ }
        }

        notifyMentionedUsers(db, {
          taggedConfigIds,
          mentionerName,
          mentionerEmail: user.email,
          mentionerConfigId: changedByConfigId,
          entityName,
          entityType: entity_type,
          entityId: Number(entity_id),
        });
      }
    }

    trackEvent(user?.accountId, 'note_created', user?.id).catch(() => {});
    trackFeature(user?.accountId, 'floor_notes', user?.id).catch(() => {});
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('POST /api/notes error:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}
