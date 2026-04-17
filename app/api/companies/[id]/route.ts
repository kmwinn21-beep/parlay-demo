import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, parseNotifIds, resolveUserIds, createNotifications } from '@/lib/notifications';

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
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
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

    const [attendeesResult, confsResult, childCompaniesResult, parentResult, relatedResult] = await Promise.all([
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
      db.execute({
        sql: `SELECT c.id, c.name, c.company_type
              FROM companies c
              INNER JOIN company_relationships cr
                ON (cr.company_id_1 = c.id AND cr.company_id_2 = ?)
                OR (cr.company_id_2 = c.id AND cr.company_id_1 = ?)
              ORDER BY c.name`,
        args: [params.id, params.id],
      }),
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

    const related_companies = relatedResult.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      company_type: r.company_type ? String(r.company_type) : null,
    }));

    return NextResponse.json({
      ...company,
      services: parseServices(company.services),
      icp: company.icp ? String(company.icp) : null,
      attendees,
      conferences,
      child_companies,
      parent_company,
      related_companies,
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
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { name, website, profit_type, company_type, notes, assigned_user, entity_structure, wse, services, icp } = body;

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const existingResult = await db.execute({
      sql: 'SELECT id, name, assigned_user FROM companies WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const prevAssignedUser = existingResult.rows[0].assigned_user as string | null;

    const updatedResult = await db.execute({
      sql: 'UPDATE companies SET name = ?, website = ?, profit_type = ?, company_type = ?, notes = ?, assigned_user = ?, entity_structure = ?, wse = ?, services = ?, icp = ?, updated_at = datetime(\'now\') WHERE id = ? RETURNING *',
      args: [name, website || null, profit_type || null, company_type || null, notes || null, assigned_user || null, entity_structure || null, wse != null && wse !== '' ? Number(wse) : null, serializeServices(services), icp || null, params.id],
    });

    // Cascade assigned_user to all child companies
    if ('assigned_user' in body) {
      await db.execute({
        sql: 'UPDATE companies SET assigned_user = ? WHERE parent_company_id = ?',
        args: [assigned_user || null, params.id],
      });
    }

    // Notify newly added assignees (best-effort)
    if ('assigned_user' in body && assigned_user) {
      const prevIds = new Set(parseNotifIds(prevAssignedUser));
      const newIds = parseNotifIds(assigned_user);
      const addedIds = newIds.filter(id => !prevIds.has(id));
      if (addedIds.length > 0) {
        const changedByConfigId = await getConfigIdByEmail(user.email);
        const userIds = await resolveUserIds(addedIds.join(','), changedByConfigId);
        createNotifications({
          userIds,
          type: 'company',
          recordId: Number(params.id),
          recordName: name,
          message: `You've been assigned as SF Owner for ${name}`,
          changedByEmail: user.email,
          changedByConfigId,
          entityType: 'company',
          entityId: Number(params.id),
        });
      }
    }

    return NextResponse.json({
      ...updatedResult.rows[0],
      services: parseServices(updatedResult.rows[0].services),
      icp: updatedResult.rows[0].icp ? String(updatedResult.rows[0].icp) : null,
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
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const existingResult = await db.execute({
      sql: 'SELECT id FROM companies WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const setClauses: string[] = [];
    const args: (string | number | null)[] = [];

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      setClauses.push('name = ?');
      args.push(name);
    }
    if ('company_type' in body) {
      setClauses.push('company_type = ?');
      args.push(body.company_type || null);
    }
    if ('status' in body) {
      setClauses.push('status = ?');
      args.push(body.status ?? '');
    }
    if ('wse' in body) {
      const wseRaw = body.wse;
      const parsedWse = wseRaw === '' || wseRaw == null ? null : Number(wseRaw);
      if (parsedWse != null && (!Number.isFinite(parsedWse) || parsedWse < 0)) {
        return NextResponse.json({ error: 'wse must be a non-negative number' }, { status: 400 });
      }
      setClauses.push('wse = ?');
      args.push(parsedWse != null ? Math.round(parsedWse) : null);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    args.push(params.id);
    await db.execute({
      sql: `UPDATE companies SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      args,
    });

    if ('status' in body) {
      await db.execute({
        sql: 'UPDATE attendees SET status = ? WHERE company_id = ?',
        args: [body.status ?? '', params.id],
      });
    }

    const result = await db.execute({ sql: 'SELECT * FROM companies WHERE id = ?', args: [params.id] });
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('PATCH /api/companies/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;

    const existingResult = await db.execute({
      sql: 'SELECT id FROM companies WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Unlink attendees from this company, clear child references, remove relationships, then delete the company
    await db.batch(
      [
        { sql: 'UPDATE attendees SET company_id = NULL WHERE company_id = ?', args: [params.id] },
        { sql: 'UPDATE companies SET parent_company_id = NULL WHERE parent_company_id = ?', args: [params.id] },
        { sql: 'DELETE FROM company_relationships WHERE company_id_1 = ? OR company_id_2 = ?', args: [params.id, params.id] },
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
