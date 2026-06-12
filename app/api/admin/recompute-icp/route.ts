import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getIcpConfig, evaluateIcpRules } from '@/lib/icpRules';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  if (authResult.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = await getDb(authResult?.accountId);

  const [icpConfig, icpOptionsResult, companiesResult] = await Promise.all([
    getIcpConfig(db),
    db.execute({ sql: "SELECT value FROM config_options WHERE category = 'icp' ORDER BY sort_order, value", args: [] }),
    db.execute({
      sql: 'SELECT id, company_type, wse, services, profit_type, entity_structure FROM companies',
      args: [],
    }),
  ]);

  const icpOptions = icpOptionsResult.rows.map(r => String(r.value));

  let updated = 0;
  let yesCount = 0;
  const sampleEvals: Array<{ id: number; company_type: string | null; wse: string | null; icp: string }> = [];
  for (const row of companiesResult.rows) {
    const companyValues = {
      company_type: row.company_type != null ? String(row.company_type) : null,
      services: row.services != null ? String(row.services) : null,
      wse: row.wse != null ? String(row.wse) : null,
      profit_type: row.profit_type != null ? String(row.profit_type) : null,
      entity_structure: row.entity_structure != null ? String(row.entity_structure) : null,
    };
    const newIcp = evaluateIcpRules(companyValues, icpConfig, icpOptions);
    await db.execute({
      sql: 'UPDATE companies SET icp = ?, updated_at = datetime(\'now\') WHERE id = ?',
      args: [newIcp, Number(row.id)],
    });
    updated++;
    if (newIcp === (icpOptions[0] ?? 'Yes')) yesCount++;
    if (sampleEvals.length < 5) {
      sampleEvals.push({ id: Number(row.id), company_type: companyValues.company_type, wse: companyValues.wse, icp: newIcp });
    }
  }

  return NextResponse.json({
    ok: true,
    updated,
    yesCount,
    icpConfig: { rulesCount: icpConfig.rules.length, unitTypeReq: icpConfig.unitTypeReq },
    icpOptions,
    sampleEvals,
  });
}
