import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const { id } = params;
    const body = await request.json();
    const { meeting_date, meeting_time, location, scheduled_by, additional_attendees } = body;

    if (!meeting_date || !meeting_time) {
      return NextResponse.json({ error: 'meeting_date and meeting_time are required' }, { status: 400 });
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM meetings WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    await db.execute({
      sql: `UPDATE meetings SET meeting_date = ?, meeting_time = ?, location = ?, scheduled_by = ?, additional_attendees = ? WHERE id = ?`,
      args: [meeting_date, meeting_time, location ?? null, scheduled_by ?? null, additional_attendees ?? null, id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update meeting' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const { id } = params;

    const existing = await db.execute({
      sql: 'SELECT id FROM meetings WHERE id = ?',
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    await db.execute({
      sql: 'DELETE FROM meetings WHERE id = ?',
      args: [id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete meeting' }, { status: 500 });
  }
}
