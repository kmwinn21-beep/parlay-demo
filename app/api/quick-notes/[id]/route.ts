import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
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

// PATCH = assign note to one or more entities, then delete from quick_notes
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
    const { conference_id, company_id, attendee_id, conference_name, company_name, attendee_name } = await request.json() as {
      conference_id?: number | null;
      company_id?: number | null;
      attendee_id?: number | null;
      conference_name?: string | null;
      company_name?: string | null;
      attendee_name?: string | null;
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

    await db.batch(
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

    await db.execute({
      sql: 'DELETE FROM quick_notes WHERE id = ? AND created_by = ?',
      args: [Number(params.id), user.email],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/quick-notes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to assign note' }, { status: 500 });
  }
}
