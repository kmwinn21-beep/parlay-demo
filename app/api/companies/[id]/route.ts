import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, parseNotifIds, resolveUserIds, createNotifications } from '@/lib/notifications';

function parseStatusValues(status: unknown): string[] {
  if (status == null) return [];
  return String(status)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Sync user-scoped status marks for a company after a PATCH.
 *  For each user-scoped option, inserts or deletes from company_user_statuses
 *  based on whether that option's value appears in statusPayload. */
async function syncUserScopedStatuses(opts: {
  companyId: string;
  actorEmail: string;
  statusPayload: unknown;
}): Promise<void> {
  const markerConfigId = await getConfigIdByEmail(opts.actorEmail);
  if (markerConfigId == null) return;

  const userScopedResult = await db.execute({
    sql: `SELECT id, value FROM config_options WHERE category = 'status' AND scope = 'user'`,
    args: [],
  });
  if (userScopedResult.rows.length === 0) return;

  const statuses = parseStatusValues(opts.statusPayload);
  const statusValues = new Set(statuses);

  for (const row of userScopedResult.rows) {
    const optId = Number(row.id);
    const optValue = String(row.value);
    if (statusValues.has(optValue)) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO company_user_statuses (company_id, status_option_id, marked_by_config_id)
              VALUES (?, ?, ?)`,
        args: [opts.companyId, optId, markerConfigId],
      });
    } else {
      await db.execute({
        sql: `DELETE FROM company_user_statuses
              WHERE company_id = ? AND status_option_id = ? AND marked_by_config_id = ?`,
        args: [opts.companyId, optId, markerConfigId],
      });
    }
  }
}

function getInitials(displayName: string | null, emailFallback: string): string {
  const name = (displayName?.trim() || emailFallback.split('@')[0]).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const user = authResult;
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

    // Fetch all user-scoped status options
    const userScopedOptsResult = await db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'status' AND scope = 'user'`,
      args: [],
    });
    const userScopedOptions = userScopedOptsResult.rows.map(r => ({
      id: Number(r.id),
      value: String(r.value),
    }));
    const userScopedValues = new Set(userScopedOptions.map(o => o.value));

    const [
      attendeesResult,
      confsResult,
      childCompaniesResult,
      parentResult,
      relatedResult,
      statusMarkersResult,
      myStatusIdsResult,
    ] = await Promise.all([
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
      // Who has marked each user-scoped status for this company (for global display)
      db.execute({
        sql: `SELECT cus.status_option_id,
                     COALESCE(u.display_name, uopt.value) as name_or_email
              FROM company_user_statuses cus
              JOIN config_options uopt ON uopt.id = cus.marked_by_config_id
              LEFT JOIN users u ON LOWER(u.email) = LOWER(uopt.value)
              WHERE cus.company_id = ?`,
        args: [params.id],
      }),
      // Which user-scoped statuses the current user has set for this company
      db.execute({
        sql: `SELECT cus.status_option_id
              FROM company_user_statuses cus
              WHERE cus.company_id = ?
                AND cus.marked_by_config_id = (
                  SELECT id FROM config_options
                  WHERE category = 'user' AND LOWER(value) = LOWER(?)
                  LIMIT 1
                )`,
        args: [params.id, user.email],
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

    // Strip all user-scoped status values from the global status string
    const rawStatus = String(company.status || '');
    const cleanStatus = rawStatus.split(',').map(s => s.trim()).filter(s => s && !userScopedValues.has(s)).join(',');

    // status_markers: per user-scoped option, who set it (for global display as "StatusName - KW")
    const statusMarkers: { status_option_id: number; initials: string }[] = statusMarkersResult.rows.map(r => ({
      status_option_id: Number(r.status_option_id),
      initials: getInitials(null, String(r.name_or_email)),
    }));

    // my_user_status_ids: option IDs the current user has set
    const myUserStatusIds = myStatusIdsResult.rows.map(r => Number(r.status_option_id));

    return NextResponse.json({
      ...company,
      status: cleanStatus,
      services: parseServices(company.services),
      icp: company.icp ? String(company.icp) : null,
      my_user_status_ids: myUserStatusIds,
      status_markers: statusMarkers,
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
  const user = authResult;
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

    // Determine clean status (user-scoped options stripped — tracked per-user in company_user_statuses)
    let cleanStatus: string | undefined;
    if ('status' in body) {
      const userScopedOptsResult = await db.execute({
        sql: `SELECT id, value FROM config_options WHERE category = 'status' AND scope = 'user'`,
        args: [],
      });
      const userScopedValues = new Set(userScopedOptsResult.rows.map(r => String(r.value)));
      const statuses = parseStatusValues(body.status);
      const stripped = statuses.filter(s => !userScopedValues.has(s));
      cleanStatus = stripped.join(',');
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
      // Write the user-scoped-stripped status globally
      setClauses.push('status = ?');
      args.push(cleanStatus ?? '');
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
      // Cascade clean status (no user-scoped options) to all attendees
      await db.execute({
        sql: 'UPDATE attendees SET status = ? WHERE company_id = ?',
        args: [cleanStatus ?? '', params.id],
      });

      // Sync user-scoped status marks using the original body.status as signal
      await syncUserScopedStatuses({
        companyId: params.id,
        actorEmail: user.email,
        statusPayload: body.status,
      });
    }

    const [result, myStatusIdsResult] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM companies WHERE id = ?', args: [params.id] }),
      db.execute({
        sql: `SELECT cus.status_option_id
              FROM company_user_statuses cus
              WHERE cus.company_id = ?
                AND cus.marked_by_config_id = (
                  SELECT id FROM config_options
                  WHERE category = 'user' AND LOWER(value) = LOWER(?)
                  LIMIT 1
                )`,
        args: [params.id, user.email],
      }),
    ]);
    return NextResponse.json({
      ...result.rows[0],
      my_user_status_ids: myStatusIdsResult.rows.map(r => Number(r.status_option_id)),
    });
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
