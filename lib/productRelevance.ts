// Client-side product relevance engine for badge/card scan.
// NOTE: metadata.functions and metadata.seniority use display-name keys (e.g. "IT", "C-Suite").
// classifyFunction/classifySeniority also return display names. Matching is case-insensitive
// so admin renames don't silently break scoring — if you rename a function option, update
// product metadata.functions keys to match.

import { classifySeniority, classifyFunction } from './parsers';

export interface ProductRelevanceResult {
  productId: number;
  productName: string;
  categoryName: string;
  categoryColor: string | null;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  buyerRole: 'decision_maker' | 'influencer' | 'target_title' | null;
  matchedSignals: string[];
}

interface CachedOption {
  id: number;
  value: string;
  color: string | null;
  category_id: number | null;
  metadata: string | null;
}

interface ProductMeta {
  functions: Record<string, 'high' | 'med' | 'ignore'>;
  seniority: Record<string, 'decision_maker' | 'influencer' | 'target_title'>;
  industries: number[];
  keywords: string[];
  aliases: string;
  active: boolean;
  buying_committee?: { decision_maker: boolean; influencer: boolean; target_title: boolean };
}

// Module-level session cache — invalidated by admin Products & Solutions saves
let _products: CachedOption[] | null = null;
let _categories: CachedOption[] | null = null;

export function invalidateProductCache(): void {
  _products = null;
  _categories = null;
}

async function ensureCache(): Promise<{ products: CachedOption[]; categories: CachedOption[] }> {
  if (!_products || !_categories) {
    const [pr, cr] = await Promise.all([
      fetch('/api/config?category=products'),
      fetch('/api/config?category=product_category'),
    ]);
    _products = pr.ok ? await pr.json() : [];
    _categories = cr.ok ? await cr.json() : [];
  }
  return { products: _products!, categories: _categories! };
}

function parseMeta(raw: string | null | undefined): ProductMeta {
  try {
    if (!raw) throw new Error();
    const p = JSON.parse(raw);
    return {
      functions: p.functions ?? {},
      seniority: p.seniority ?? {},
      industries: Array.isArray(p.industries) ? p.industries : [],
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      aliases: typeof p.aliases === 'string' ? p.aliases : '',
      active: p.active !== false,
    };
  } catch {
    return { functions: {}, seniority: {}, industries: [], keywords: [], aliases: '', active: true };
  }
}

function findVal<T>(rec: Record<string, T>, name: string): T | undefined {
  const lo = name.toLowerCase().trim();
  const k = Object.keys(rec).find(k => k.toLowerCase().trim() === lo);
  return k !== undefined ? rec[k] : undefined;
}

export async function resolveProductRelevance(
  title: string,
  companyIndustryIds?: number[],
): Promise<ProductRelevanceResult[]> {
  if (!title?.trim()) return [];

  const { products, categories } = await ensureCache();
  const catMap = new Map(categories.map(c => [c.id, c]));
  const active = products.filter(p => parseMeta(p.metadata).active !== false);
  if (active.length === 0) return [];

  // Union of all function display-name keys from configured products.
  // Passed to classifyFunction so it knows which options are valid.
  const fnNamesSet: string[] = [];
  const fnNamesSeen = new Set<string>();
  for (const p of active) {
    for (const k of Object.keys(parseMeta(p.metadata).functions)) {
      if (!fnNamesSeen.has(k)) { fnNamesSeen.add(k); fnNamesSet.push(k); }
    }
  }
  const fnNames = fnNamesSet;

  const seniority = classifySeniority(title);      // e.g. "VP/SVP", "C-Suite", "Other"
  const fnMatch = classifyFunction(title, fnNames); // e.g. "IT", null

  const titleLower = title.toLowerCase();
  const scored: ProductRelevanceResult[] = [];

  for (const product of active) {
    const meta = parseMeta(product.metadata);
    const signals: string[] = [];
    let score = 0;

    // Function match — 40 pts
    let fnTier: 'high' | 'med' | 'ignore' | null = null;
    if (fnMatch) {
      fnTier = findVal(meta.functions, fnMatch) ?? null;
      if (fnTier === 'high') { score += 40; signals.push(`${fnMatch} · High`); }
      else if (fnTier === 'med') { score += 20; signals.push(`${fnMatch} · Medium`); }
    }

    // Seniority match — 30 pts
    let buyerRole: 'decision_maker' | 'influencer' | 'target_title' | null = null;
    if (seniority && seniority !== 'Other') {
      const role = findVal(meta.seniority, seniority) ?? null;
      if (role) {
        buyerRole = role;
        score += 30;
        const label = role === 'decision_maker' ? 'Decision Maker' : role === 'influencer' ? 'Influencer' : 'Target Title';
        signals.push(`${seniority} · ${label}`);
      }
    }

    // Industry match — 20 pts
    if (companyIndustryIds?.length && meta.industries.length) {
      if (companyIndustryIds.some(id => meta.industries.includes(id))) {
        score += 20;
        signals.push('Industry match');
      }
    }

    // Keyword / alias match — 10 pts
    const aliases = meta.aliases.split(',').map(s => s.trim()).filter(Boolean);
    const allKw = [...meta.keywords, ...aliases];
    const kw = allKw.find(k => k && titleLower.includes(k.toLowerCase()));
    if (kw) { score += 10; signals.push(`Keyword: ${kw}`); }

    // Exclude: function=ignore with no keyword rescue; score=0 always excluded
    if (fnTier === 'ignore' && !kw) continue;
    if (score === 0) continue;

    const cat = product.category_id ? catMap.get(product.category_id) : null;
    scored.push({
      productId: product.id,
      productName: product.value,
      categoryName: cat?.value ?? 'General',
      categoryColor: cat?.color ?? null,
      score,
      confidence: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
      buyerRole,
      matchedSignals: signals,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  // Show any product scoring ≥ 30 — no minimum count required
  return scored.filter(r => r.score >= 30).slice(0, 5);
}
