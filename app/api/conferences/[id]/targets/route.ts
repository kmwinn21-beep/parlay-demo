import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  const [targetsRes, usersRes] = await Promise.all([
    db.execute({
      sql: `SELECT ct.attendee_id, ct.tier,
                   a.first_name, a.last_name, a.title, a.seniority,
                   c.name as company_name, c.id as company_id,
                   c.assigned_user
            FROM conference_targets ct
            JOIN attendees a ON a.id = ct.attendee_id
            LEFT JOIN companies c ON c.id = a.company_id
            WHERE ct.conference_id = ?
            ORDER BY a.last_name, a.first_name`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT u.id, COALESCE(co.value, u.display_name, CAST(u.id AS TEXT)) as display_name
            FROM users u LEFT JOIN config_options co ON u.config_id = co.id`,
      args: [],
    }),
  ]);

  const userMap = new Map<string, string>();
  for (const u of usersRes.rows) {
    userMap.set(String(u.id), String(u.display_name ?? u.id));
  }

  function resolveUsers(raw: unknown): string[] {
    if (!raw) return [];
    return String(raw).split(',').map(s => s.trim()).filter(Boolean)
      .map(id => userMap.get(id) ?? id);
  }

  const targets = targetsRes.rows.map(r => ({
    attendeeId: Number(r.attendee_id),
    firstName: String(r.first_name ?? ''),
    lastName: String(r.last_name ?? ''),
    title: r.title ? String(r.title) : null,
    seniority: r.seniority ? String(r.seniority) : null,
    companyName: r.company_name ? String(r.company_name) : null,
    companyId: r.company_id ? Number(r.company_id) : null,
    assignedUserNames: resolveUsers(r.assigned_user),
    tier: String(r.tier ?? 'unassigned'),
  }));

  return NextResponse.json(targets);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json() as { attendee_id: number };
  const attendeeId = body.attendee_id;
  if (!attendeeId) return NextResponse.json({ error: 'attendee_id required' }, { status: 400 });

  await dbReady;

  // Check if already a target
  const existing = await db.execute({
    sql: 'SELECT id FROM conference_targets WHERE attendee_id = ? AND conference_id = ?',
    args: [attendeeId, confId],
  });

  if (existing.rows.length > 0) {
    // Remove target
    await db.execute({
      sql: 'DELETE FROM conference_targets WHERE attendee_id = ? AND conference_id = ?',
      args: [attendeeId, confId],
    });
    return NextResponse.json({ action: 'removed' });
  } else {
    // Add target
    await db.execute({
      sql: 'INSERT INTO conference_targets (attendee_id, conference_id, tier) VALUES (?, ?, ?)',
      args: [attendeeId, confId, 'unassigned'],
    });
    return NextResponse.json({ action: 'added' });
  }
}
