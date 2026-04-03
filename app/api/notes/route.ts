import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entity_type');
    const entityId = searchParams.get('entity_id');

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entity_type and entity_id are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `SELECT id, entity_type, entity_id, content, created_at
            FROM entity_notes
            WHERE entity_type = ? AND entity_id = ?
            ORDER BY created_at DESC`,
      args: [entityType, entityId],
    });

    return NextResponse.json(
      result.rows.map((r) => ({
        id: Number(r.id),
        entity_type: String(r.entity_type),
        entity_id: Number(r.entity_id),
        content: String(r.content),
        created_at: String(r.created_at),
      }))
    );
  } catch (error) {
    console.error('GET /api/notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const { entity_type, entity_id, content } = await request.json();

    if (!entity_type || !entity_id || !content?.trim()) {
      return NextResponse.json({ error: 'entity_type, entity_id, and content are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `INSERT INTO entity_notes (entity_type, entity_id, content)
            VALUES (?, ?, ?)
            RETURNING id, entity_type, entity_id, content, created_at`,
      args: [entity_type, entity_id, content.trim()],
    });

    const row = result.rows[0];
    return NextResponse.json({
      id: Number(row.id),
      entity_type: String(row.entity_type),
      entity_id: Number(row.entity_id),
      content: String(row.content),
      created_at: String(row.created_at),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/notes error:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}
