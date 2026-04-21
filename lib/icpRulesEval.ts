// Client-safe: no DB imports. Contains only types and the pure evaluation function.

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
  value2: number | null;
}

export interface IcpConfig {
  rules: IcpRule[];
  unitTypeReq: IcpUnitTypeReq;
}

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
