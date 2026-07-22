import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import type { Client } from '@libsql/client';
import { getInitials } from '@/lib/initials';

type Row = Record<string, unknown>;

export interface AssignedTerritoryUser {
  userId: number;
  displayName: string;
  initials: string;
}

export interface TerritoryResponse {
  id: number;
  name: string;
  stateCodes: string[];
  assignedUserIds: number[];
  assignedUsers: AssignedTerritoryUser[];
  color: string;
  createdAt: string;
}

function parseStringArray(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function parseIdArray(raw: unknown): number[] {
  try {
    const parsed = JSON.parse(String(raw ?? '[]'));
    return Array.isArray(parsed) ? parsed.map(Number).filter(n => !isNaN(n)) : [];
  } catch { return []; }
}

// Assigned reps are config_options rows (category='user') — the same roster
// RepAssignmentPopover and every other assigned-rep feature in the app uses,
// not `users` table logins.
async function resolveAssignedUsers(db: Client, userIds: number[]): Promise<AssignedTerritoryUser[]> {
  if (userIds.length === 0) return [];
  const ph = userIds.map(() => '?').join(',');
  const res = await db.execute({
    sql: `SELECT id, value FROM config_options WHERE category = 'user' AND id IN (${ph})`,
    args: userIds,
  });
  const map = new Map<number, AssignedTerritoryUser>();
  for (const r of res.rows as Row[]) {
    const displayName = String(r.value);
    map.set(Number(r.id), { userId: Number(r.id), displayName, initials: getInitials(displayName) });
  }
  return userIds.map(id => map.get(id)).filter((u): u is AssignedTerritoryUser => u != null);
}

async function toTerritoryResponse(db: Client, row: Row): Promise<TerritoryResponse> {
  const stateCodes = parseStringArray(row.state_codes);
  const assignedUserIds = parseIdArray(row.assigned_user_ids);
  return {
    id: Number(row.id),
    name: String(row.name),
    stateCodes,
    assignedUserIds,
    assignedUsers: await resolveAssignedUsers(db, assignedUserIds),
    color: String(row.color),
    createdAt: String(row.created_at),
  };
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const result = await db.execute({
    sql: `SELECT id, name, state_codes, assigned_user_ids, color, created_at FROM sales_territories ORDER BY created_at ASC`,
    args: [],
  });

  const territories = await Promise.all((result.rows as Row[]).map(r => toTerritoryResponse(db, r)));
  return NextResponse.json({ territories });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const body = await request.json();
  const name = String(body.name ?? '').trim();
  const stateCodes: string[] = Array.isArray(body.stateCodes) ? body.stateCodes.map(String) : [];
  const assignedUserIds: number[] = Array.isArray(body.assignedUserIds) ? body.assignedUserIds.map(Number).filter((n: number) => !isNaN(n)) : [];
  const color = body.color ? String(body.color) : '#185FA5';

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (stateCodes.length === 0) return NextResponse.json({ error: 'stateCodes is required' }, { status: 400 });

  const existingRes = await db.execute({ sql: `SELECT id, name, state_codes FROM sales_territories`, args: [] });
  const conflicts: Array<{ stateCode: string; territoryId: number; territoryName: string }> = [];
  for (const row of existingRes.rows as Row[]) {
    const otherStates = parseStringArray(row.state_codes);
    for (const sc of stateCodes) {
      if (otherStates.includes(sc)) {
        conflicts.push({ stateCode: sc, territoryId: Number(row.id), territoryName: String(row.name) });
      }
    }
  }
  if (conflicts.length > 0) {
    return NextResponse.json({ error: 'state_conflict', conflicts }, { status: 409 });
  }

  const inserted = await db.execute({
    sql: `INSERT INTO sales_territories (name, state_codes, assigned_user_ids, color, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          RETURNING id, name, state_codes, assigned_user_ids, color, created_at`,
    args: [name, JSON.stringify(stateCodes), JSON.stringify(assignedUserIds), color],
  });

  const territory = await toTerritoryResponse(db, inserted.rows[0] as Row);
  return NextResponse.json({ territory }, { status: 201 });
}
