import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

function parseServices(value: unknown): string[] {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function serializeServices(services: unknown): string | null {
  if (!Array.isArray(services)) return null;
  const cleaned = services.map((v) => String(v).trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(',') : null;
}

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

    const [attendeesResult, confsResult, childCompaniesResult, parentResult] = await Promise.all([
      db.execute({
        sql: `SELECT a.*, COUNT(DISTINCT ca.conference_id) as conference_count,
                     GROUP_CONCAT(DISTINCT conf.name) as conference_names
              FROM attendees a
              LEFT JOIN conference_attendees ca ON a.id = ca.attendee_id
              LEFT JOIN conferences conf ON ca.conference_id = conf.id
              WHERE a.company_id = ?
              GROUP BY a.id
              ORDER BY a.last_name, a.first_name`,
        args: [params.id],
      }),
      db.execute({
        sql: `SELECT DISTINCT c.id, c.name, c.start_date, c.end_date, c.location
              FROM conferences c
              JOIN conference_attendees ca ON c.id = ca.conference_id
              JOIN attendees a ON ca.attendee_id = a.id
              WHERE a.company_id = ?
              ORDER BY c.start_date DESC`,
        args: [params.id],
      }),
      db.execute({
        sql: `SELECT c.id, c.name, c.website, c.company_type,
                     COUNT(DISTINCT a.id) as attendee_count
              FROM companies c
              LEFT JOIN attendees a ON c.id = a.company_id
              WHERE c.parent_company_id = ?
              GROUP BY c.id
              ORDER BY c.name`,
        args: [params.id],
      }),
      company.parent_company_id
        ? db.execute({
            sql: 'SELECT id, name FROM companies WHERE id = ?',
            args: [company.parent_company_id],
          })
        : Promise.resolve({ rows: [] }),
    ]);

    const attendees = attendeesResult.rows.map((r) => ({ ...r }));

    const conferences = confsResult.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      start_date: String(r.start_date),
      end_date: String(r.end_date),
      location: String(r.location),
    }));

    const child_companies = childCompaniesResult.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      website: r.website ? String(r.website) : null,
      company_type: r.company_type ? String(r.company_type) : null,
      attendee_count: Number(r.attendee_count ?? 0),
    }));

    const parent_company = parentResult.rows.length > 0
      ? { id: Number(parentResult.rows[0].id), name: String(parentResult.rows[0].name) }
      : null;

    return NextResponse.json({
      ...company,
      services: parseServices(company.services),
      icp: company.icp ? String(company.icp) : 'False',
      attendees,
      conferences,
      child_companies,
      parent_company,
    });
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
    const { name, website, profit_type, company_type, notes, assigned_user, entity_structure, wse, services, icp } = body;

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
      sql: 'UPDATE companies SET name = ?, website = ?, profit_type = ?, company_type = ?, notes = ?, assigned_user = ?, entity_structure = ?, wse = ?, services = ?, icp = ? WHERE id = ? RETURNING *',
      args: [name, website || null, profit_type || null, company_type || null, notes || null, assigned_user || null, entity_structure || null, wse != null && wse !== '' ? Number(wse) : null, serializeServices(services), icp === 'True' ? 'True' : 'False', params.id],
    });

    return NextResponse.json({
      ...updatedResult.rows[0],
      services: parseServices(updatedResult.rows[0].services),
      icp: updatedResult.rows[0].icp ? String(updatedResult.rows[0].icp) : 'False',
    });
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

    // Unlink attendees from this company, clear child references, then delete the company
    await db.batch(
      [
        { sql: 'UPDATE attendees SET company_id = NULL WHERE company_id = ?', args: [params.id] },
        { sql: 'UPDATE companies SET parent_company_id = NULL WHERE parent_company_id = ?', args: [params.id] },
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
