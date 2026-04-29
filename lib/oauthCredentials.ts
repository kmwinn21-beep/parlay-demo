import { db, dbReady } from './db';

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

interface MicrosoftCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

async function readSettings(keys: string[]): Promise<Record<string, string>> {
  await dbReady;
  const placeholders = keys.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT key, value FROM site_settings WHERE key IN (${placeholders})`,
    args: keys,
  });
  const out: Record<string, string> = {};
  for (const row of result.rows) out[String(row.key)] = String(row.value);
  return out;
}

export async function getGoogleCredentials(): Promise<GoogleCredentials> {
  const s = await readSettings(['oauth_google_client_id', 'oauth_google_client_secret']);
  return {
    clientId: s['oauth_google_client_id'] || process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: s['oauth_google_client_secret'] || process.env.GOOGLE_CLIENT_SECRET || '',
  };
}

export async function getMicrosoftCredentials(): Promise<MicrosoftCredentials> {
  const s = await readSettings(['oauth_microsoft_client_id', 'oauth_microsoft_client_secret', 'oauth_microsoft_tenant_id']);
  return {
    clientId: s['oauth_microsoft_client_id'] || process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: s['oauth_microsoft_client_secret'] || process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: s['oauth_microsoft_tenant_id'] || process.env.MICROSOFT_TENANT_ID || 'common',
  };
}
