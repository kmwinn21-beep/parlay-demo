import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(params.id);

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const attendees = db
      .prepare(
        `SELECT a.*, COUNT(DISTINCT ca.conference_id) as conference_count
         FROM attendees a
         LEFT JOIN conference_attendees ca ON a.id = ca.attendee_id
         WHERE a.company_id = ?
         GROUP BY a.id
         ORDER BY a.last_name, a.first_name`
      )
      .all(params.id);

    return NextResponse.json({ ...company as object, attendees });
  } catch (error) {
    console.error('GET /api/companies/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, website, profit_type, company_type, notes } = body;

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const db = getDb();

    const existing = db.prepare('SELECT id FROM companies WHERE id = ?').get(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const updated = db
      .prepare(
        'UPDATE companies SET name = ?, website = ?, profit_type = ?, company_type = ?, notes = ? WHERE id = ? RETURNING *'
      )
      .get(name, website || null, profit_type || null, company_type || null, notes || null, params.id);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/companies/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();

    const existing = db.prepare('SELECT id FROM companies WHERE id = ?').get(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Unlink attendees from this company
    db.prepare('UPDATE attendees SET company_id = NULL WHERE company_id = ?').run(params.id);
    db.prepare('DELETE FROM companies WHERE id = ?').run(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/companies/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 });
  }
}
