'use client';

import { useState, useEffect, useRef } from 'react';
import { useHideBottomNav } from './BottomNavContext';

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
  created_by_user_id: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  products: DealProduct[];
}

interface Currency {
  code: string;
  label: string;
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
  const [products, setProducts] = useState<DealProduct[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Company search state (used when companyId prop is not provided)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyResults, setCompanyResults] = useState<CompanySearchResult[]>([]);
  const [companySearching, setCompanySearching] = useState(false);
  const companyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEditing = !!deal;

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/closed-deals/form-data')
      .then(r => r.json())
      .then(data => setCurrencies(data.currencies ?? []))
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && deal) {
      setDealName(deal.deal_name);
      setCloseDate(deal.close_date);
      setAmount(deal.amount != null ? String(deal.amount) : '');
      setCurrency(deal.currency || 'USD');
      setNotes(deal.notes || '');
      setProducts(deal.products.length > 0 ? deal.products.map(p => ({ ...p })) : []);
    } else if (isOpen) {
      setDealName('');
      setCloseDate('');
      setAmount('');
      setCurrency('USD');
      setNotes('');
      setProducts([]);
    }
    setError('');
    setSelectedCompanyId(null);
    setSelectedCompanyName('');
    setCompanyQuery('');
    setCompanyResults([]);
  }, [isOpen, deal]);

  useEffect(() => {
    if (companyId != null) return; // company is pre-provided
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
          {/* Company search (only shown when companyId is not pre-provided) */}
          {companyId == null && (
            <div className="relative">
              <label className="block text-xs font-medium text-gray-700 mb-1">Company <span className="text-red-500">*</span></label>
              {selectedCompanyId ? (
                <div className="flex items-center justify-between px-3 py-2 border border-brand-primary rounded-lg bg-blue-50">
                  <span className="text-sm font-medium text-gray-800 truncate">{selectedCompanyName}</span>
                  <button type="button" onClick={() => { setSelectedCompanyId(null); setSelectedCompanyName(''); setCompanyQuery(''); }} className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={companyQuery}
                    onChange={e => setCompanyQuery(e.target.value)}
                    placeholder="Search companies…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Deal Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={dealName}
              onChange={e => setDealName(e.target.value)}
              placeholder="e.g. Acme Corp — Enterprise License"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
            />
          </div>

          {/* Close date + Amount row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Close Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={closeDate}
                onChange={e => setCloseDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Deal Amount</label>
              <div className="flex gap-1">
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary w-20 flex-shrink-0"
                >
                  {currencies.length === 0 ? (
                    <option value="USD">USD</option>
                  ) : (
                    currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)
                  )}
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional context, deal terms, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary resize-none"
            />
          </div>

          {/* Products */}
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
                <div className="grid grid-cols-[1fr_60px_80px_24px] gap-1 px-1">
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Product</span>
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide text-right">Qty</span>
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide text-right">Unit Price</span>
                  <span />
                </div>
                {products.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_60px_80px_24px] gap-1 items-center">
                    <input
                      type="text"
                      value={p.product_name}
                      onChange={e => handleProductChange(i, 'product_name', e.target.value)}
                      placeholder="Product name"
                      className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary"
                    />
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
                ))}
                {showComputedTotal && (
                  <div className="flex justify-end pt-1">
                    <span className="text-xs text-gray-500">
                      Computed total: <span className="font-semibold text-gray-700">{currency} {computedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </span>
                  </div>
                )}
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
