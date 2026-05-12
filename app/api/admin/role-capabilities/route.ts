import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, DEFAULT_ROLE_CAPABILITIES, resolveCapabilities, VALID_ROLES, LOCKED_ADMIN_CAPS, type UserRole, type RoleCapabilities } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

async function getRawJson(dbClient: Awaited<ReturnType<typeof getDb>>): Promise<string | null> {
  const row = await dbClient.execute({
    sql: `SELECT value FROM site_settings WHERE key = 'role_capabilities'`,
    args: [],
  });
  return row.rows[0]?.value != null ? String(row.rows[0].value) : null;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const raw = await getRawJson(db);
  let stored: Partial<RoleCapabilities> = {};
  try { stored = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }

  const capabilities: RoleCapabilities = {} as RoleCapabilities;
  for (const role of Object.keys(DEFAULT_ROLE_CAPABILITIES) as UserRole[]) {
    capabilities[role] = resolveCapabilities(role, stored);
  }

  return NextResponse.json(capabilities);
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const body = await request.json() as Partial<RoleCapabilities>;

  // Strip admin-only caps from non-admin roles before saving
  for (const role of Object.keys(body) as UserRole[]) {
    if (!VALID_ROLES.has(role)) continue;
    if (body[role]) {
      for (const cap of LOCKED_ADMIN_CAPS) {
        if (role !== 'administrator') {
          (body[role] as Record<string, boolean>)[cap] = false;
        }
      }
    }
  }

  await db.execute({
    sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('role_capabilities', ?)`,
    args: [JSON.stringify(body)],
  });

  return NextResponse.json({ ok: true });
}
