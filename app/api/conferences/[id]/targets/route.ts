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

  const [targetsRes, usersRes, seniorityRes] = await Promise.all([
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
      sql: `SELECT id, value FROM config_options WHERE category = 'user'`,
      args: [],
    }),
    db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'seniority'`,
      args: [],
    }),
  ]);

  const userMap = new Map<number, string>();
  for (const u of usersRes.rows) {
    userMap.set(Number(u.id), String(u.value));
  }

  const seniorityMap = new Map<number, string>();
  for (const s of seniorityRes.rows) {
    seniorityMap.set(Number(s.id), String(s.value));
  }

  function resolveUsers(raw: unknown): string[] {
    if (!raw) return [];
    return String(raw).split(',').map(s => s.trim()).filter(Boolean)
      .map(id => userMap.get(Number(id)) ?? id);
  }

  function resolveSeniority(raw: unknown): string | null {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!isNaN(n) && seniorityMap.has(n)) return seniorityMap.get(n)!;
    return String(raw);
  }

  const targets = targetsRes.rows.map(r => ({
    attendeeId: Number(r.attendee_id),
    firstName: String(r.first_name ?? ''),
    lastName: String(r.last_name ?? ''),
    title: r.title ? String(r.title) : null,
    seniority: resolveSeniority(r.seniority),
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
