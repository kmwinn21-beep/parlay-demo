/**
 * Stand-in for lib/getDb that opens a REAL SQLite database.
 *
 * The capability stub beside this one answers every query with the same row,
 * which is right for testing a guard and useless for testing a query. A route
 * whose job is to read rows has to be run against rows.
 */
import { createClient } from '@libsql/client';

export async function getDb() {
  return createClient({ url: process.env.STUB_DB_URL ?? '' }) as never;
}
