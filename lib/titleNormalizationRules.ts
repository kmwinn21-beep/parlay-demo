import { db, dbReady } from '@/lib/db';
import { buildTitleMetadata, conservativeTitleSimilarity, normalizeTitleKey, type BuyerRoleKey, type TitleMatchConfidence, type TitleMatchMetadata, type TitleNormalizationRuleLike } from '@/lib/titleNormalization';

const SYSTEM_ALIASES: Array<{ aliases: string[]; normalized_title: string; function_value: string; seniority_value: string; buyer_role: BuyerRoleKey }> = [
  { aliases: ['chief people officer', 'cpo', 'chief human resources officer', 'chro'], normalized_title: 'CHRO', function_value: 'HR', seniority_value: 'C-Suite', buyer_role: 'decision_maker' },
  { aliases: ['chief executive officer', 'ceo', 'president'], normalized_title: 'CEO', function_value: 'Operations', seniority_value: 'C-Suite', buyer_role: 'decision_maker' },
  { aliases: ['chief financial officer', 'cfo', 'vp finance', 'vice president finance'], normalized_title: 'CFO', function_value: 'Finance', seniority_value: 'C-Suite', buyer_role: 'decision_maker' },
  { aliases: ['chief operating officer', 'coo', 'vp operations', 'vice president operations'], normalized_title: 'COO', function_value: 'Operations', seniority_value: 'C-Suite', buyer_role: 'decision_maker' },
  { aliases: ['director', 'executive director'], normalized_title: 'Director', function_value: 'Operations', seniority_value: 'Director', buyer_role: 'influencer' },
];

interface ConfigLookup {
  byId: Map<number, string>;
  byValueKey: Map<string, number>;
  options: Array<{ id: number; value: string }>;
}

async function getConfigLookup(category: string): Promise<ConfigLookup> {
  const result = await db.execute({
    sql: 'SELECT id, value FROM config_options WHERE category = ? ORDER BY sort_order, value',
    args: [category],
  });
  const options = result.rows.map(r => ({ id: Number(r.id), value: String(r.value) }));
  return {
    options,
    byId: new Map(options.map(o => [o.id, o.value])),
    byValueKey: new Map(options.map(o => [normalizeTitleKey(o.value), o.id])),
  };
}

function coerceBuyerRole(value: unknown): BuyerRoleKey | null {
  return value === 'decision_maker' || value === 'influencer' || value === 'target_title' || value === 'ignore' ? value : null;
}

function coerceConfidence(value: unknown): TitleMatchConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function rowToRule(row: Record<string, unknown>): TitleNormalizationRuleLike {
  return {
    id: Number(row.id),
    organization_id: row.organization_id == null ? null : Number(row.organization_id),
    raw_title: String(row.raw_title ?? ''),
    normalized_title: String(row.normalized_title ?? ''),
    function_id: row.function_id == null ? null : Number(row.function_id),
    seniority_id: row.seniority_id == null ? null : Number(row.seniority_id),
    buyer_role: coerceBuyerRole(row.buyer_role) ?? 'target_title',
    source: row.source === 'user_confirmed' || row.source === 'system_alias' || row.source === 'fuzzy_match' || row.source === 'imported' ? row.source : 'imported',
    confidence: coerceConfidence(row.confidence),
  };
}

