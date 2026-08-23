import type { Client } from '@libsql/client';
import { getIcpConfig } from './icpRules';

/**
 * The company types an account counts as its target audience, taken from the
 * ICP Parameters "Company Types" rule in admin settings.
 *
 * This replaces an older scheme where a single config option carried
 * action_key = 'prospect' and everything keyed off that. That key was only ever
 * set by a migration matching the literal value 'Prospect', so an account whose
 * taxonomy used different words had nothing carrying it — and every metric that
 * filtered on it silently read zero against real activity. There was no way to
 * move the key either, so the account couldn't fix it.
 *
 * `configured` is false when the account has no ICP company_type rule. Callers
 * count every company type in that case rather than nothing, and say so in the
 * UI — an obviously broad number the reader can act on beats a confident zero.
 */
export interface IcpCompanyTypes {
  /** config_options ids, as strings, since company_type stores them that way. */
  ids: string[];
  /** The same types by display value, lowercased. */
  values: string[];
  /** False when no ICP company_type rule exists — count everything and warn. */
  configured: boolean;
}

export async function getIcpCompanyTypes(db: Client): Promise<IcpCompanyTypes> {
  const [config, optsRes] = await Promise.all([
    getIcpConfig(db).catch(() => ({ rules: [] as { category: string; conditions: { option_value: string }[] }[] })),
    db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'company_type'`,
      args: [],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
  ]);

  // Every company_type rule, not just the first — the admin UI allows more than one.
  const wanted = new Set(
    config.rules
      .filter(r => r.category === 'company_type')
      .flatMap(r => r.conditions.map(c => String(c.option_value ?? '').trim()))
      .filter(Boolean)
      .map(v => v.toLowerCase()),
  );

  if (wanted.size === 0) return { ids: [], values: [], configured: false };

  // Conditions store the display value; company_type columns hold either the
  // value or the option id depending on when the row was written, so resolve both.
  const ids: string[] = [];
  for (const row of optsRes.rows) {
    const value = String(row.value ?? '').trim().toLowerCase();
    if (value && wanted.has(value)) ids.push(String(row.id));
  }

  return { ids, values: Array.from(wanted), configured: true };
}

/**
 * Whether a company_type cell — a comma-separated list of ids or values —
 * names any of the ICP types. Unconfigured accounts match everything.
 */
export function matchesIcpCompanyType(companyType: string | null | undefined, icp: IcpCompanyTypes): boolean {
  if (!icp.configured) return true;
  const parts = String(companyType ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.some(p => icp.ids.includes(p) || icp.values.includes(p.toLowerCase()));
}

/**
 * The same test as SQL, for queries that can't filter in JS. Returns null when
 * the account is unconfigured, meaning "no restriction" — callers should then
 * omit the clause entirely rather than substituting a false one.
 */
export function icpCompanyTypeSql(column: string, icp: IcpCompanyTypes): { sql: string; args: string[] } | null {
  if (!icp.configured) return null;
  const terms: string[] = [];
  const args: string[] = [];
  for (const id of icp.ids) {
    terms.push(`(',' || COALESCE(${column}, '') || ',') LIKE ?`);
    args.push(`%,${id},%`);
  }
  for (const value of icp.values) {
    terms.push(`LOWER(',' || COALESCE(${column}, '') || ',') LIKE ?`);
    args.push(`%,${value},%`);
  }
  // No resolvable options behind a configured rule: match nothing rather than
  // everything, so a broken rule doesn't quietly widen the numbers.
  if (terms.length === 0) return { sql: '1 = 0', args: [] };
  return { sql: `(${terms.join(' OR ')})`, args };
}
