import { createClient, type Client } from '@libsql/client';
import { withRetries } from '@/lib/dbRetry';

export function createTenantDb(tursoDbUrl: string, tursoAuthToken: string): Client {
  // withRetries — see lib/dbRetry.ts. Every tenant client is built here or in
  // lib/getDb.ts, so wrapping both covers the traffic a request can make.
  return withRetries(createClient({ url: tursoDbUrl, authToken: tursoAuthToken }));
}
