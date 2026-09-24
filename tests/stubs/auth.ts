/**
 * Stand-in for lib/auth, so requireCapability can be run for real in a test.
 *
 * Only getSessionUser is faked — resolveCapabilities and the types come from
 * the real auth-shared, because they are the thing under test. The session is
 * described by env vars so the child process can be pointed at any role.
 */
export * from '@/lib/auth-shared';

export async function getSessionUser() {
  if (process.env.STUB_NO_SESSION === '1') return null;
  return {
    id: 1,
    email: 'rep@example.com',
    role: (process.env.STUB_ROLE ?? 'sales_rep') as never,
    emailVerified: true,
    accountId: process.env.STUB_ACCOUNT || undefined,
  };
}
