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
    const body = await request.json() as {
      summary: string;
      attendee_id: number;
      company_id?: number | null;
      conference_id: number;
      conference_name: string;
      attendee_name: string;
      company_name?: string | null;
      rep?: string | null;
      insight_counts: string; // JSON string
    };

    // Ensure columns exist (best-effort ALTER TABLE for older tenant DBs)
    try { await db.execute({ sql: `ALTER TABLE entity_notes ADD COLUMN note_type TEXT DEFAULT 'note'`, args: [] }); } catch { /* already exists */ }
    try { await db.execute({ sql: `ALTER TABLE entity_notes ADD COLUMN meeting_id INTEGER`, args: [] }); } catch { /* already exists */ }
    try { await db.execute({ sql: `ALTER TABLE entity_notes ADD COLUMN insight_counts TEXT`, args: [] }); } catch { /* already exists */ }

    const resolvedRep = body.rep || user.email || null;

    const upsertNote = async (entityType: string, entityId: number) => {
      // Check for existing meeting note card for this entity+meeting
      const existing = await db.execute({
        sql: `SELECT id FROM entity_notes WHERE meeting_id = ? AND entity_type = ? AND entity_id = ? AND note_type = 'meeting_note'`,
        args: [meetingId, entityType, entityId],
      });
      if (existing.rows.length > 0) {
        // Update existing (no updated_at — column may not exist)
        await db.execute({
          sql: `UPDATE entity_notes SET content = ?, insight_counts = ? WHERE id = ?`,
          args: [body.summary, body.insight_counts, Number(existing.rows[0].id)],
        });
        return Number(existing.rows[0].id);
      } else {
        // Insert new
        const result = await db.execute({
          sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, attendee_name, company_name, author_user_id, note_type, meeting_id, insight_counts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'meeting_note', ?, ?) RETURNING id`,
          args: [entityType, entityId, body.summary, body.conference_name || null, resolvedRep, body.attendee_name || null, body.company_name || null, user.id, meetingId, body.insight_counts],
        });
        return result.rows[0] ? Number(result.rows[0].id) : null;
      }
    };

    await upsertNote('attendee', body.attendee_id);
    if (body.company_id) await upsertNote('company', body.company_id);
    await upsertNote('conference', body.conference_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('sync meeting notes error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
