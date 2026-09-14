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

/**
 * The company types that Admin > ICP Parameters names, if it names any.
 *
 * Read from the icp_rules row whose category is 'company_type' — the same
 * source the Companies table and the social-events RSVP filter already use, so
 * "an ICP company type" means one thing across the app.
 *
 * ── What it is for ───────────────────────────────────────────────────────────
 *
 * Rep assignment on upload has a last-resort tier: a company with no rep in
 * the file and no match in the master account list is handed to whoever owns
 * the territory covering its HQ state. On a conference list that reaches
 * everybody — lenders, law firms, product vendors — and fills the assigned-rep
 * column with accounts nobody is working. Gating that tier on these types
 * keeps it to the companies the account actually sells to.
 *
 * An empty result means the question was never configured, and callers treat
 * that as "no opinion" rather than "nothing qualifies" — an account that has
 * not set up ICP keeps the behaviour it had.
 */
export function icpCompanyTypes(config: IcpConfig): string[] {
  const rule = config.rules.find(r => r.category === 'company_type');
  if (!rule) return [];
  return rule.conditions.map(c => c.option_value).filter(Boolean);
}

/**
 * Whether the territory tier may assign a rep to a company of this type.
 *
 * Deliberately permissive in one direction and strict in the other: with no
 * ICP types configured everything passes, and with them configured a company
 * whose type is blank or unrecognised does NOT — an unknown type is exactly
 * the case this is meant to keep out of the rep column.
 *
 * Only the territory tier consults this. A master-account domain or name match
 * is an explicit statement that the account cares about that company, whatever
 * its type, and is left alone.
 */
export function territoryFallbackAllowed(
  companyType: string | null | undefined,
  icpTypes: readonly string[],
): boolean {
  if (icpTypes.length === 0) return true;
  const t = (companyType ?? '').trim();
  if (!t) return false;
  // A company can carry several comma-separated types; any ICP one qualifies.
  const own = t.split(',').map(s => s.trim()).filter(Boolean);
  return own.some(x => icpTypes.some(i => i.toLowerCase() === x.toLowerCase()));
}
