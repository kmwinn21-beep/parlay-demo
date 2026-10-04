/**
 * Stand-in for lib/auth that always lets a request through.
 *
 * For route tests whose subject is the QUERY rather than the guard: the guard
 * has its own test in require-capability.mjs, and a route that cannot get past
 * authentication cannot be asked what it returns.
 */
export * from '@/lib/auth-shared';

export async function getSessionUser() {
  return { id: 1, email: 'rep@example.com', role: 'administrator' as never, emailVerified: true, accountId: 'test' };
}

export async function requireAuth() {
  return { id: 1, email: 'rep@example.com', role: 'administrator' as never, emailVerified: true, accountId: 'test' };
}