export async function ensureTitleNormalizationSchema(): Promise<void> {
  await dbReady;
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS title_normalization_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER,
      raw_title TEXT NOT NULL,
      raw_title_key TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      function_id INTEGER REFERENCES config_options(id),
      seniority_id INTEGER REFERENCES config_options(id),
      buyer_role TEXT NOT NULL CHECK (buyer_role IN ('decision_maker', 'influencer', 'target_title', 'ignore')),
      source TEXT NOT NULL DEFAULT 'user_confirmed' CHECK (source IN ('user_confirmed', 'system_alias', 'fuzzy_match', 'imported')),
      confidence TEXT NOT NULL DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    args: [],
  });
  await db.execute({ sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_title_norm_scope_raw ON title_normalization_rules(COALESCE(organization_id, 0), raw_title_key)', args: [] }).catch(() => {});
  await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_title_norm_raw_key ON title_normalization_rules(raw_title_key)', args: [] }).catch(() => {});
}

export async function getRuleForTitle(rawTitle: string, organizationId: number | null = null): Promise<TitleNormalizationRuleLike | null> {
  await ensureTitleNormalizationSchema();
  const key = normalizeTitleKey(rawTitle);
  if (!key) return null;
  const result = await db.execute({
    sql: `SELECT * FROM title_normalization_rules
          WHERE raw_title_key = ? AND COALESCE(organization_id, 0) = COALESCE(?, 0)
          ORDER BY CASE source WHEN 'user_confirmed' THEN 0 ELSE 1 END, updated_at DESC
          LIMIT 1`,
    args: [key, organizationId],
  });
  return result.rows[0] ? rowToRule(result.rows[0] as Record<string, unknown>) : null;
}

export async function upsertTitleNormalizationRule(input: {
  organization_id?: number | null;
  raw_title: string;
  normalized_title: string;
  function_id: number;
  seniority_id: number;
  buyer_role: BuyerRoleKey;
  confidence?: TitleMatchConfidence;
  notes?: string | null;
  user_id?: number | null;
}): Promise<TitleNormalizationRuleLike> {
  await ensureTitleNormalizationSchema();
  const rawTitle = input.raw_title.trim();
  const key = normalizeTitleKey(rawTitle);
  if (!rawTitle || !key) throw new Error('raw_title is required');

  const existing = await db.execute({
    sql: `SELECT id FROM title_normalization_rules
          WHERE raw_title_key = ? AND COALESCE(organization_id, 0) = COALESCE(?, 0)
          LIMIT 1`,
    args: [key, input.organization_id ?? null],
  });

  const args = [
    input.normalized_title.trim(),
    input.function_id,
    input.seniority_id,
    input.buyer_role,
    input.confidence ?? 'high',
    input.notes ?? null,
    input.user_id ?? null,
  ];

  let result;
  if (existing.rows[0]) {
    result = await db.execute({
      sql: `UPDATE title_normalization_rules SET
              normalized_title = ?, function_id = ?, seniority_id = ?, buyer_role = ?,
              source = 'user_confirmed', confidence = ?, notes = ?, updated_by = ?, updated_at = datetime('now')
            WHERE id = ?
            RETURNING *`,
      args: [...args, Number(existing.rows[0].id)],
    });
  } else {
    result = await db.execute({
      sql: `INSERT INTO title_normalization_rules
              (organization_id, raw_title, raw_title_key, normalized_title, function_id, seniority_id, buyer_role, source, confidence, notes, created_by, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'user_confirmed', ?, ?, ?, ?, datetime('now'))
            RETURNING *`,
      args: [input.organization_id ?? null, rawTitle, key, input.normalized_title.trim(), input.function_id, input.seniority_id, input.buyer_role, input.confidence ?? 'high', input.notes ?? null, input.user_id ?? null, input.user_id ?? null],
    });
  }
  return rowToRule(result.rows[0] as Record<string, unknown>);
}

async function findConfiguredAlias(rawTitle: string): Promise<TitleMatchMetadata | null> {
  const settings = await db.execute({
    sql: "SELECT key, value FROM site_settings WHERE key IN ('icp_decision_maker_titles', 'icp_influencer_titles')",
    args: [],
  }).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
  const byKey = new Map(settings.rows.map(row => [String(row.key), String(row.value ?? '[]')]));
  const parse = (value: string | undefined): string[] => {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed.map(v => String(v)).filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  const rawKey = normalizeTitleKey(rawTitle);
  const configured = [
    ...parse(byKey.get('icp_decision_maker_titles')).map(title => ({ title, buyerRole: 'decision_maker' as BuyerRoleKey })),
    ...parse(byKey.get('icp_influencer_titles')).map(title => ({ title, buyerRole: 'influencer' as BuyerRoleKey })),
  ].find(candidate => {
    const candidateKey = normalizeTitleKey(candidate.title);
    return candidateKey && (rawKey === candidateKey || rawKey.includes(candidateKey) || candidateKey.includes(rawKey));
  });
  if (!configured) return null;
  return buildTitleMetadata({
    originalTitle: rawTitle,
    normalizedTitle: configured.title,
    buyerRole: configured.buyerRole,
    matchType: 'configured_alias',
    confidence: 'medium',
    source: 'configured_alias',
    suggestedMatch: configured.title,
  });
}

async function findSystemAlias(rawTitle: string): Promise<TitleMatchMetadata | null> {
  const [functions, seniorities] = await Promise.all([getConfigLookup('function'), getConfigLookup('seniority')]);
  const rawKey = normalizeTitleKey(rawTitle);
  const alias = SYSTEM_ALIASES.find(a => a.aliases.some(candidate => rawKey === normalizeTitleKey(candidate) || rawKey.includes(normalizeTitleKey(candidate))));
  if (!alias) return null;
  return buildTitleMetadata({
    originalTitle: rawTitle,
    normalizedTitle: alias.normalized_title,
    functionId: functions.byValueKey.get(normalizeTitleKey(alias.function_value)) ?? null,
    seniorityId: seniorities.byValueKey.get(normalizeTitleKey(alias.seniority_value)) ?? null,
    buyerRole: alias.buyer_role,
    matchType: 'system_alias',
    confidence: 'high',
    source: 'system_alias',
    suggestedMatch: alias.normalized_title,
  });
}

async function exactOrFuzzyFromConfig(rawTitle: string): Promise<TitleMatchMetadata> {
  const [functions, seniorities] = await Promise.all([getConfigLookup('function'), getConfigLookup('seniority')]);
  const rawKey = normalizeTitleKey(rawTitle);
  const seniorityExact = seniorities.options.find(o => rawKey.includes(normalizeTitleKey(o.value)));
  const functionExact = functions.options.find(o => rawKey.includes(normalizeTitleKey(o.value)));
  if (seniorityExact || functionExact) {
    return buildTitleMetadata({
      originalTitle: rawTitle,
      normalizedTitle: rawTitle,
      functionId: functionExact?.id ?? null,
      seniorityId: seniorityExact?.id ?? null,
      buyerRole: seniorityExact || functionExact ? 'target_title' : null,
      matchType: 'exact',
      confidence: seniorityExact && functionExact ? 'high' : 'medium',
      source: 'exact',
    });
  }

  const candidates = SYSTEM_ALIASES.map(a => ({ alias: a, score: Math.max(...a.aliases.map(candidate => conservativeTitleSimilarity(rawTitle, candidate))) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best && best.score >= 0.66) {
    return buildTitleMetadata({
      originalTitle: rawTitle,
      normalizedTitle: best.alias.normalized_title,
      functionId: functions.byValueKey.get(normalizeTitleKey(best.alias.function_value)) ?? null,
      seniorityId: seniorities.byValueKey.get(normalizeTitleKey(best.alias.seniority_value)) ?? null,
      buyerRole: best.alias.buyer_role,
      matchType: 'fuzzy',
      confidence: 'medium',
      source: 'fuzzy_match',
      suggestedMatch: best.alias.normalized_title,
    });
  }

  return buildTitleMetadata({ originalTitle: rawTitle, matchType: 'none', confidence: 'low', source: 'none' });
}

export async function resolveAttendeeTitleMetadata(rawTitle: string | null | undefined, organizationId: number | null = null): Promise<TitleMatchMetadata> {
  await ensureTitleNormalizationSchema();
  const title = String(rawTitle ?? '').trim();
  if (!title) return buildTitleMetadata({ originalTitle: null, matchType: 'none', confidence: 'low', source: 'none' });

  const userRule = await getRuleForTitle(title, organizationId);
  if (userRule && userRule.source === 'user_confirmed') {
    return buildTitleMetadata({
      originalTitle: title,
      normalizedTitle: userRule.normalized_title,
      functionId: userRule.function_id,
      seniorityId: userRule.seniority_id,
      buyerRole: userRule.buyer_role,
      matchType: 'confirmed',
      confidence: 'high',
      source: 'user_confirmed',
      explanation: `${title} was mapped to ${userRule.normalized_title} by your team.`,
    });
  }

  const configuredAlias = await findConfiguredAlias(title);
  if (configuredAlias) return configuredAlias;

  const systemAlias = await findSystemAlias(title);
  if (systemAlias) return systemAlias;

  return exactOrFuzzyFromConfig(title);
}

export async function applyRuleToExactTitle(rule: TitleNormalizationRuleLike): Promise<{ attendeeCount: number; companyCount: number }> {
  const [functions, seniorities] = await Promise.all([getConfigLookup('function'), getConfigLookup('seniority')]);
  const functionValue = rule.function_id ? functions.byId.get(rule.function_id) ?? null : null;
  const seniorityValue = rule.seniority_id ? seniorities.byId.get(rule.seniority_id) ?? null : null;
  const key = normalizeTitleKey(rule.raw_title);
  const attendees = await db.execute({ sql: 'SELECT id, company_id, title FROM attendees WHERE title IS NOT NULL', args: [] });
  const matching = attendees.rows.filter(r => normalizeTitleKey(String(r.title ?? '')) === key);
  for (const row of matching) {
    await db.execute({
      sql: 'UPDATE attendees SET seniority = COALESCE(?, seniority), "function" = COALESCE(?, "function"), updated_at = datetime(\'now\') WHERE id = ?',
      args: [seniorityValue, functionValue, Number(row.id)],
    });
  }
  const companyIds = new Set(matching.map(r => r.company_id == null ? null : Number(r.company_id)).filter((v): v is number => v != null));
  for (const companyId of Array.from(companyIds)) {
    await db.execute({ sql: 'UPDATE companies SET updated_at = datetime(\'now\') WHERE id = ?', args: [companyId] }).catch(() => {});
  }
  return { attendeeCount: matching.length, companyCount: companyIds.size };
}
