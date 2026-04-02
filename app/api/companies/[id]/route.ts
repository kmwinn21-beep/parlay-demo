import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const companyResult = await db.execute({
      sql: 'SELECT * FROM companies WHERE id = ?',
      args: [params.id],
    });

    if (companyResult.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = companyResult.rows[0];

    const attendeesResult = await db.execute({
      sql: `SELECT a.*, COUNT(DISTINCT ca.conference_id) as conference_count
            FROM attendees a
            LEFT JOIN conference_attendees ca ON a.id = ca.attendee_id
            WHERE a.company_id = ?
            GROUP BY a.id
            ORDER BY a.last_name, a.first_name`,
      args: [params.id],
    });

    const attendees = attendeesResult.rows.map((r) => ({ ...r }));

    return NextResponse.json({ ...company, attendees });
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
    await dbReady;
    const body = await request.json();
    const { name, website, profit_type, company_type, notes } = body;

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const existingResult = await db.execute({
      sql: 'SELECT id FROM companies WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const updatedResult = await db.execute({
      sql: 'UPDATE companies SET name = ?, website = ?, profit_type = ?, company_type = ?, notes = ? WHERE id = ? RETURNING *',
      args: [name, website || null, profit_type || null, company_type || null, notes || null, params.id],
    });

    return NextResponse.json(updatedResult.rows[0]);
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
    await dbReady;

    const existingResult = await db.execute({
      sql: 'SELECT id FROM companies WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Unlink attendees from this company, then delete the company
    await db.batch(
      [
        { sql: 'UPDATE attendees SET company_id = NULL WHERE company_id = ?', args: [params.id] },
        { sql: 'DELETE FROM companies WHERE id = ?', args: [params.id] },
      ],
      'write'
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/companies/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 });
  }
}
