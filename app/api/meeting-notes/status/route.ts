import { NextRequest, NextResponse } from 'next/server';
import { getDbForRequest } from '@/lib/getDb';

export async function GET(req: NextRequest) {
  try {
    const db = await getDbForRequest();
    const ids = String(new URL(req.url).searchParams.get('ids') || '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return NextResponse.json({});
    const placeholders = ids.map(() => '?').join(',');
    const res = await db.execute({ sql: `SELECT meeting_id, notes_text, transcript, summary FROM meeting_notes WHERE meeting_id IN (${placeholders})`, args: ids });
    const out: Record<number, boolean> = {};
    for (const id of ids) out[id] = false;
    for (const r of res.rows as unknown as Array<Record<string, unknown>>) {
      const id = Number(r.meeting_id);
      out[id] = Boolean(r.notes_text || r.transcript || r.summary);
    }
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({}, { status: 500 });
  }
}
