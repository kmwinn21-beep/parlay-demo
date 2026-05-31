import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { classifySeniority } from '@/lib/parsers';

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
    const result = await db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.company_id, co.name as company_name
            FROM attendees a
            LEFT JOIN companies co ON a.company_id = co.id
            WHERE a.id IN (${unique.map(() => '?').join(',')})`,
      args: unique,
    });
    return NextResponse.json({ attendees: result.rows.map(r => ({ ...r })) });
  } catch (err) {
    console.error('GET /api/attendees/bulk error:', err);
    return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const body = await request.json();
    const { ids, fields } = body as {
      ids: number[];
      fields: { status?: string; title?: string; seniority?: string; company_id?: number | null; notes?: string; function?: string | null; consent?: string };
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 });
    }
    if (!fields || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'fields required' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const baseArgs: (string | number | null)[] = [];

    if ('status' in fields) { setClauses.push('status = ?'); baseArgs.push(fields.status ?? ''); }
    if ('title' in fields) { setClauses.push('title = ?'); baseArgs.push(fields.title || null); }
    if ('seniority' in fields) { setClauses.push('seniority = ?'); baseArgs.push(fields.seniority || null); }
    if ('function' in fields) { setClauses.push('function = ?'); baseArgs.push(fields.function || null); }
    if ('company_id' in fields) { setClauses.push('company_id = ?'); baseArgs.push(fields.company_id ?? null); }
    if ('notes' in fields) { setClauses.push('notes = ?'); baseArgs.push(fields.notes || null); }
    if ('consent' in fields) { setClauses.push('consent = ?'); baseArgs.push(fields.consent || 'Consent Not Recorded'); }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    const placeholders = ids.map(() => '?').join(', ');
    await db.execute({
      sql: `UPDATE attendees SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id IN (${placeholders})`,
      args: [...baseArgs, ...ids],
    });

    // If status was changed, propagate to each attendee's company
    if ('status' in fields && fields.status) {
      const attResult = await db.execute({
        sql: `SELECT DISTINCT company_id FROM attendees WHERE id IN (${placeholders}) AND company_id IS NOT NULL`,
        args: ids,
      });
      for (const row of attResult.rows) {
        if (row.company_id) {
          await db.execute({
            sql: 'UPDATE companies SET status = ? WHERE id = ?',
            args: [fields.status, row.company_id],
          });
        }
      }
    }

    // Auto-assign products when function or seniority is bulk-changed
    if ('function' in fields || 'seniority' in fields) {
      const [priorityRow, mappingRow, attendeeRows] = await Promise.all([
        db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'icp_seniority_priority'", args: [] }),
        db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'icp_function_product_mapping'", args: [] }),
        db.execute({ sql: `SELECT id, seniority, title, "function", products, company_id FROM attendees WHERE id IN (${placeholders})`, args: ids }),
      ]);
      const priorityMap: Record<string, string> = (() => { try { return JSON.parse(String(priorityRow.rows[0]?.value ?? '{}')); } catch { return {}; } })();
      const fnProdMap: Record<string, string[]> = (() => { try { return JSON.parse(String(mappingRow.rows[0]?.value ?? '{}')); } catch { return {}; } })();

      for (const att of attendeeRows.rows) {
        const effectiveSen = String(fields.seniority ?? att.seniority ?? '');
        const effectiveTitle = String(att.title ?? '');
        const effectiveFn = String(fields.function ?? att.function ?? '');
        const currentProducts = String(att.products ?? '');
        if (!effectiveFn) continue;

        const seniorityFromTitle = !effectiveSen ? classifySeniority(effectiveTitle) : effectiveSen;
        const priority = priorityMap[seniorityFromTitle];
        if (priority !== 'High' && priority !== 'Medium') continue;

        const fns = effectiveFn.split(',').map(s => s.trim()).filter(Boolean);
        const autoProds = new Set<string>();
        for (const fn of fns) {
          (fnProdMap[fn] ?? []).forEach(p => autoProds.add(p));
        }
        if (autoProds.size === 0) continue;

        const existing = currentProducts.split(',').map(s => s.trim()).filter(Boolean);
        const merged = new Set([...existing, ...Array.from(autoProds)]);
        const mergedStr = Array.from(merged).join(',');
        if (mergedStr === currentProducts) continue;

        await db.execute({ sql: 'UPDATE attendees SET products = ? WHERE id = ?', args: [mergedStr, att.id] });

        if (att.company_id) {
          const coRow = await db.execute({ sql: 'SELECT products FROM companies WHERE id = ?', args: [att.company_id] });
          const coProd = String(coRow.rows[0]?.products ?? '').split(',').map(s => s.trim()).filter(Boolean);
          const coMerged = new Set([...coProd, ...Array.from(autoProds)]);
          await db.execute({ sql: 'UPDATE companies SET products = ? WHERE id = ?', args: [Array.from(coMerged).join(','), att.company_id] });
        }
      }
    }

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error) {
    console.error('PATCH /api/attendees/bulk error:', error);
    return NextResponse.json({ error: 'Failed to bulk update attendees' }, { status: 500 });
  }
}
