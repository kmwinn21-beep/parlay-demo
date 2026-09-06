/**
 * The OAuth app credentials the email-outreach connections are made with.
 *
 * Environment only. These were once overridable per account, through a
 * `site_settings` row an admin could write from a settings screen — but the
 * write went to the tenant database and the read came from master, so the
 * override was saved, displayed as saved, and never once used. Every
 * connection has always been made with the values below.
 *
 * That feature is gone rather than repaired: it had never worked, and no
 * account had a row. Reading the environment directly is what production has
 * been doing all along. See TENANT_DB_AUDIT.md.
 */

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

interface MicrosoftCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

export async function getGoogleCredentials(): Promise<GoogleCredentials> {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  };
}

export async function getMicrosoftCredentials(): Promise<MicrosoftCredentials> {
  return {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    // 'common' where unset, which is the multi-tenant endpoint and what the
    // previous lookup fell back to.
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
  };
}
