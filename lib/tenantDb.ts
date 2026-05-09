import { createClient, type Client } from '@libsql/client';

export function createTenantDb(tursoDbUrl: string, tursoAuthToken: string): Client {
  return createClient({ url: tursoDbUrl, authToken: tursoAuthToken });
}
