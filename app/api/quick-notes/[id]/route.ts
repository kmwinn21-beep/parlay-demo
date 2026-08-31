import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { waitUntil } from '@vercel/functions';
import { extractFromNote, storeSuggestions, noteProvenance } from '@/lib/suggestions/extract';
import { resolveNoteCompany } from '@/lib/suggestions/noteContext';
import { getConfigIdByEmail } from '@/lib/notifications';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  try {
    const result = await db.execute({
      sql: 'DELETE FROM quick_notes WHERE id = ? AND created_by = ?',
      args: [Number(params.id), user.email],
    });
    if (Number(result.rowsAffected ?? 0) === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/quick-notes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete quick note' }, { status: 500 });
  }
}

// PUT = update note content and/or conference tag (either field may be
// omitted — e.g. the "+ Event" pill sends only conference_id).
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  try {
    const body = await request.json() as { content?: string; conference_id?: number | null };
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    if (body.content !== undefined) {
      if (!body.content.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 });
      sets.push('content = ?');
      args.push(body.content.trim());
    }
    if ('conference_id' in body) {
      sets.push('conference_id = ?');
      args.push(body.conference_id ?? null);
    }
    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    args.push(Number(params.id), user.email);
    const result = await db.execute({
      sql: `UPDATE quick_notes SET ${sets.join(', ')} WHERE id = ? AND created_by = ?
            RETURNING id, content, created_at, created_by, tag, secondary_tag, product_suggestions, conference_id`,
      args,
    });
    if (result.rows.length === 0) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    const row = result.rows[0];
    let conferenceName: string | null = null;
    if (row.conference_id != null) {
      const cRow = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [row.conference_id] });
      conferenceName = cRow.rows.length > 0 ? String(cRow.rows[0].name) : null;
    }
    return NextResponse.json({
      id: Number(row.id),
      content: String(row.content),
      created_at: String(row.created_at),
      created_by: row.created_by ? String(row.created_by) : null,
      tag: row.tag ? String(row.tag) : null,
      secondary_tag: row.secondary_tag ? String(row.secondary_tag) : null,
      product_suggestions: row.product_suggestions ? String(row.product_suggestions) : null,
      conference_id: row.conference_id != null ? Number(row.conference_id) : null,
      conference_name: conferenceName,
    });
  } catch (error) {
    console.error('PUT /api/quick-notes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

// PATCH = assign note to one or more entities, then delete from quick_notes
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  try {
    const {
      conference_id, company_id, attendee_id, conference_name, company_name, attendee_name,
      create_follow_up, follow_up_action, follow_up_rep_ids,
    } = await request.json() as {
      conference_id?: number | null;
      company_id?: number | null;
      attendee_id?: number | null;
      conference_name?: string | null;
      company_name?: string | null;
      attendee_name?: string | null;
      create_follow_up?: boolean;
      follow_up_action?: string | null;
      follow_up_rep_ids?: number[];
    };

    const noteRow = await db.execute({
      sql: 'SELECT content FROM quick_notes WHERE id = ? AND created_by = ?',
      args: [Number(params.id), user.email],
    });
    if (noteRow.rows.length === 0) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    const content = String(noteRow.rows[0].content);
    const rep = user.email ?? null;

    const inserts: Array<{ entity_type: string; entity_id: number }> = [];
    if (conference_id) inserts.push({ entity_type: 'conference', entity_id: conference_id });
    if (company_id) inserts.push({ entity_type: 'company', entity_id: company_id });
    if (attendee_id) inserts.push({ entity_type: 'attendee', entity_id: attendee_id });

    if (inserts.length === 0) return NextResponse.json({ error: 'At least one target required' }, { status: 400 });

    const written = await db.batch(
      inserts.map(({ entity_type, entity_id }) => ({
        sql: `INSERT INTO entity_notes (entity_type, entity_id, content, rep, conference_name, company_name, attendee_name)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          entity_type,
          entity_id,
          content,
          rep,
          conference_name ?? null,
          company_name ?? null,
          attendee_name ?? null,
        ],
      })),
      'write'
    );

    // A follow-up, only when this assignment asked for one. Floor notes have
    // never created follow-ups on their own and still don't; this fires
    // because somebody answered yes in the modal.
    let followUpCreated = false;
    if (create_follow_up && attendee_id && conference_id) {
      const reps = Array.isArray(follow_up_rep_ids)
        ? follow_up_rep_ids.map(Number).filter(n => Number.isFinite(n) && n > 0)
        : [];
      const assignedRep = reps.length > 0 ? reps.join(',') : null;
      const action = String(follow_up_action ?? '').trim() || null;
      await db.execute({
        // next_steps is what the Follow Ups table shows under "Source"; the
        // source column carries the same thing for anything reading it later.
        sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep, follow_up_action, source, completed)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        args: [attendee_id, conference_id, 'Flr. Note', content, assignedRep, action, 'Flr. Note'],
      });
      followUpCreated = true;
    }

    await db.execute({
      sql: 'DELETE FROM quick_notes WHERE id = ? AND created_by = ?',
      args: [Number(params.id), user.email],
    });

    // Read the assigned note for facts worth recording, exactly as a note
    // saved anywhere else is. This path writes entity_notes directly rather
    // than through /api/notes, which is why it needed saying again here.
    //
    // After the response and never blocking it, and only one of the copies is
    // read — the same note is written against the attendee, the company and
    // the conference, and reading each would propose everything three times.
    if (process.env.NOTE_EXTRACTION_ENABLED === '1') {
      const target = attendee_id
        ? { type: 'attendee' as const, id: Number(attendee_id) }
        : company_id
          ? { type: 'company' as const, id: Number(company_id) }
          : null;
      // The id of the copy being read, so the suggestion can point back at a
      // real note — that is what "View Full Note" reads, and what keeps a
      // dismissal scoped to this note rather than silencing the fact forever.
      const copyIndex = inserts.findIndex(i => i.entity_type === target?.type && i.entity_id === target?.id);
      const rowId = copyIndex >= 0 ? written[copyIndex]?.lastInsertRowid : undefined;
      const sourceNoteId = rowId != null ? Number(rowId) : null;

      if (target) {
        waitUntil((async () => {
          try {
            const ctx = await resolveNoteCompany(db, target.type, target.id);
            if (!ctx.companyId) return;
            let author: string = user.email;
            try {
              const configId = await getConfigIdByEmail(user.email, db);
              if (configId) {
                const nameRow = await db.execute({
                  sql: 'SELECT value FROM config_options WHERE id = ?',
                  args: [configId],
                });
                if (nameRow.rows.length > 0 && nameRow.rows[0].value) author = String(nameRow.rows[0].value);
              }
            } catch { /* the email still names them */ }
            const result = await extractFromNote(db, {
              noteId: sourceNoteId,
              content,
              companyId: ctx.companyId,
              companyName: ctx.companyName,
              attendeeId: ctx.attendeeId,
              provenance: noteProvenance({
                author,
                conferenceName: conference_name ?? null,
                loggedAt: null,
              }),
            });
            if (result.rejected.length > 0) {
              console.warn('[suggestions] assigned floor note: rejected %d proposal(s):',
                result.rejected.length, result.rejected.map(r => `${r.target_key}: ${r.reason}`));
            }
            if (result.accepted.length > 0) await storeSuggestions(db, sourceNoteId, result.accepted);
          } catch (err) {
            console.error('[suggestions] extraction after floor note assign failed:', err);
          }
        })());
      }
    }

    return NextResponse.json({ success: true, follow_up: followUpCreated });
  } catch (error) {
    console.error('PATCH /api/quick-notes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to assign note' }, { status: 500 });
  }
}
