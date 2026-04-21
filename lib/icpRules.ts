import { db, dbReady } from './db';
export type { IcpRuleCondition, IcpRule, IcpUnitTypeOperator, IcpUnitTypeReq, IcpConfig } from './icpRulesEval';
export { evaluateIcpRules } from './icpRulesEval';
import type { IcpRule, IcpRuleCondition, IcpUnitTypeOperator, IcpConfig } from './icpRulesEval';

export async function getIcpConfig(): Promise<IcpConfig> {
  await dbReady;

  const [rulesResult, settingsResult] = await Promise.all([
    db.execute({ sql: 'SELECT id, category, sort_order FROM icp_rules ORDER BY sort_order, id', args: [] }),
    db.execute({
      sql: "SELECT key, value FROM site_settings WHERE key IN ('icp_unit_type_operator','icp_unit_type_value1','icp_unit_type_value2')",
      args: [],
    }),
  ]);

  let rules: IcpRule[] = [];
  if (rulesResult.rows.length > 0) {
    const ruleIds = rulesResult.rows.map(r => Number(r.id));
    const placeholders = ruleIds.map(() => '?').join(',');
    const condResult = await db.execute({
      sql: `SELECT id, rule_id, option_value, operator FROM icp_rule_conditions WHERE rule_id IN (${placeholders}) ORDER BY id`,
      args: ruleIds,
    });

    const condByRule = new Map<number, IcpRuleCondition[]>();
    for (const row of condResult.rows) {
      const rid = Number(row.rule_id);
      if (!condByRule.has(rid)) condByRule.set(rid, []);
      condByRule.get(rid)!.push({
        id: Number(row.id),
        rule_id: rid,
        option_value: String(row.option_value),
        operator: String(row.operator) as 'AND' | 'OR',
      });
    }

    rules = rulesResult.rows.map(r => ({
      id: Number(r.id),
      category: String(r.category),
      sort_order: Number(r.sort_order),
      conditions: condByRule.get(Number(r.id)) ?? [],
    }));
  }

  const s: Record<string, string> = {};
  for (const row of settingsResult.rows) s[String(row.key)] = String(row.value);

  const unitTypeReq = {
    operator: (s['icp_unit_type_operator'] as IcpUnitTypeOperator) || null,
    value1: s['icp_unit_type_value1'] ? Number(s['icp_unit_type_value1']) : null,
    value2: s['icp_unit_type_value2'] ? Number(s['icp_unit_type_value2']) : null,
  };

  return { rules, unitTypeReq };
}
