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
      sql: `SELECT a.*, COUNT(DISTINCT ca.conference_id) as conference_count,
                   GROUP_CONCAT(DISTINCT conf.name) as conference_names
            FROM attendees a
            LEFT JOIN conference_attendees ca ON a.id = ca.attendee_id
            LEFT JOIN conferences conf ON ca.conference_id = conf.id
            WHERE a.company_id = ?
            GROUP BY a.id
            ORDER BY a.last_name, a.first_name`,
      args: [params.id],
    });

    const attendees = attendeesResult.rows.map((r) => ({ ...r }));

    // Distinct conferences this company has attended, most recent first
    const confsResult = await db.execute({
      sql: `SELECT DISTINCT c.id, c.name, c.start_date, c.end_date, c.location
            FROM conferences c
            JOIN conference_attendees ca ON c.id = ca.conference_id
            JOIN attendees a ON ca.attendee_id = a.id
            WHERE a.company_id = ?
            ORDER BY c.start_date DESC`,
      args: [params.id],
    });
    const conferences = confsResult.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      start_date: String(r.start_date),
      end_date: String(r.end_date),
      location: String(r.location),
    }));

    return NextResponse.json({ ...company, attendees, conferences });
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    // Update company status and propagate to all associated attendees
    await db.batch(
      [
        { sql: 'UPDATE companies SET status = ? WHERE id = ?', args: [status, params.id] },
        { sql: 'UPDATE attendees SET status = ? WHERE company_id = ?', args: [status, params.id] },
      ],
      'write'
    );

    const result = await db.execute({ sql: 'SELECT * FROM companies WHERE id = ?', args: [params.id] });
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('PATCH /api/companies/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update company status' }, { status: 500 });
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
