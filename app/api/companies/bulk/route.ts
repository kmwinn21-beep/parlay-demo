import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail } from '@/lib/notifications';

function parseStatusValues(status: unknown): string[] {
  if (status == null) return [];
  return String(status)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function getPriorityStatusOptionId(): Promise<number | null> {
  const result = await db.execute({
    sql: `SELECT id
          FROM config_options
          WHERE category = 'status' AND (status_key = 'priority' OR LOWER(value) = 'priority')
          ORDER BY CASE WHEN status_key = 'priority' THEN 0 ELSE 1 END, id
          LIMIT 1`,
    args: [],
  });
  if (result.rows.length === 0 || result.rows[0].id == null) return null;
  return Number(result.rows[0].id);
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
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

    const setClauses: string[] = [];
    const baseArgs: (string | null)[] = [];

    if ('status' in fields) { setClauses.push('status = ?'); baseArgs.push(fields.status ?? ''); }
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
      const markerConfigId = await getConfigIdByEmail(user.email);
      const priorityOptionId = await getPriorityStatusOptionId();
      if (markerConfigId != null && priorityOptionId != null) {
        const statuses = parseStatusValues(fields.status);
        const statusPh = statuses.map(() => '?').join(',');
        const selectedStatusOptions = statuses.length > 0
          ? await db.execute({
              sql: `SELECT id FROM config_options WHERE category = 'status' AND value IN (${statusPh})`,
              args: statuses,
            })
          : { rows: [] as Array<{ id: number }> };
        const selectedIds = new Set(selectedStatusOptions.rows.map((row) => Number(row.id)));
        const hasPriority = selectedIds.has(priorityOptionId);

        if (hasPriority) {
          for (const companyId of ids) {
            await db.execute({
              sql: `INSERT INTO company_priority_marks (company_id, marked_by_config_id, priority_option_id)
                    VALUES (?, ?, ?)
                    ON CONFLICT(company_id, marked_by_config_id)
                    DO UPDATE SET priority_option_id = excluded.priority_option_id`,
              args: [companyId, markerConfigId, priorityOptionId],
            });
          }
        } else {
          const idPh = ids.map(() => '?').join(',');
          await db.execute({
            sql: `DELETE FROM company_priority_marks
                  WHERE marked_by_config_id = ? AND company_id IN (${idPh})`,
            args: [markerConfigId, ...ids],
          });
        }
      }
    }

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error) {
    console.error('PATCH /api/companies/bulk error:', error);
    return NextResponse.json({ error: 'Failed to bulk update companies' }, { status: 500 });
  }
}
