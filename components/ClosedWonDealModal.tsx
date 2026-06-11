'use client';

import { useState, useEffect, useRef } from 'react';
import { useHideBottomNav } from './BottomNavContext';

interface ConfigOption {
  id: number;
  value: string;
  category_id: number | null;
  color: string | null;
}

interface DealProduct {
  id?: number;
  product_name: string;
  quantity: number | null;
  unit_price: number | null;
  sort_order: number;
}

export interface ClosedDeal {
  id: number;
  company_id: number;
  deal_name: string;
  close_date: string;
  amount: number | null;
  currency: string;
  notes: string | null;
  opportunity_id: string | null;
  deal_type: string | null;
  contact_signor: string | null;
  attributed_conference: string | null;
  attribution_type: string | null;
  attributed_rep: string | null;
  created_by_user_id: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  products: DealProduct[];
}

interface CompanySearchResult {
  id: number;
  name: string;
}

interface ClosedWonDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId?: number | null;
  deal?: ClosedDeal | null;
  onSuccess: (deal: ClosedDeal) => void;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SGD', 'INR', 'MXN', 'BRL'];

const DEAL_TYPES = ['New Business', 'Upsell', 'Renewal', 'Expansion', 'Partnership', 'Other'];

const ATTRIBUTION_TYPES = ['Direct Source', 'Influenced', 'Accelerated', 'None'];

const EMPTY_PRODUCT = (): DealProduct => ({
  product_name: '',
  quantity: null,
  unit_price: null,
  sort_order: 0,
});

