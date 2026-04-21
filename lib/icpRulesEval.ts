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
  connector?: 'AND' | 'OR';
}

export interface IcpConfig {
  rules: IcpRule[];
  unitTypeReq: IcpUnitTypeReq;
}

function checkWse(companyValues: Record<string, string | null | undefined>, unitTypeReq: IcpUnitTypeReq): boolean {
  if (!unitTypeReq.operator) return true;
  const raw = companyValues['wse'];
  const wse = raw != null && raw !== '' ? Number(raw) : null;
  if (wse == null || isNaN(wse)) return false;
  const v1 = unitTypeReq.value1;
  const v2 = unitTypeReq.value2;
  switch (unitTypeReq.operator) {
    case 'eq':      return v1 == null || wse === v1;
    case 'gt':      return v1 == null || wse > v1;
    case 'lt':      return v1 == null || wse < v1;
    case 'gte':     return v1 == null || wse >= v1;
    case 'lte':     return v1 == null || wse <= v1;
    case 'between':
      if (v1 != null && wse < v1) return false;
      if (v2 != null && wse > v2) return false;
      return true;
  }
}

function checkRules(companyValues: Record<string, string | null | undefined>, rules: IcpRule[]): boolean {
  for (const rule of rules) {
    const raw = companyValues[rule.category] ?? '';
    const fieldValues = new Set(String(raw).split(',').map(s => s.trim()).filter(Boolean));
    const andConds = rule.conditions.filter(c => c.operator === 'AND');
    const orConds = rule.conditions.filter(c => c.operator === 'OR');
    if (andConds.length === 0 && orConds.length === 0) return false;
    if (andConds.length > 0 && !andConds.every(c => fieldValues.has(c.option_value))) return false;
    if (orConds.length > 0 && !orConds.some(c => fieldValues.has(c.option_value))) return false;
  }
  return true;
}

export function evaluateIcpRules(
  companyValues: Record<string, string | null | undefined>,
  config: IcpConfig,
  icpOptions: string[] = ['Yes', 'No'],
): string {
  const trueValue = icpOptions[0] ?? 'Yes';
  const falseValue = icpOptions[1] ?? 'No';

  const { rules, unitTypeReq } = config;
  const hasWse = unitTypeReq.operator != null;
  const hasRules = rules.length > 0;

  if (!hasWse && !hasRules) return falseValue;

  // Connector only matters when both sides are configured
  if (hasWse && hasRules && unitTypeReq.connector === 'OR') {
    return (checkWse(companyValues, unitTypeReq) || checkRules(companyValues, rules)) ? trueValue : falseValue;
  }

  // AND (default): both sides must pass if both configured; otherwise only the configured side matters
  if (hasWse && !checkWse(companyValues, unitTypeReq)) return falseValue;
  if (hasRules && !checkRules(companyValues, rules)) return falseValue;
  return trueValue;
}
