import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

interface TouchpointRow {
  attendee_id: number;
  first_name: string;
  last_name: string;
  conference_id: number;
  conference_name: string;
  start_date: string;
  option_id: number;
  value: string;
  color: string | null;
  count: number;
}

// GET /api/companies/[id]/touchpoints
// Returns total + full matrix breakdown for the company's attendees
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  const rows = await db.execute({
    sql: `SELECT at.attendee_id, a.first_name, a.last_name,
                 at.conference_id, c.name as conference_name, c.start_date,
                 at.option_id, co.value, co.color, COUNT(*) as count
          FROM attendee_touchpoints at
          JOIN attendees a ON at.attendee_id = a.id
          JOIN config_options co ON co.id = at.option_id
          JOIN conferences c ON c.id = at.conference_id
          WHERE a.company_id = ?
          GROUP BY at.attendee_id, at.conference_id, at.option_id
          ORDER BY c.start_date ASC, a.last_name, a.first_name`,
    args: [companyId],
  });

  const data = rows.rows as unknown as TouchpointRow[];

  let total = 0;

  // Collect ordered attendees (preserving encounter order)
  const attendeeMap = new Map<number, { id: number; first_name: string; last_name: string }>();
  // Collect ordered conferences
  const confMap = new Map<number, { id: number; name: string; cells: Map<number, { option_id: number; value: string; color: string | null; count: number }[]> }>();

  for (const row of data) {
    total += Number(row.count);

    if (!attendeeMap.has(Number(row.attendee_id))) {
      attendeeMap.set(Number(row.attendee_id), {
        id: Number(row.attendee_id),
        first_name: String(row.first_name),
        last_name: String(row.last_name),
      });
    }

    const cid = Number(row.conference_id);
    if (!confMap.has(cid)) {
      confMap.set(cid, { id: cid, name: String(row.conference_name), cells: new Map() });
    }
    const conf = confMap.get(cid)!;
    const aid = Number(row.attendee_id);
    if (!conf.cells.has(aid)) conf.cells.set(aid, []);
    conf.cells.get(aid)!.push({
      option_id: Number(row.option_id),
      value: String(row.value),
      color: row.color ? String(row.color) : null,
      count: Number(row.count),
    });
  }

  const attendees = Array.from(attendeeMap.values());
  const conferences = Array.from(confMap.values()).map(conf => ({
    id: conf.id,
    name: conf.name,
    cells: Object.fromEntries(Array.from(conf.cells.entries())),
  }));

  return NextResponse.json({ total, attendees, conferences });
}
