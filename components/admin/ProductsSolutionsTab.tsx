'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { COLOR_PRESETS } from '@/lib/colors';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────

interface ConfigOption {
  id: number;
  category: string;
  value: string;
  sort_order: number;
  color: string | null;
  is_system?: number;
  category_id?: number | null;
  description?: string | null;
  metadata?: string | null;
}

interface ProductMeta {
  functions: Record<string, 'high' | 'med' | 'ignore'>;
  seniority: Record<string, 'decision_maker' | 'influencer' | 'target_title'>;
  industries: number[];
  keywords: string[];
  aliases: string;
  active: boolean;
}

function parseMeta(s: string | null | undefined): ProductMeta {
  try {
    if (!s) throw new Error();
    const p = JSON.parse(s);
    return {
      functions: p.functions ?? {},
      seniority: p.seniority ?? {},
      industries: Array.isArray(p.industries) ? p.industries : [],
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      aliases: p.aliases ?? '',
      active: p.active !== false,
    };
  } catch {
    return { functions: {}, seniority: {}, industries: [], keywords: [], aliases: '', active: true };
  }
}

interface Props {
  products: ConfigOption[];
  categories: ConfigOption[];
  seniorityOptions: ConfigOption[];
  functionOptions: ConfigOption[];
  industryOptions: ConfigOption[];
  onRefresh: () => void;
}

// ── Buyer role colors ──────────────────────────────────────────────────────

