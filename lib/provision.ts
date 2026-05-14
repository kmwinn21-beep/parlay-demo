import { db, dbReady, seedFreshDb } from '@/lib/db';
import { createTenantDb } from '@/lib/tenantDb';

export function generateSlug(companyName: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 50); // leave room for numeric suffix
  return slug || 'tenant';
}

async function createTursoDatabase(dbName: string): Promise<string> {
  const org = process.env.TURSO_ORG!;
  const token = process.env.TURSO_PLATFORM_TOKEN!;
  const res = await fetch(`https://api.turso.tech/v1/organizations/${org}/databases`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: dbName, group: 'default' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw Object.assign(new Error(`Turso create DB failed: ${body.error ?? res.status}`), { status: res.status });
  }
  const data = await res.json() as { database: { Hostname: string } };
  return data.database.Hostname;
}

async function getTursoAuthToken(dbName: string): Promise<string> {
  const org = process.env.TURSO_ORG!;
  const token = process.env.TURSO_PLATFORM_TOKEN!;
  const res = await fetch(
    `https://api.turso.tech/v1/organizations/${org}/databases/${dbName}/auth/tokens?expiration=never`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Turso auth token failed: ${res.status}`);
  const data = await res.json() as { jwt: string };
  return data.jwt;
}

interface TenantParams {
  accountId: string;
  companyName: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  trialExpiresAt: string;
  gracePeriodEndsAt: string;
  onboardingTrack: string;
  surveyFields: Record<string, string>;
}

async function seedTenantDb(
  tursoDbUrl: string,
  tursoAuthToken: string,
  params: TenantParams,
): Promise<void> {
  const client = createTenantDb(tursoDbUrl, tursoAuthToken);
  await seedFreshDb(client);

  // Seed the admin's full name as a 'user' config_option (drives the Rep Profile dropdown)
  const fullName = `${params.firstName} ${params.lastName}`.trim();
  const userOptionResult = await client.execute({
    sql: `INSERT INTO config_options (category, value, sort_order) VALUES ('user', ?, 1) RETURNING id`,
    args: [fullName],
  });
  const userConfigId = userOptionResult.rows[0]?.id ? Number(userOptionResult.rows[0].id) : null;

  // Insert the admin user and link their config_id to the user config_option just created
  await client.execute({
    sql: `INSERT INTO users (email, password_hash, role, email_verified, active, first_name, last_name, config_id)
          VALUES (?, ?, 'administrator', 1, 1, ?, ?, ?)`,
    args: [params.email, params.passwordHash, params.firstName, params.lastName, userConfigId],
  });

  // Seed site_settings with account-specific values
  const settings: Array<[string, string]> = [
    ['app_name', params.companyName],
    ['plan_id', 'trial'],
    ['trial_expires_at', params.trialExpiresAt],
    ['grace_period_ends_at', params.gracePeriodEndsAt],
    ['onboarding_track', params.onboardingTrack],
    ['onboarding_completed', 'false'],
    ...Object.entries(params.surveyFields).filter(([, v]) => !!v),
  ];
  await Promise.all(settings.map(([key, value]) =>
    client.execute({
      sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)`,
      args: [key, value],
    }).catch(() => {})
  ));

  // ── Provisioning verification checks ──────────────────────────────────────
  // Verify erroneous "Prospect Company Type" entry is absent
  try {
    const companyTypes = await client.execute({
      sql: "SELECT display_name FROM config_options WHERE category = 'company_type' ORDER BY value",
      args: [],
    });
    const hasProspectCompanyType = companyTypes.rows.some(
      r => String(r.display_name ?? '') === 'Prospect Company Type'
    );
    // Also check the value column (the actual display field)
    const companyTypeValues = await client.execute({
      sql: "SELECT value FROM config_options WHERE category = 'company_type' ORDER BY value",
      args: [],
    });
    const hasProspectCompanyTypeValue = companyTypeValues.rows.some(
      r => String(r.value ?? '') === 'Prospect Company Type'
    );
    if (hasProspectCompanyType || hasProspectCompanyTypeValue) {
      console.error('[provision] SEED ERROR: "Prospect Company Type" found in new tenant DB — should have been removed');
    } else {
      console.log('[provision] Verified: "Prospect Company Type" not present in new tenant DB');
    }
  } catch (e) {
    console.warn('[provision] Could not verify company types:', e);
  }

  // Verify Yes/No ICP types are seeded with is_system=1
  try {
    const icpTypes = await client.execute({
      sql: "SELECT value, is_system FROM config_options WHERE category = 'icp' AND value IN ('Yes', 'No')",
      args: [],
    });
    console.log('[provision] ICP system types seeded:', icpTypes.rows.map(r => ({ value: r.value, is_system: r.is_system })));
    if (icpTypes.rows.length < 2) {
      console.error('[provision] SEED ERROR: Yes/No ICP types not fully seeded — expected 2 rows, got', icpTypes.rows.length);
    }
  } catch (e) {
    console.warn('[provision] Could not verify ICP types:', e);
  }

  // Ensure Competitor is seeded as a system-locked company type
  try {
    await client.execute({
      sql: `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color)
            VALUES ('company_type', 'Competitor', 999, 1, '#dc2626')`,
      args: [],
    });
  } catch (e) {
    console.warn('[provision] Could not seed Competitor company type:', e);
  }

  const conferenceCount = await client.execute('SELECT COUNT(*) as count FROM conferences');
  const count = Number(conferenceCount.rows[0]?.count ?? 0);
  if (count > 0) {
    console.error('[provision] CRITICAL: New tenant database contains conferences after seeding. This should be zero.', {
      tursoDbUrl,
      count,
    });
  } else {
    console.log('[provision] Verified: New tenant database is empty of conferences', { tursoDbUrl });
  }
}

export async function provisionAccount(params: TenantParams): Promise<{
  tursoDbUrl: string;
  tursoAuthToken: string;
  deploymentUrl: string;
  slug: string;
}> {
  const slug = generateSlug(params.companyName);

  // Try to create DB, appending numeric suffix on name collisions (409)
  let dbName = `parlay-${slug}`;
  let hostname: string | null = null;
  for (let attempt = 0; attempt <= 9; attempt++) {
    const candidateName = attempt === 0 ? dbName : `parlay-${slug}${attempt + 1}`;
    try {
      hostname = await createTursoDatabase(candidateName);
      dbName = candidateName;
      break;
    } catch (err) {
      const e = err as { status?: number };
      if (e.status === 409 && attempt < 9) continue;
      throw err;
    }
  }
  if (!hostname) throw new Error('Failed to create Turso database after retries');

  const tursoAuthToken = await getTursoAuthToken(dbName);
  const tursoDbUrl = `libsql://${hostname}`;

  await seedTenantDb(tursoDbUrl, tursoAuthToken, params);

  const deploymentUrl = `https://${slug}.useparlay.app`;

  // Store credentials on the accounts row in master DB
  await dbReady;
  await db.execute({
    sql: `UPDATE accounts SET turso_db_url = ?, turso_auth_token = ?, deployment_url = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [tursoDbUrl, tursoAuthToken, deploymentUrl, params.accountId],
  });

  return { tursoDbUrl, tursoAuthToken, deploymentUrl, slug };
}
