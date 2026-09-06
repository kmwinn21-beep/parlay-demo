/**
 * The administrator check the Slack install flow uses.
 *
 * `requireAdmin` and `requireAuth` both promote every authenticated caller to
 * administrator when NEXT_PUBLIC_DEMO_MODE is on. That is fine for the screens
 * it was written for — middleware fakes the writes, so an elevated demo user
 * changes nothing real.
 *
 * Installing a Slack workspace is not one of those. It redirects to Slack,
 * consumes a real authorization code and stores a real credential against a
 * real account; middleware cannot fake any of that. So this asks the session
 * what role it actually carries, with no demo branch, and the Slack routes use
 * it instead.
 */

import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth-shared';

export type RealAdminRefusal = 'unauthenticated' | 'not-admin' | 'no-account';

/**
 * The session user when they are genuinely an administrator of an account,
 * otherwise why not.
 *
 * `accountId` is required as well as the role: a session with no account has no
 * workspace to install into, and the install would otherwise fall through to
 * the master database.
 */
export async function requireRealAdmin(
  request: NextRequest,
): Promise<{ user: SessionUser & { accountId: string } } | { refusal: RealAdminRefusal }> {
  const user = await getSessionUser(request);
  if (!user) return { refusal: 'unauthenticated' };
  // Deliberately not requireAdmin: that answers "administrator, or is this
  // demo mode?", and this side effect is real in either.
  if (user.role !== 'administrator') return { refusal: 'not-admin' };
  if (!user.accountId) return { refusal: 'no-account' };
  return { user: { ...user, accountId: user.accountId } };
}
