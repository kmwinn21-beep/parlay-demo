import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    await db.execute({
      sql: 'DELETE FROM entity_notes WHERE id = ?',
      args: [params.id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/notes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
