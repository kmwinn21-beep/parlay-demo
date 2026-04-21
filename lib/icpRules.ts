import { db, dbReady } from './db';

export interface IcpRuleCondition {
  id?: number;
  rule_id?: number;
  option_value: string;
  operator: 'AND' | 'OR';
}

export interface IcpRule {
  id: number;
  category: string;
  sort_order: number;
  conditions: IcpRuleCondition[];
}

export type IcpUnitTypeOperator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';

export interface IcpUnitTypeReq {
  operator: IcpUnitTypeOperator | null;
  value1: number | null;
  value2: number | null; // upper bound for 'between'
}

export interface IcpConfig {
  rules: IcpRule[];
  unitTypeReq: IcpUnitTypeReq;
}

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

  const unitTypeReq: IcpUnitTypeReq = {
    operator: (s['icp_unit_type_operator'] as IcpUnitTypeOperator) || null,
    value1: s['icp_unit_type_value1'] ? Number(s['icp_unit_type_value1']) : null,
    value2: s['icp_unit_type_value2'] ? Number(s['icp_unit_type_value2']) : null,
  };

  return { rules, unitTypeReq };
}

/**
 * Evaluates whether a company meets all configured ICP criteria.
 *
 * companyValues keys match category keys ('company_type', 'services', etc.).
 * Multi-valued fields (services) should be comma-separated.
 * Include 'wse' as a string number for the unit type requirement.
 *
 * Returns icpOptions[0] ('Yes') when all rules pass, icpOptions[1] ('No') otherwise.
 * Returns 'No' when no rules are configured.
 */
export function evaluateIcpRules(
  companyValues: Record<string, string | null | undefined>,
  config: IcpConfig,
  icpOptions: string[] = ['Yes', 'No'],
): string {
  const trueValue = icpOptions[0] ?? 'Yes';
  const falseValue = icpOptions[1] ?? 'No';

  const { rules, unitTypeReq } = config;
  const hasUnitTypeRule = unitTypeReq.operator != null;
  if (rules.length === 0 && !hasUnitTypeRule) return falseValue;

  // Unit type numeric comparison
  if (hasUnitTypeRule && unitTypeReq.operator) {
    const raw = companyValues['wse'];
    const wse = raw != null && raw !== '' ? Number(raw) : null;
    if (wse == null || isNaN(wse)) return falseValue;

    const v1 = unitTypeReq.value1;
    const v2 = unitTypeReq.value2;
    switch (unitTypeReq.operator) {
      case 'eq':      if (v1 != null && wse !== v1) return falseValue; break;
      case 'gt':      if (v1 != null && wse <= v1) return falseValue; break;
      case 'lt':      if (v1 != null && wse >= v1) return falseValue; break;
      case 'gte':     if (v1 != null && wse < v1) return falseValue; break;
      case 'lte':     if (v1 != null && wse > v1) return falseValue; break;
      case 'between':
        if (v1 != null && wse < v1) return falseValue;
        if (v2 != null && wse > v2) return falseValue;
        break;
    }
  }

  // Category-based rules — every rule must pass
  for (const rule of rules) {
    const raw = companyValues[rule.category] ?? '';
    const fieldValues = new Set(String(raw).split(',').map(s => s.trim()).filter(Boolean));

    const andConds = rule.conditions.filter(c => c.operator === 'AND');
    const orConds = rule.conditions.filter(c => c.operator === 'OR');

    if (andConds.length === 0 && orConds.length === 0) return falseValue;
    if (andConds.length > 0 && !andConds.every(c => fieldValues.has(c.option_value))) return falseValue;
    if (orConds.length > 0 && !orConds.some(c => fieldValues.has(c.option_value))) return falseValue;
  }

  return trueValue;
}
