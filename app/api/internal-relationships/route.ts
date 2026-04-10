import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company_id');
    const attendeeId = searchParams.get('attendee_id');

    if (companyId) {
      const result = await db.execute({
        sql: 'SELECT * FROM internal_relationships WHERE company_id = ? ORDER BY created_at DESC',
        args: [Number(companyId)],
      });
      return NextResponse.json(result.rows.map(r => ({
        id: Number(r.id),
        company_id: Number(r.company_id),
        rep_ids: r.rep_ids ? String(r.rep_ids) : null,
        contact_ids: r.contact_ids ? String(r.contact_ids) : null,
        relationship_status: String(r.relationship_status),
        description: String(r.description),
        created_at: String(r.created_at),
      })));
    }

    if (attendeeId) {
      // Find all relationships where this attendee is listed in contact_ids
      const result = await db.execute({
        sql: 'SELECT * FROM internal_relationships ORDER BY created_at DESC',
        args: [],
      });
      const filtered = result.rows.filter(r => {
        const contactIds = r.contact_ids ? String(r.contact_ids).split(',').map(s => s.trim()) : [];
        return contactIds.includes(String(attendeeId));
      });
      return NextResponse.json(filtered.map(r => ({
        id: Number(r.id),
        company_id: Number(r.company_id),
        rep_ids: r.rep_ids ? String(r.rep_ids) : null,
        contact_ids: r.contact_ids ? String(r.contact_ids) : null,
        relationship_status: String(r.relationship_status),
        description: String(r.description),
        created_at: String(r.created_at),
      })));
    }

    return NextResponse.json({ error: 'company_id or attendee_id is required' }, { status: 400 });
  } catch (error) {
    console.error('GET /api/internal-relationships error:', error);
    return NextResponse.json({ error: 'Failed to fetch internal relationships' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { company_id, rep_ids, contact_ids, relationship_status, description } = body;

    if (!company_id || !relationship_status || !description) {
      return NextResponse.json({ error: 'company_id, relationship_status, and description are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: 'INSERT INTO internal_relationships (company_id, rep_ids, contact_ids, relationship_status, description) VALUES (?, ?, ?, ?, ?) RETURNING *',
      args: [
        Number(company_id),
        rep_ids || null,
        contact_ids || null,
        relationship_status,
        description,
      ],
    });

    const row = result.rows[0];
    return NextResponse.json({
      id: Number(row.id),
      company_id: Number(row.company_id),
      rep_ids: row.rep_ids ? String(row.rep_ids) : null,
      contact_ids: row.contact_ids ? String(row.contact_ids) : null,
      relationship_status: String(row.relationship_status),
      description: String(row.description),
      created_at: String(row.created_at),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/internal-relationships error:', error);
    return NextResponse.json({ error: 'Failed to create internal relationship' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await db.execute({ sql: 'DELETE FROM internal_relationships WHERE id = ?', args: [Number(id)] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/internal-relationships error:', error);
    return NextResponse.json({ error: 'Failed to delete internal relationship' }, { status: 500 });
  }
}
