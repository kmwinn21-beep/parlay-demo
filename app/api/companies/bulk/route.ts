import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
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
      sql: `UPDATE companies SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`,
      args: [...baseArgs, ...ids],
    });

    // Cascade assigned_user to all child companies of the updated parents
    if ('assigned_user' in fields) {
      await db.execute({
        sql: `UPDATE companies SET assigned_user = ? WHERE parent_company_id IN (${placeholders})`,
        args: [fields.assigned_user || null, ...ids],
      });
    }

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error) {
    console.error('PATCH /api/companies/bulk error:', error);
    return NextResponse.json({ error: 'Failed to bulk update companies' }, { status: 500 });
  }
}