export function ClosedWonDealModal({
  isOpen,
  onClose,
  companyId,
  deal,
  onSuccess,
}: ClosedWonDealModalProps) {
  useHideBottomNav(isOpen);

  const [dealName, setDealName] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');

  // Advanced fields
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [opportunityId, setOpportunityId] = useState('');
  const [dealType, setDealType] = useState('');
  const [contactSignor, setContactSignor] = useState('');
  const [attributedConference, setAttributedConference] = useState('');
  const [attributionType, setAttributionType] = useState('');
  const [attributedRep, setAttributedRep] = useState('');

  // Products
  const [products, setProducts] = useState<DealProduct[]>([]);
  const [configProducts, setConfigProducts] = useState<ConfigOption[]>([]);
  const [configCategories, setConfigCategories] = useState<ConfigOption[]>([]);

  // Inline new-product creation
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategoryId, setNewProductCategoryId] = useState<number | ''>('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [createProductError, setCreateProductError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Company search
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyResults, setCompanyResults] = useState<CompanySearchResult[]>([]);
  const [companySearching, setCompanySearching] = useState(false);
  const companyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEditing = !!deal;

  // Load config options on open
  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      fetch('/api/config?category=products').then(r => r.json()).catch(() => []),
      fetch('/api/config?category=product_category').then(r => r.json()).catch(() => []),
    ]).then(([prods, cats]) => {
      setConfigProducts(Array.isArray(prods) ? prods : []);
      setConfigCategories(Array.isArray(cats) ? cats : []);
    });
  }, [isOpen]);

  // Reset / populate form on open
  useEffect(() => {
    if (isOpen && deal) {
      setDealName(deal.deal_name);
      setCloseDate(deal.close_date);
      setAmount(deal.amount != null ? String(deal.amount) : '');
      setCurrency(deal.currency || 'USD');
      setNotes(deal.notes || '');
      setOpportunityId(deal.opportunity_id || '');
      setDealType(deal.deal_type || '');
      setContactSignor(deal.contact_signor || '');
      setAttributedConference(deal.attributed_conference || '');
      setAttributionType(deal.attribution_type || '');
      setAttributedRep(deal.attributed_rep || '');
      setProducts(deal.products.length > 0 ? deal.products.map(p => ({ ...p })) : []);
      const hasAdvanced = !!(deal.opportunity_id || deal.deal_type || deal.contact_signor ||
        deal.attributed_conference || deal.attribution_type || deal.attributed_rep);
      setShowAdvanced(hasAdvanced);
    } else if (isOpen) {
      setDealName('');
      setCloseDate('');
      setAmount('');
      setCurrency('USD');
      setNotes('');
      setOpportunityId('');
      setDealType('');
      setContactSignor('');
      setAttributedConference('');
      setAttributionType('');
      setAttributedRep('');
      setProducts([]);
      setShowAdvanced(false);
    }
    setError('');
    setSelectedCompanyId(null);
    setSelectedCompanyName('');
    setCompanyQuery('');
    setCompanyResults([]);
    setShowNewProductForm(false);
    setNewProductName('');
    setNewProductCategoryId('');
    setCreateProductError('');
  }, [isOpen, deal]);

  // Company search debounce
  useEffect(() => {
    if (companyId != null) return;
    if (companyQuery.length < 2) { setCompanyResults([]); return; }
    if (companyDebounce.current) clearTimeout(companyDebounce.current);
    companyDebounce.current = setTimeout(async () => {
      setCompanySearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(companyQuery)}`);
        const data = await res.json();
        setCompanyResults((data.companies ?? []).slice(0, 8) as CompanySearchResult[]);
      } catch { /* ignore */ } finally {
        setCompanySearching(false);
      }
    }, 300);
    return () => { if (companyDebounce.current) clearTimeout(companyDebounce.current); };
  }, [companyQuery, companyId]);

  if (!isOpen) return null;

  const getCategoryForProduct = (productName: string): ConfigOption | null => {
    const opt = configProducts.find(p => p.value === productName);
    if (!opt?.category_id) return null;
    return configCategories.find(c => c.id === opt.category_id) ?? null;
  };

  const handleAddProduct = () => {
    setProducts(prev => [...prev, { ...EMPTY_PRODUCT(), sort_order: prev.length }]);
  };

  const handleRemoveProduct = (idx: number) => {
    setProducts(prev => prev.filter((_, i) => i !== idx));
  };

  const handleProductChange = (idx: number, field: keyof DealProduct, value: string) => {
    setProducts(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      if (field === 'product_name') return { ...p, product_name: value };
      if (field === 'quantity') return { ...p, quantity: value === '' ? null : Number(value) };
      if (field === 'unit_price') return { ...p, unit_price: value === '' ? null : Number(value) };
      return p;
    }));
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim()) { setCreateProductError('Product name is required.'); return; }
    setCreatingProduct(true);
    setCreateProductError('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'products',
          value: newProductName.trim(),
          category_id: newProductCategoryId !== '' ? Number(newProductCategoryId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateProductError(data.error || 'Failed to create product.'); return; }
      const newOpt: ConfigOption = {
        id: Number(data.id),
        value: String(data.value),
        category_id: data.category_id != null ? Number(data.category_id) : null,
        color: data.color ? String(data.color) : null,
      };
      setConfigProducts(prev => [...prev, newOpt]);
      setShowNewProductForm(false);
      setNewProductName('');
      setNewProductCategoryId('');
    } catch {
      setCreateProductError('Network error. Please try again.');
    } finally {
      setCreatingProduct(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    const resolvedCompanyId = companyId ?? selectedCompanyId;
    if (!resolvedCompanyId) { setError('Please select a company.'); return; }
    if (!dealName.trim()) { setError('Deal name is required.'); return; }
    if (!closeDate.trim()) { setError('Close date is required.'); return; }

    setIsSubmitting(true);
    try {
      const body = {
        deal_name: dealName.trim(),
        close_date: closeDate.trim(),
        amount: amount !== '' ? Number(amount) : null,
        currency: currency || 'USD',
        notes: notes.trim() || null,
        opportunity_id: opportunityId.trim() || null,
        deal_type: dealType.trim() || null,
        contact_signor: contactSignor.trim() || null,
        attributed_conference: attributedConference.trim() || null,
        attribution_type: attributionType.trim() || null,
        attributed_rep: attributedRep.trim() || null,
        products: products
          .filter(p => p.product_name.trim())
          .map((p, i) => ({ ...p, sort_order: i })),
      };

      const url = isEditing
        ? `/api/companies/${resolvedCompanyId}/closed-deals/${deal!.id}`
        : `/api/companies/${resolvedCompanyId}/closed-deals`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }

      onSuccess(data.deal);
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const computedTotal = products.reduce((sum, p) => {
    if (p.unit_price != null && p.quantity != null) return sum + p.unit_price * p.quantity;
    return sum;
  }, 0);
  const showComputedTotal = products.some(p => p.unit_price != null && p.quantity != null);

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary';
  const selectCls = inputCls;
  const labelCls = 'block text-xs font-medium text-gray-700 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-brand-highlight w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-brand-primary font-serif">
            {isEditing ? 'Edit Deal' : 'Log Closed/Won Deal'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Company search (only when companyId not pre-provided) */}
          {companyId == null && (
            <div className="relative">
              <label className={labelCls}>Company <span className="text-red-500">*</span></label>
              {selectedCompanyId ? (
                <div className="flex items-center justify-between px-3 py-2 border border-brand-primary rounded-lg bg-blue-50">
                  <span className="text-sm font-medium text-gray-800 truncate">{selectedCompanyName}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedCompanyId(null); setSelectedCompanyName(''); setCompanyQuery(''); }}
                    className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={companyQuery}
                    onChange={e => setCompanyQuery(e.target.value)}
                    placeholder="Search companies…"
                    className={inputCls}
                  />
                  {(companyResults.length > 0 || companySearching) && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {companySearching && <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>}
                      {companyResults.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedCompanyId(c.id); setSelectedCompanyName(c.name); setCompanyQuery(''); setCompanyResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Deal name */}
          <div>
            <label className={labelCls}>Deal Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={dealName}
              onChange={e => setDealName(e.target.value)}
              placeholder="e.g. Acme Corp — Enterprise License"
              className={inputCls}
            />
          </div>

          {/* Close date + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Close Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={closeDate}
                onChange={e => setCloseDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Deal Amount</label>
              <div className="flex gap-1">
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary w-20 flex-shrink-0"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional context, deal terms, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary resize-none"
            />
          </div>

          {/* Products / Services */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Products / Services</label>
              <button
                type="button"
                onClick={handleAddProduct}
                className="text-xs text-brand-primary hover:underline font-medium"
              >
                + Add line
              </button>
            </div>

            {products.length === 0 ? (
              <p className="text-xs text-gray-400 py-1">No products added.</p>
            ) : (
              <div className="space-y-2">
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_56px_76px_20px] gap-1.5 px-0.5">
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Product</span>
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide text-right">Qty</span>
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide text-right">Unit Price</span>
                  <span />
                </div>

                {products.map((p, i) => {
                  const cat = getCategoryForProduct(p.product_name);
                  // Build options: all config products + any unlisted current value
                  const inConfig = configProducts.some(o => o.value === p.product_name);
                  const extraOptions = (!inConfig && p.product_name)
                    ? [{ id: -1, value: p.product_name, category_id: null, color: null }]
                    : [];
                  const allOptions = [...configProducts, ...extraOptions];

                  return (
                    <div key={i} className="space-y-1">
                      <div className="grid grid-cols-[1fr_56px_76px_20px] gap-1.5 items-center">
                        <div className="relative">
                          <select
                            value={p.product_name}
                            onChange={e => handleProductChange(i, 'product_name', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary appearance-none pr-6 truncate"
                          >
                            <option value="">— Select —</option>
                            {allOptions.map(o => (
                              <option key={o.id} value={o.value}>{o.value}</option>
                            ))}
                          </select>
                          <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={p.quantity ?? ''}
                          onChange={e => handleProductChange(i, 'quantity', e.target.value)}
                          placeholder="1"
                          className="border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={p.unit_price ?? ''}
                          onChange={e => handleProductChange(i, 'unit_price', e.target.value)}
                          placeholder="0.00"
                          className="border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(i)}
                          className="text-gray-300 hover:text-red-400 transition-colors flex items-center justify-center"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      {cat && (
                        <div className="pl-0.5">
                          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                            {cat.value}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {showComputedTotal && (
                  <div className="flex justify-end pt-1">
                    <span className="text-xs text-gray-500">
                      Computed total:{' '}
                      <span className="font-semibold text-gray-700">
                        {currency} {computedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Inline new product creation */}
            {!showNewProductForm ? (
              <button
                type="button"
                onClick={() => setShowNewProductForm(true)}
                className="mt-2 text-xs text-gray-400 hover:text-brand-primary transition-colors"
              >
                Can&apos;t find a product? + Create new
              </button>
            ) : (
              <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                <p className="text-xs font-medium text-gray-700">New product</p>
                <input
                  type="text"
                  value={newProductName}
                  onChange={e => setNewProductName(e.target.value)}
                  placeholder="Product name"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
                {configCategories.length > 0 && (
                  <select
                    value={newProductCategoryId}
                    onChange={e => setNewProductCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary"
                  >
                    <option value="">No category</option>
                    {configCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.value}</option>
                    ))}
                  </select>
                )}
                {createProductError && <p className="text-xs text-red-500">{createProductError}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCreateProduct}
                    disabled={creatingProduct}
                    className="px-3 py-1 text-xs font-medium bg-brand-primary text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {creatingProduct ? 'Saving…' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNewProductForm(false); setNewProductName(''); setNewProductCategoryId(''); setCreateProductError(''); }}
                    className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Advanced details collapsible */}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="text-xs font-medium text-gray-600">Advanced details</span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdvanced && (
              <div className="px-4 py-3 space-y-3">
                {/* Opportunity ID + Deal type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Opportunity ID</label>
                    <input
                      type="text"
                      value={opportunityId}
                      onChange={e => setOpportunityId(e.target.value)}
                      placeholder="CRM reference"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Deal Type</label>
                    <select
                      value={dealType}
                      onChange={e => setDealType(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">— Select —</option>
                      {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Contact / signor */}
                <div>
                  <label className={labelCls}>Contact / Signor</label>
                  <input
                    type="text"
                    value={contactSignor}
                    onChange={e => setContactSignor(e.target.value)}
                    placeholder="Name of signing contact"
                    className={inputCls}
                  />
                </div>

                {/* Attributed conference + Attribution type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Attributed Conference</label>
                    <input
                      type="text"
                      value={attributedConference}
                      onChange={e => setAttributedConference(e.target.value)}
                      placeholder="Conference name"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Attribution Type</label>
                    <select
                      value={attributionType}
                      onChange={e => setAttributionType(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">— Select —</option>
                      {ATTRIBUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Attributed rep */}
                <div>
                  <label className={labelCls}>Attributed Rep</label>
                  <input
                    type="text"
                    value={attributedRep}
                    onChange={e => setAttributedRep(e.target.value)}
                    placeholder="Sales rep name"
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 text-sm font-medium bg-brand-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Log Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}
