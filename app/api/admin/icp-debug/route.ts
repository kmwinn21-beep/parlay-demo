import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getIcpConfig, evaluateIcpRules } from '@/lib/icpRules';
import { getConfigOptionValues } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const db = await getDb(auth?.accountId);

  const [icpConfig, icpOptions, rulesRaw, conditionsRaw, settingsRaw, companySample] = await Promise.all([
    getIcpConfig(db),
    getConfigOptionValues('icp', db),
    db.execute({ sql: 'SELECT * FROM icp_rules ORDER BY sort_order, id', args: [] }),
    db.execute({ sql: 'SELECT * FROM icp_rule_conditions ORDER BY rule_id, id', args: [] }),
    db.execute({ sql: "SELECT key, value FROM site_settings WHERE key LIKE 'icp%'", args: [] }),
    db.execute({ sql: 'SELECT id, name, company_type, wse, services, icp FROM companies ORDER BY id DESC LIMIT 10', args: [] }),
  ]);

  const sampleEvals = companySample.rows.map(row => {
    const companyValues = {
      company_type: row.company_type != null ? String(row.company_type) : null,
      wse: row.wse != null ? String(row.wse) : null,
      services: row.services != null ? String(row.services) : null,
      profit_type: null,
      entity_structure: null,
    };
    const computed = evaluateIcpRules(companyValues, icpConfig, icpOptions);
    return {
      id: Number(row.id),
      name: String(row.name),
      company_type: companyValues.company_type,
      wse: companyValues.wse,
      current_icp: row.icp,
      computed_icp: computed,
    };
  });

  return NextResponse.json({
    accountId: auth?.accountId,
    icpConfig,
    icpOptions,
    raw: {
      rules: rulesRaw.rows,
      conditions: conditionsRaw.rows,
      icpSettings: settingsRaw.rows,
    },
    sampleEvals,
  });
}
