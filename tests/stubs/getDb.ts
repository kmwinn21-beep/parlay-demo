/**
 * Stand-in for lib/getDb. Returns whatever role_capabilities JSON the test
 * asked for, and records which account it was asked for so a guard reading the
 * wrong tenant is visible.
 */
export async function getDb(accountId?: string) {
  (globalThis as Record<string, unknown>).__askedFor = accountId ?? null;
  return {
    async execute() {
      if (process.env.STUB_DB_THROWS === '1') throw new Error('no such table');
      const raw = process.env.STUB_STORED ?? '';
      return { rows: raw ? [{ value: raw }] : [] };
    },
  } as never;
}
