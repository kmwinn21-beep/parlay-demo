import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function PATCH(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { ids, fields } = body as {
      ids: number[];
      fields: { status?: string; title?: string; company_id?: number | null; notes?: string };
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 });
    }
    if (!fields || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'fields required' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const baseArgs: (string | number | null)[] = [];

    if ('status' in fields) { setClauses.push('status = ?'); baseArgs.push(fields.status || 'Unknown'); }
    if ('title' in fields) { setClauses.push('title = ?'); baseArgs.push(fields.title || null); }
    if ('company_id' in fields) { setClauses.push('company_id = ?'); baseArgs.push(fields.company_id ?? null); }
    if ('notes' in fields) { setClauses.push('notes = ?'); baseArgs.push(fields.notes || null); }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    const placeholders = ids.map(() => '?').join(', ');
    await db.execute({
      sql: `UPDATE attendees SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`,
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

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error) {
    console.error('PATCH /api/attendees/bulk error:', error);
    return NextResponse.json({ error: 'Failed to bulk update attendees' }, { status: 500 });
  }
}
