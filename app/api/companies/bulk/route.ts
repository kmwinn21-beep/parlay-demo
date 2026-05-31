import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getConfigIdByEmail } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const raw = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  const unique = Array.from(new Set(ids));

  if (unique.length === 0) return NextResponse.json({ error: 'ids parameter required' }, { status: 400 });
  if (unique.length > 500) return NextResponse.json({ error: 'Too many IDs — maximum 500' }, { status: 400 });

  try {
    const ph = unique.map(() => '?').join(',');
    const [companyRows, attendeeRows] = await Promise.all([
      db.execute({ sql: `SELECT id, name, company_type, industry FROM companies WHERE id IN (${ph})`, args: unique }),
      db.execute({ sql: `SELECT id, first_name, last_name, title, company_id FROM attendees WHERE company_id IN (${ph})`, args: unique }),
    ]);

    const attendeesByCompany = new Map<number, { id: number; first_name: string; last_name: string; title: string | null }[]>();
    for (const r of attendeeRows.rows) {
      const cid = Number(r.company_id);
      if (!attendeesByCompany.has(cid)) attendeesByCompany.set(cid, []);
      attendeesByCompany.get(cid)!.push({ id: Number(r.id), first_name: String(r.first_name), last_name: String(r.last_name), title: r.title as string | null });
    }

    const companies = companyRows.rows.map(r => ({
      id: Number(r.id),
      name: r.name,
      company_type: r.company_type,
      industry: r.industry,
      attendees: attendeesByCompany.get(Number(r.id)) ?? [],
    }));

    return NextResponse.json({ companies });
  } catch (err) {
    console.error('GET /api/companies/bulk error:', err);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

function parseStatusValues(status: unknown): string[] {
  if (status == null) return [];
  return String(status)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  try {
    const body = await request.json();
    const { ids, fields } = body as {
      ids: number[];
      fields: { status?: string; company_type?: string; profit_type?: string; notes?: string; assigned_user?: string | null };
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 });
    }
    if (!fields || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'fields required' }, { status: 400 });
    }

    // When status is being set, fetch all user-scoped options to strip them from global status
    let cleanStatus: string | null = null;
    let userScopedOptions: { id: number; value: string }[] = [];
    if ('status' in fields) {
      const userScopedResult = await db.execute({
        sql: `SELECT id, value FROM config_options WHERE category = 'status' AND scope = 'user'`,
        args: [],
      });
      userScopedOptions = userScopedResult.rows.map(r => ({ id: Number(r.id), value: String(r.value) }));
      const userScopedValues = new Set(userScopedOptions.map(o => o.value));
      const statuses = parseStatusValues(fields.status);
      cleanStatus = statuses.filter(s => !userScopedValues.has(s)).join('');
    }

    const setClauses: string[] = [];
    const baseArgs: (string | null)[] = [];

    if ('status' in fields) { setClauses.push('status = ?'); baseArgs.push(cleanStatus ?? ''); }
    if ('company_type' in fields) { setClauses.push('company_type = ?'); baseArgs.push(fields.company_type || null); }
    if ('profit_type' in fields) { setClauses.push('profit_type = ?'); baseArgs.push(fields.profit_type || null); }
    if ('notes' in fields) { setClauses.push('notes = ?'); baseArgs.push(fields.notes || null); }
    if ('assigned_user' in fields) { setClauses.push('assigned_user = ?'); baseArgs.push(fields.assigned_user || null); }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    const placeholders = ids.map(() => '?').join(', ');
    await db.execute({
      sql: `UPDATE companies SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id IN (${placeholders})`,
      args: [...baseArgs, ...ids],
    });

    // Cascade assigned_user to all child companies of the updated parents
    if ('assigned_user' in fields) {
      await db.execute({
        sql: `UPDATE companies SET assigned_user = ? WHERE parent_company_id IN (${placeholders})`,
        args: [fields.assigned_user || null, ...ids],
      });
    }

    if ('status' in fields) {
      const markerConfigId = await getConfigIdByEmail(user.email, db);
      if (markerConfigId != null && userScopedOptions.length > 0) {
        const statuses = parseStatusValues(fields.status);
        const statusValues = new Set(statuses);

        for (const companyId of ids) {
          for (const opt of userScopedOptions) {
            if (statusValues.has(opt.value)) {
              await db.execute({
                sql: `INSERT OR IGNORE INTO company_user_statuses (company_id, status_option_id, marked_by_config_id)
                      VALUES (?, ?, ?)`,
                args: [companyId, opt.id, markerConfigId],
              });
            } else {
              await db.execute({
                sql: `DELETE FROM company_user_statuses
                      WHERE company_id = ? AND status_option_id = ? AND marked_by_config_id = ?`,
                args: [companyId, opt.id, markerConfigId],
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error) {
    console.error('PATCH /api/companies/bulk error:', error);
    return NextResponse.json({ error: 'Failed to bulk update companies' }, { status: 500 });
  }
}