const ROLE_COLORS = {
  decision_maker: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300', label: 'Decision maker' },
  influencer:     { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', label: 'Influencer' },
  target_title:   { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', label: 'Target title' },
} as const;

// ── SectionCard ────────────────────────────────────────────────────────────

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

// ── TriToggle ──────────────────────────────────────────────────────────────

function TriToggle<T extends string>({
  options, labels, selected, onSelect, activeColors,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  selected: T | null;
  onSelect: (v: T | null) => void;
  activeColors: Record<T, string>;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
      {options.map(opt => {
        const isActive = selected === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(isActive ? null : opt)}
            className={`px-2.5 py-1 text-xs font-medium border-r last:border-r-0 border-gray-200 transition-colors ${
              isActive ? activeColors[opt] : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            {labels[opt]}
          </button>
        );
      })}
    </div>
  );
}

// ── ScenarioCard ───────────────────────────────────────────────────────────

function ScenarioCard({ label, title, role, confidence, productName }: {
  label: string;
  title: string;
  role: 'decision_maker' | 'influencer' | 'target_title';
  confidence: string;
  productName: string;
}) {
  const rc = ROLE_COLORS[role];
  return (
    <div className="flex-1 min-w-[180px] border border-gray-200 rounded-lg p-3 space-y-1.5 bg-gray-50">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-800">{title}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${rc.bg} ${rc.text} ${rc.border}`}>
          {rc.label}
        </span>
        <span className="text-xs text-gray-500">{confidence} match</span>
      </div>
      <p className="text-xs text-gray-500">→ {productName}</p>
    </div>
  );
}

// ── ScanPreview type ───────────────────────────────────────────────────────

interface ScanScenario {
  title: string;
  role: 'decision_maker' | 'influencer' | 'target_title';
  confidence: string;
}

interface ScanPreview {
  scenarioA: ScanScenario | null;
  scenarioB: ScanScenario | null;
  hasAny: boolean;
}

// ── DetailPanel ────────────────────────────────────────────────────────────

function DetailPanel({
  product, meta, detailName, setDetailName, categories, seniorityOptions, functionOptions,
  industryOptions, scanPreview, deleteError, categoryDropdownOpen,
  setCategoryDropdownOpen, keywordInput, setKeywordInput,
  onSaveValue, onUpdateMeta, onDelete, getProductCategoryColor,
}: {
  product: ConfigOption;
  meta: ProductMeta;
  detailName: string;
  setDetailName: (v: string) => void;
  categories: ConfigOption[];
  seniorityOptions: ConfigOption[];
  functionOptions: ConfigOption[];
  industryOptions: ConfigOption[];
  scanPreview: ScanPreview;
  deleteError: string;
  categoryDropdownOpen: boolean;
  setCategoryDropdownOpen: (v: boolean) => void;
  keywordInput: string;
  setKeywordInput: (v: string) => void;
  onSaveValue: (id: number, value: string, extra?: Record<string, unknown>) => Promise<void>;
  onUpdateMeta: (id: number, updater: (m: ProductMeta) => ProductMeta) => void;
  onDelete: (id: number, value: string) => Promise<void>;
  getProductCategoryColor: (p: ConfigOption) => string | null;
}) {
  const catColor = getProductCategoryColor(product);
  const assignedCategory = categories.find(c => c.id === product.category_id);
  const systemCatLabel = (categories.find(c => c.is_system === 1)?.value) ?? 'General';
  const catDropRef = useRef<HTMLDivElement>(null);

  // Controlled aliases input — reset whenever product changes to avoid stale defaultValue
  const [aliasesInput, setAliasesInput] = useState(meta.aliases ?? '');
  useEffect(() => { setAliasesInput(meta.aliases ?? ''); }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!categoryDropdownOpen) return;
    const h = (e: MouseEvent) => {
      if (catDropRef.current && !catDropRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [categoryDropdownOpen, setCategoryDropdownOpen]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <input
            value={detailName}
            onChange={e => setDetailName(e.target.value)}
            onBlur={() => onSaveValue(product.id, detailName)}
            className="input-field text-base font-semibold w-full"
            placeholder="Product name"
          />
          <input
            value={aliasesInput}
            onChange={e => setAliasesInput(e.target.value)}
            onBlur={() => onUpdateMeta(product.id, m => ({ ...m, aliases: aliasesInput.trim() }))}
            className="input-field text-sm w-full text-gray-500"
            placeholder="Short name or aliases e.g. WMS, Industrial ERP"
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Category badge / reassign */}
          <div ref={catDropRef} className="relative">
            <button
              type="button"
              onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 hover:border-gray-400 transition-colors"
              style={catColor ? { backgroundColor: `${catColor}22`, borderColor: catColor, color: catColor } : {}}
            >
              {catColor && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />}
              {assignedCategory?.value ?? systemCatLabel}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {categoryDropdownOpen && (
              <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px]">
                <button
                  type="button"
                  onClick={() => { onSaveValue(product.id, product.value, { category_id: null }); setCategoryDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {systemCatLabel}
                </button>
                {categories.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onSaveValue(product.id, product.value, { category_id: c.id }); setCategoryDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    {c.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />}
                    {c.value}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active/inactive toggle */}
          <button
            type="button"
            onClick={() => onUpdateMeta(product.id, m => ({ ...m, active: !m.active }))}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              meta.active
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-gray-100 border-gray-300 text-gray-500'
            }`}
          >
            {meta.active ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>

      {/* Section 1 — Target functions */}
      <SectionCard title="Target functions" description="How relevant is each buyer function to this product?">
        {functionOptions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No functions configured in Config Options.</p>
        ) : (
          <div className="space-y-2">
            {functionOptions.map(f => (
              <div key={f.value} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{f.value}</span>
                <TriToggle
                  options={['high', 'med', 'ignore'] as const}
                  labels={{ high: 'High', med: 'Med', ignore: 'Ignore' }}
                  selected={(meta.functions[f.value] as 'high' | 'med' | 'ignore') ?? null}
                  onSelect={v => onUpdateMeta(product.id, m => {
                    const next = { ...m.functions };
                    if (v === null) delete next[f.value]; else next[f.value] = v;
                    return { ...m, functions: next };
                  })}
                  activeColors={{ high: 'bg-teal-600 text-white border-teal-600', med: 'bg-amber-500 text-white border-amber-500', ignore: 'bg-gray-400 text-white border-gray-400' }}
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Section 2 — Seniority → buyer role */}
      <SectionCard title="Seniority → buyer role" description="Map seniority levels to buyer roles for this product.">
        {seniorityOptions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No seniority levels configured in Config Options.</p>
        ) : (
          <div className="space-y-2">
            {seniorityOptions.map(s => (
              <div key={s.value} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{s.value}</span>
                <TriToggle
                  options={['decision_maker', 'influencer', 'target_title'] as const}
                  labels={{ decision_maker: 'Decision maker', influencer: 'Influencer', target_title: 'Target title' }}
                  selected={(meta.seniority[s.value] as 'decision_maker' | 'influencer' | 'target_title') ?? null}
                  onSelect={v => onUpdateMeta(product.id, m => {
                    const next = { ...m.seniority };
                    if (v === null) delete next[s.value]; else next[s.value] = v;
                    return { ...m, seniority: next };
                  })}
                  activeColors={{
                    decision_maker: 'bg-teal-600 text-white border-teal-600',
                    influencer: 'bg-purple-600 text-white border-purple-600',
                    target_title: 'bg-amber-500 text-white border-amber-500',
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Section 3 — Industry relevance */}
      <SectionCard title="Industry relevance" description="Which industries are most relevant for this product?">
        {industryOptions.length === 0 ? (
          <p className="text-sm text-gray-400">
            No industries set up yet.{' '}
            <Link href="/admin?tab=types" className="text-brand-secondary hover:underline">
              Add industries in Config Options → Industry.
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {industryOptions.map(ind => {
              const active = meta.industries.includes(ind.id);
              return (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => onUpdateMeta(product.id, m => ({
                    ...m,
                    industries: active
                      ? m.industries.filter(i => i !== ind.id)
                      : [...m.industries, ind.id],
                  }))}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    active
                      ? 'bg-brand-primary text-white border-brand-primary'
                      : 'border-gray-300 text-gray-600 hover:border-brand-primary hover:text-brand-primary'
                  }`}
                >
                  {ind.value}
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Section 4 — Title keywords */}
      <SectionCard
        title="Title keywords"
        description="Words or phrases in a scanned title that strongly signal this product. Used for scan-time matching when a title doesn't cleanly resolve through function and seniority alone."
      >
        <div className="flex flex-wrap gap-2 mb-2">
          {meta.keywords.map(kw => (
            <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
              {kw}
              <button
                type="button"
                onClick={() => onUpdateMeta(product.id, m => ({ ...m, keywords: m.keywords.filter(k => k !== kw) }))}
                className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          value={keywordInput}
          onChange={e => setKeywordInput(e.target.value)}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && keywordInput.trim()) {
              e.preventDefault();
              const kw = keywordInput.replace(/,/g, '').trim();
              if (kw && !meta.keywords.includes(kw)) {
                onUpdateMeta(product.id, m => ({ ...m, keywords: [...m.keywords, kw] }));
              }
              setKeywordInput('');
            }
          }}
          placeholder="Type a keyword and press Enter"
          className="input-field w-full text-sm"
        />
        <p className="text-xs text-gray-400 mt-1">Press Enter or comma to add a keyword.</p>
      </SectionCard>

      {/* Section 5 — Scan preview */}
      <SectionCard title="Scan preview" description="How this product appears to a rep after a badge scan.">
        {!scanPreview.hasAny ? (
          <p className="text-sm text-gray-400 italic">Set seniority and function mappings above to see your scan preview.</p>
        ) : (
          <div className="flex gap-3 flex-wrap">
            {scanPreview.scenarioA && (
              <ScenarioCard label="Scenario A" {...scanPreview.scenarioA} productName={product.value} />
            )}
            {scanPreview.scenarioB && (
              <ScenarioCard label="Scenario B" {...scanPreview.scenarioB} productName={product.value} />
            )}
          </div>
        )}
      </SectionCard>

      {/* Delete */}
      {!product.is_system && (
        <div className="pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => onDelete(product.id, product.value)}
            className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
          >
            Delete product
          </button>
          {deleteError && <p className="text-xs text-red-500 mt-1">{deleteError}</p>}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ProductsSolutionsTab({
  products,
  categories,
  seniorityOptions,
  functionOptions,
  industryOptions,
  onRefresh,
}: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [localProducts, setLocalProducts] = useState<ConfigOption[]>(products);
  const [localCategories, setLocalCategories] = useState<ConfigOption[]>(categories);
  const [recomputingIcp, setRecomputingIcp] = useState(false);

  const handleRecomputeIcp = async () => {
    setRecomputingIcp(true);
    try {
      const res = await fetch('/api/admin/recompute-icp', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Recompute failed');
      toast.success(`ICP reapplied to ${data.updated} companies`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to reapply ICP');
    } finally {
      setRecomputingIcp(false);
    }
  };

  // System category is the is_system=1 entry (the default/uncategorized bucket)
  const systemCategory = localCategories.find(c => c.is_system === 1) ?? null;
  const systemCategoryLabel = systemCategory?.value ?? 'General';

  // Add product form
  const [newName, setNewName] = useState('');
  const [newCatId, setNewCatId] = useState<number | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [addError, setAddError] = useState('');

  // Add category mini-form
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState<string | null>(null);
  const [addingCat, setAddingCat] = useState(false);

  // Per-product detail state
  const [meta, setMeta] = useState<ProductMeta>({ functions: {}, seniority: {}, industries: [], keywords: [], aliases: '', active: true });
  const [detailName, setDetailName] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');

  // Delete error
  const [deleteError, setDeleteError] = useState('');

  // Sync when parent refreshes
  useEffect(() => { setLocalProducts(products); }, [products]);
  useEffect(() => { setLocalCategories(categories); }, [categories]);

  // Default newCatId to first non-system category
  useEffect(() => {
    if (newCatId === null && localCategories.length > 0) {
      const first = localCategories.find(c => !c.is_system);
      if (first) setNewCatId(first.id);
    }
  }, [localCategories, newCatId]);

  // Load product meta when selection changes
  const selectedProduct = localProducts.find(p => p.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedProduct) {
      setMeta(parseMeta(null));
      setDetailName('');
      return;
    }
    setMeta(parseMeta(selectedProduct.metadata));
    setDetailName(selectedProduct.value);
    setKeywordInput('');
    setCategoryDropdownOpen(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive category color for selected product
  const getProductCategoryColor = useCallback((product: ConfigOption): string | null => {
    if (!product.category_id) return null;
    const cat = localCategories.find(c => c.id === product.category_id);
    return cat?.color ?? null;
  }, [localCategories]);

  // ── Save helpers ──────────────────────────────────────────────────────────

  const saveMeta = useCallback(async (id: number, newMeta: ProductMeta) => {
    try {
      await fetch(`/api/config/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: JSON.stringify(newMeta) }),
      });
      setLocalProducts(prev => prev.map(p => p.id === id ? { ...p, metadata: JSON.stringify(newMeta) } : p));
    } catch {
      toast.error('Failed to save.');
    }
  }, []);

  const updateMeta = useCallback((id: number, updater: (m: ProductMeta) => ProductMeta) => {
    const updated = updater(meta);
    setMeta(updated);
    saveMeta(id, updated);
  }, [meta, saveMeta]);

  const saveValue = useCallback(async (id: number, value: string, extraFields?: Record<string, unknown>) => {
    if (!value.trim()) return;
    try {
      await fetch(`/api/config/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value.trim(), ...extraFields }),
      });
      setLocalProducts(prev => prev.map(p => p.id === id ? { ...p, value: value.trim(), ...extraFields } : p));
      onRefresh();
    } catch {
      toast.error('Failed to save.');
    }
  }, [onRefresh]);

  // ── Add category ──────────────────────────────────────────────────────────

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'product_category',
          value: newCatName.trim(),
          sort_order: localCategories.length + 1,
          color: newCatColor,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      const created = await res.json() as { id: unknown; value: unknown; sort_order?: unknown };
      const newCat: ConfigOption = {
        id: Number(created.id),
        category: 'product_category',
        value: String(created.value),
        sort_order: Number(created.sort_order ?? 0),
        color: newCatColor,
      };
      setLocalCategories(prev => [...prev, newCat]);
      setNewCatId(newCat.id);
      setNewCatName('');
      setNewCatColor(null);
      setShowNewCat(false);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create category.');
    } finally {
      setAddingCat(false);
    }
  };

  // ── Add product ───────────────────────────────────────────────────────────

  const handleAddProduct = async () => {
    if (!newName.trim()) return;
    setAddError('');
    const duplicate = localProducts.find(p =>
      p.value.toLowerCase() === newName.trim().toLowerCase() &&
      (p.category_id ?? null) === (newCatId ?? null)
    );
    if (duplicate) {
      const catLabel = localCategories.find(c => c.id === newCatId)?.value ?? 'this category';
      setAddError(`A product with this name already exists in ${catLabel}.`);
      return;
    }
    setAddingProduct(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'products',
          value: newName.trim(),
          sort_order: localProducts.length + 1,
          category_id: newCatId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      const created = await res.json() as { id: unknown; value: unknown; sort_order?: unknown };
      const newProduct: ConfigOption = {
        id: Number(created.id),
        category: 'products',
        value: String(created.value),
        sort_order: Number(created.sort_order ?? 0),
        color: null,
        category_id: newCatId,
      };
      setLocalProducts(prev => [...prev, newProduct]);
      setSelectedId(newProduct.id);
      setNewName('');
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create product.');
    } finally {
      setAddingProduct(false);
    }
  };

  // ── Delete product ────────────────────────────────────────────────────────

  const handleDeleteProduct = async (id: number, value: string) => {
    if (selectedProduct?.is_system) return;
    if (!confirm(`Delete "${value}"? This cannot be undone.`)) return;
    setDeleteError('');
    try {
      const res = await fetch(`/api/config/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed');
      }
      setLocalProducts(prev => prev.filter(p => p.id !== id));
      if (selectedId === id) setSelectedId(null);
      onRefresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete.');
    }
  };

  // ── Group products by category for sidebar ────────────────────────────────

  const grouped = (() => {
    const map = new Map<number | null, ConfigOption[]>();
    for (const p of localProducts) {
      const key = p.category_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    map.forEach(arr => arr.sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value)));

    const orderedCats: Array<{ id: number | null; label: string; color: string | null }> = [];
    const sortedCats = [...localCategories].sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value));
    for (const c of sortedCats) {
      orderedCats.push({ id: c.id, label: c.value, color: c.color });
    }
    // Null-category products belong to the system category (the default bucket).
    // Only add a separate fallback entry if there's no system category at all.
    if (map.has(null) && !systemCategory) {
      orderedCats.push({ id: null, label: systemCategoryLabel, color: null });
    }

    return orderedCats.map(cat => {
      const directProducts = map.get(cat.id) ?? [];
      // Merge null-category products into the system category group
      const nullProducts = (cat.id === systemCategory?.id && map.has(null)) ? (map.get(null) ?? []) : [];
      return {
        ...cat,
        products: [...directProducts, ...nullProducts],
      };
    });
  })();

  // ── Scan preview derivation ───────────────────────────────────────────────

  const scanPreview: ScanPreview = (() => {
    const dmSeniority = seniorityOptions.find(s => meta.seniority[s.value] === 'decision_maker');
    const infSeniority = seniorityOptions.find(s => meta.seniority[s.value] === 'influencer');
    const highFn = functionOptions.find(f => meta.functions[f.value] === 'high');
    const medFn = functionOptions.find(f => meta.functions[f.value] === 'med');

    const scenarioA: ScanScenario | null = dmSeniority
      ? {
          title: `${highFn?.value ?? medFn?.value ?? 'Business'} ${dmSeniority.value}`,
          role: 'decision_maker',
          confidence: highFn ? 'High' : 'Medium',
        }
      : null;
    const scenarioB: ScanScenario | null = infSeniority
      ? {
          title: `${highFn?.value ?? medFn?.value ?? 'Business'} ${infSeniority.value}`,
          role: 'influencer',
          confidence: highFn ? 'High' : 'Medium',
        }
      : null;

    return { scenarioA, scenarioB, hasAny: !!(scenarioA || scenarioB) };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-brand-primary font-serif mb-1">Reapply ICP to All Companies</h2>
            <p className="text-sm text-gray-500">Re-evaluates every company against your current ICP rules and updates their ICP status. Run this after changing product or ICP settings to apply them retroactively.</p>
          </div>
          <button
            type="button"
            onClick={handleRecomputeIcp}
            disabled={recomputingIcp}
            className="btn-secondary text-sm flex-shrink-0 flex items-center gap-2"
          >
            {recomputingIcp ? (
              <>
                <span className="animate-spin w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full inline-block" />
                Reapplying…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reapply ICP to All Companies
              </>
            )}
          </button>
        </div>
      </div>
    <div className="flex flex-col md:flex-row gap-6 min-h-[600px]">
      {/* ── Left sidebar ── */}
      <div className="w-full md:w-56 flex-shrink-0 flex flex-col gap-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Products</p>

        {grouped.map(group => (
          <div key={group.id ?? 'general'} className="mb-3">
            {/* Category header */}
            <div className="flex items-center gap-1.5 mb-1 px-1">
              {group.color && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
              )}
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide truncate">
                {group.label}
              </span>
            </div>
            {/* Products */}
            {group.products.map(p => {
              const isSelected = p.id === selectedId;
              const pMeta = parseMeta(p.metadata);
              const catColor = getProductCategoryColor(p) ?? (group.id === null ? null : group.color);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left text-sm px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors relative ${
                    isSelected
                      ? 'bg-brand-primary/10 text-brand-primary font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  } ${!pMeta.active ? 'opacity-50' : ''}`}
                  style={isSelected && catColor ? { borderLeft: `3px solid ${catColor}`, paddingLeft: '9px' } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: catColor ?? '#9CA3AF' }}
                  />
                  <span className="truncate flex-1">{p.value}</span>
                  {!pMeta.active && (
                    <span className="text-[10px] text-gray-400 italic flex-shrink-0">off</span>
                  )}
                </button>
              );
            })}
            {group.products.length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-1 italic">No products</p>
            )}
          </div>
        ))}

        {/* Add product form */}
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add product</p>
          <input
            value={newName}
            onChange={e => { setNewName(e.target.value); setAddError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleAddProduct(); }}
            placeholder="Product name"
            className="input-field w-full text-sm"
          />
          {!showNewCat ? (
            <select
              value={newCatId ?? ''}
              onChange={e => {
                if (e.target.value === '__new__') {
                  setShowNewCat(true);
                } else {
                  setNewCatId(e.target.value ? Number(e.target.value) : null);
                }
              }}
              className="input-field w-full text-sm"
            >
              <option value="">{systemCategoryLabel}</option>
              {localCategories.filter(c => !c.is_system).map(c => (
                <option key={c.id} value={c.id}>{c.value}</option>
              ))}
              <option value="__new__">+ New category</option>
            </select>
          ) : (
            <div className="border border-gray-200 rounded-lg p-2 space-y-1.5 bg-gray-50">
              <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">New category</p>
              <input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="input-field w-full text-sm"
                autoFocus
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {COLOR_PRESETS.map(preset => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setNewCatColor(preset.key)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${
                      newCatColor === preset.key
                        ? 'border-brand-primary scale-110'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                    style={{ backgroundColor: preset.swatch }}
                    title={preset.label}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleAddCategory}
                  disabled={!newCatName.trim() || addingCat}
                  className="btn-primary text-xs px-3 py-1.5 flex-1"
                >
                  {addingCat ? '...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewCat(false); setNewCatName(''); setNewCatColor(null); }}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <button
            type="button"
            onClick={handleAddProduct}
            disabled={!newName.trim() || addingProduct}
            className="btn-primary text-sm w-full"
          >
            {addingProduct ? 'Adding...' : 'Add product'}
          </button>
        </div>
      </div>

      {/* ── Right detail panel ── */}
      <div className="flex-1 min-w-0">
        {!selectedProduct ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            Select a product to configure it
          </div>
        ) : (
          <DetailPanel
            key={selectedProduct.id}
            product={selectedProduct}
            meta={meta}
            detailName={detailName}
            setDetailName={setDetailName}
            categories={localCategories}
            seniorityOptions={seniorityOptions}
            functionOptions={functionOptions}
            industryOptions={industryOptions}
            scanPreview={scanPreview}
            deleteError={deleteError}
            categoryDropdownOpen={categoryDropdownOpen}
            setCategoryDropdownOpen={setCategoryDropdownOpen}
            keywordInput={keywordInput}
            setKeywordInput={setKeywordInput}
            onSaveValue={saveValue}
            onUpdateMeta={updateMeta}
            onDelete={handleDeleteProduct}
            getProductCategoryColor={getProductCategoryColor}
          />
        )}
      </div>
    </div>
    </div>
  );
}
