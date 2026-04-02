import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function PATCH(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { ids, fields } = body as {
      ids: number[];
      fields: { status?: string; company_type?: string; profit_type?: string; notes?: string };
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 });
    }
    if (!fields || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'fields required' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const baseArgs: (string | null)[] = [];

    if ('status' in fields) { setClauses.push('status = ?'); baseArgs.push(fields.status || 'Unknown'); }
    if ('company_type' in fields) { setClauses.push('company_type = ?'); baseArgs.push(fields.company_type || null); }
    if ('profit_type' in fields) { setClauses.push('profit_type = ?'); baseArgs.push(fields.profit_type || null); }
    if ('notes' in fields) { setClauses.push('notes = ?'); baseArgs.push(fields.notes || null); }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    const placeholders = ids.map(() => '?').join(', ');
    await db.execute({
      sql: `UPDATE companies SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`,
      args: [...baseArgs, ...ids],
    });

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error) {
    console.error('PATCH /api/companies/bulk error:', error);
    return NextResponse.json({ error: 'Failed to bulk update companies' }, { status: 500 });
  }
}
