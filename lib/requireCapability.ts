import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionUser, resolveCapabilities,
  type SessionUser, type UserRole, type CapabilityKey, type RoleCapabilities,
} from '@/lib/auth';
import { getDb } from '@/lib/getDb';

/**
 * The server-side half of the Role Scope matrix.
 *
 * The matrix has always been resolved for the client — /api/auth/me returns it
 * — but of its fifteen capabilities only six were read by any component, and
 * none by any API route. Unticking "Delete or merge companies & attendees" for
 * Sales Rep saved, read back on the next load, and changed nothing at all: the
 * button stayed, and so did the DELETE behind it.
 *
 * A permission control that looks like it works and does not is worse than one
 * that is not there, because it is the one an administrator relies on.
 *
 * Use this in place of requireAuth on any route the matrix claims to govern.
 * It is a superset: no session is still 401, and a session without the
 * capability is 403.
 */

/** Cache of the tenant's stored overrides, so a burst of calls is one read. */
const CACHE_MS = 30_000;
const cache = new Map<string, { stored: Partial<RoleCapabilities>; at: number }>();

/** Drops the cache for one account, or all of them. Called after a save. */
export function invalidateRoleCapabilities(accountId?: string) {
  if (accountId === undefined) cache.clear();
  else cache.delete(accountId || '__default__');
}

async function storedFor(accountId: string | undefined): Promise<Partial<RoleCapabilities>> {
  const key = accountId || '__default__';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.stored;

  const db = await getDb(accountId);
  const row = await db.execute({
    sql: `SELECT value FROM site_settings WHERE key = 'role_capabilities'`,
    args: [],
  // No row and no table both mean "nothing overridden", which resolves to the
  // defaults. Failing closed here would lock every role out of everything on
  // a tenant that has never opened the matrix.
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  let stored: Partial<RoleCapabilities> = {};
  try {
    stored = row.rows[0]?.value ? JSON.parse(String(row.rows[0].value)) : {};
  } catch { /* malformed JSON reads as no overrides */ }

  cache.set(key, { stored, at: Date.now() });
  return stored;
}

/**
 * The session user, if they hold this capability. Otherwise a 401 or 403.
 *
 * Mirrors requireAdmin's demo-mode branch deliberately: in a demo every
 * authenticated visitor is an administrator, and the middleware fakes the
 * writes anyway. Diverging here would make the demo behave unlike the product
 * in exactly the way the demo exists to show.
 */
export async function requireCapability(
  request: NextRequest,
  capability: CapabilityKey,
): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return { ...user, role: 'administrator' as UserRole };
  }

  const stored = await storedFor(user.accountId);
  const caps = resolveCapabilities(user.role, stored);
  if (!caps[capability]) {
    // Named in the body so the client can say which permission is missing
    // rather than "something went wrong".
    return NextResponse.json(
      { error: 'Forbidden: your role does not have this permission.', capability },
      { status: 403 },
    );
  }
  return user;
}
