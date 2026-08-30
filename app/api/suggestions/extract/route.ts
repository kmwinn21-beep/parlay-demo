import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { extractFromNote, storeSuggestions, noteProvenance } from '@/lib/suggestions/extract';
import { resolveNoteCompany } from '@/lib/suggestions/noteContext';

export const dynamic = 'force-dynamic';

/**
 * Run the extractor on demand.
 *
 * Exists so the output can be read over real notes before anything is turned
 * on for everyone: pass `dry_run` and it reports what it would have stored,
 * including what it threw away and why, without writing a row.
 *
 * Takes either a note id, or raw text plus a company id for trying wording
 * that isn't saved anywhere yet.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const db = await getDb(auth?.accountId);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Extraction service not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const dryRun = body?.dry_run !== false;
    const noteId = body?.note_id != null ? Number(body.note_id) : null;

    let content = String(body?.content ?? '');
    let companyId = body?.company_id != null ? Number(body.company_id) : 0;
    let companyName: string | null = null;
    let attendeeId: number | null = body?.attendee_id != null ? Number(body.attendee_id) : null;
    let provenance: string | null = null;

    if (noteId) {
      const res = await db.execute({
        sql: 'SELECT id, content, entity_type, entity_id, rep, conference_name, created_at FROM entity_notes WHERE id = ?',
        args: [noteId],
      });
      if (res.rows.length === 0) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
      const note = res.rows[0];
      content = String(note.content ?? '');
      const resolved = await resolveNoteCompany(db, String(note.entity_type), Number(note.entity_id));
      companyId = resolved.companyId ?? 0;
      companyName = resolved.companyName;
      attendeeId = resolved.attendeeId;
      provenance = noteProvenance({
        author: note.rep != null ? String(note.rep) : null,
        conferenceName: note.conference_name != null ? String(note.conference_name) : null,
        loggedAt: note.created_at != null ? String(note.created_at) : null,
      });
    } else if (companyId) {
      const res = await db.execute({ sql: 'SELECT name FROM companies WHERE id = ?', args: [companyId] });
      companyName = res.rows.length > 0 ? String(res.rows[0].name) : null;
    }

    if (!companyId) {
      return NextResponse.json({ error: 'The note does not resolve to a company, so there is nothing to attach to.' }, { status: 400 });
    }
    if (!content.trim()) return NextResponse.json({ error: 'No content to read' }, { status: 400 });

    const result = await extractFromNote(db, { noteId, content, companyId, companyName, attendeeId, provenance });
    const stored = dryRun ? 0 : await storeSuggestions(db, noteId, result.accepted);

    return NextResponse.json({
      dry_run: dryRun,
      company_id: companyId,
      company_name: companyName,
      proposed: result.accepted,
      rejected: result.rejected,
      stored,
    });
  } catch (error) {
    console.error('POST /api/suggestions/extract error:', error);
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });
  }
}
