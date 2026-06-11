'use client';

import { useState, useEffect, useRef } from 'react';
import { useHideBottomNav } from './BottomNavContext';
import { useClosedDealDraft, type ClosedDeal, type DealProduct } from '@/lib/ClosedDealDraftContext';

// Re-export so existing importers keep working
export type { ClosedDeal, DealProduct };

interface ConfigOption {
  id: number;
  value: string;
  category_id: number | null;
  color: string | null;
}

interface CompanyAttendee {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  seniority: string | null;
  function: string | null;
}

interface CompanyConference {
  id: number;
  name: string;
}

interface CompanySearchResult {
  id: number;
  name: string;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SGD', 'INR', 'MXN', 'BRL'];
const DEAL_TYPES = ['New Business', 'Upsell', 'Renewal', 'Expansion', 'Partnership', 'Other'];
const ATTRIBUTION_TYPES = ['Direct Source', 'Influenced', 'Accelerated', 'None'];

const EMPTY_PRODUCT = (): DealProduct => ({ product_name: '', quantity: null, unit_price: null, sort_order: 0 });

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

// Shared multiselect dropdown UI
function MultiSelectField({
  label,
  options,
  selected,
  onToggle,
  placeholder,
  disabledMessage,
  dropdownRef,
  isOpen,
  setIsOpen,
}: {
  label: string;
  options: { value: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  placeholder: string;
  disabledMessage?: string;
  dropdownRef: React.RefObject<HTMLDivElement>;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}) {
  const disabled = !!disabledMessage;
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-full flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary disabled:opacity-50 disabled:bg-gray-50"
        >
          <span className="truncate">
            {selected.length === 0
              ? <span className="text-gray-400">{disabledMessage ?? placeholder}</span>
              : selected.length === 1
              ? <span className="text-gray-700">{selected[0]}</span>
              : <span className="text-gray-700">{selected.length} selected</span>}
          </span>
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No options available.</p>
            ) : (
              options.map(o => (
                <button key={o.value} type="button" onClick={() => onToggle(o.value)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-blue-50 transition-colors text-left">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected.includes(o.value) ? 'bg-brand-primary border-brand-primary' : 'border-gray-300'}`}>
                    {selected.includes(o.value) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={selected.includes(o.value) ? 'text-brand-primary font-medium' : 'text-gray-700'}>{o.value}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
              {v}
              <button type="button" onClick={() => onToggle(v)} className="text-blue-400 hover:text-blue-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClosedWonDealModal() {
  const ctx = useClosedDealDraft();
  const { isOpen, isMinimized, targetCompanyId, editingDeal, closeDeal, minimizeDeal, setDraftLabel } = ctx;

  useHideBottomNav(isOpen && !isMinimized);

  // ── Core fields ──────────────────────────────────────────────────────────────
  const [dealName, setDealName] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [valueEntryMode, setValueEntryMode] = useState<'by_product' | 'manual'>('by_product');

  // ── Promoted fields (under deal name) ───────────────────────────────────────
  // Contact / Signor
  const [contactMode, setContactMode] = useState<'attendee' | 'other' | ''>('');
  const [contactAttendeeId, setContactAttendeeId] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactFunction, setContactFunction] = useState('');
  const [contactSeniority, setContactSeniority] = useState('');
  // Attributed Rep (multiselect from config_options category=user)
  const [attributedReps, setAttributedReps] = useState<string[]>([]);
  const [showRepDropdown, setShowRepDropdown] = useState(false);
  const repDropdownRef = useRef<HTMLDivElement | null>(null);
  // Attributed Conferences (multiselect)
  const [attributedConferences, setAttributedConferences] = useState<string[]>([]);
  const [showConferenceDropdown, setShowConferenceDropdown] = useState(false);
  const confDropdownRef = useRef<HTMLDivElement | null>(null);

  // ── Attribution type + pct (below conferences) ───────────────────────────────
  const [attributionType, setAttributionType] = useState('');
  const [attributionPct, setAttributionPct] = useState<number>(50);

  // ── Advanced fields ──────────────────────────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [opportunityId, setOpportunityId] = useState('');
  const [dealType, setDealType] = useState('');

  // ── Products ─────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<DealProduct[]>([]);
  const [configProducts, setConfigProducts] = useState<ConfigOption[]>([]);
  const [configCategories, setConfigCategories] = useState<ConfigOption[]>([]);

  // ── Inline new-product form ──────────────────────────────────────────────────
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategoryId, setNewProductCategoryId] = useState<number | ''>('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [createProductError, setCreateProductError] = useState('');

  // ── Config options ───────────────────────────────────────────────────────────
  const [configFunctions, setConfigFunctions] = useState<ConfigOption[]>([]);
  const [configSeniorities, setConfigSeniorities] = useState<ConfigOption[]>([]);
  const [configUsers, setConfigUsers] = useState<ConfigOption[]>([]);

  // ── Company-specific data ────────────────────────────────────────────────────
  const [companyAttendees, setCompanyAttendees] = useState<CompanyAttendee[]>([]);
  const [companyConferences, setCompanyConferences] = useState<CompanyConference[]>([]);

  // ── Company search ───────────────────────────────────────────────────────────
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyResults, setCompanyResults] = useState<CompanySearchResult[]>([]);
  const [companySearching, setCompanySearching] = useState(false);
  const companyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Submission ───────────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!editingDeal;
  const resolvedCompanyId = targetCompanyId ?? selectedCompanyId;

  // Load static config options on open
  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      fetch('/api/config?category=products').then(r => r.json()).catch(() => []),
      fetch('/api/config?category=product_category').then(r => r.json()).catch(() => []),
      fetch('/api/config?category=function').then(r => r.json()).catch(() => []),
      fetch('/api/config?category=seniority').then(r => r.json()).catch(() => []),
      fetch('/api/config?category=user').then(r => r.json()).catch(() => []),
    ]).then(([prods, cats, funcs, sens, users]) => {
      setConfigProducts(Array.isArray(prods) ? prods : []);
      setConfigCategories(Array.isArray(cats) ? cats : []);
      setConfigFunctions(Array.isArray(funcs) ? funcs : []);
      setConfigSeniorities(Array.isArray(sens) ? sens : []);
      setConfigUsers(Array.isArray(users) ? users : []);
    });
  }, [isOpen]);

  // Load company attendees + conferences when company changes
  useEffect(() => {
    if (!isOpen || !resolvedCompanyId) {
      setCompanyAttendees([]);
      setCompanyConferences([]);
      return;
    }
    Promise.all([
      fetch(`/api/companies/${resolvedCompanyId}/attendees`).then(r => r.json()).catch(() => ({ attendees: [] })),
      fetch(`/api/companies/${resolvedCompanyId}/conferences`).then(r => r.json()).catch(() => ({ conferences: [] })),
    ]).then(([aData, cData]) => {
      setCompanyAttendees(aData.attendees ?? []);
      setCompanyConferences(cData.conferences ?? []);
    });
  }, [isOpen, resolvedCompanyId]);

  // Populate / reset form when modal opens or deal changes
  useEffect(() => {
    if (!isOpen || isMinimized) return;
    if (editingDeal) {
      setDealName(editingDeal.deal_name);
      setCloseDate(editingDeal.close_date);
      setAmount(editingDeal.amount != null ? String(editingDeal.amount) : '');
      setCurrency(editingDeal.currency || 'USD');
      setNotes(editingDeal.notes || '');
      setOpportunityId(editingDeal.opportunity_id || '');
      setDealType(editingDeal.deal_type || '');
      setAttributionType(editingDeal.attribution_type || '');
      setAttributionPct(editingDeal.attribution_pct ?? 50);
      setAttributedReps(parseJsonArray(editingDeal.attributed_rep));
      setAttributedConferences(parseJsonArray(editingDeal.attributed_conference));
      if (editingDeal.contact_signor_attendee_id != null) {
        setContactMode('attendee');
        setContactAttendeeId(editingDeal.contact_signor_attendee_id);
        setContactName(editingDeal.contact_signor || '');
        setContactTitle(editingDeal.contact_signor_title || '');
        setContactFunction(editingDeal.contact_signor_function || '');
        setContactSeniority(editingDeal.contact_signor_seniority || '');
      } else if (editingDeal.contact_signor) {
        setContactMode('other');
        setContactAttendeeId(null);
        setContactName(editingDeal.contact_signor);
        setContactTitle(editingDeal.contact_signor_title || '');
        setContactFunction(editingDeal.contact_signor_function || '');
        setContactSeniority(editingDeal.contact_signor_seniority || '');
      } else {
        setContactMode(''); setContactAttendeeId(null);
        setContactName(''); setContactTitle(''); setContactFunction(''); setContactSeniority('');
      }
      setProducts(editingDeal.products.length > 0 ? editingDeal.products.map(p => ({ ...p })) : []);
      setValueEntryMode(editingDeal.products.length > 0 ? 'by_product' : (editingDeal.amount != null ? 'manual' : 'by_product'));
      setShowAdvanced(!!(editingDeal.opportunity_id || editingDeal.deal_type));
    } else {
      setDealName(''); setCloseDate(''); setAmount(''); setCurrency('USD'); setNotes('');
      setOpportunityId(''); setDealType(''); setAttributionType(''); setAttributionPct(50);
      setContactMode(''); setContactAttendeeId(null);
      setContactName(''); setContactTitle(''); setContactFunction(''); setContactSeniority('');
      setAttributedReps([]); setAttributedConferences([]);
      setProducts([]); setValueEntryMode('by_product'); setShowAdvanced(false);
    }
    setError('');
    if (targetCompanyId == null) {
      setSelectedCompanyId(null); setSelectedCompanyName('');
      setCompanyQuery(''); setCompanyResults([]);
    }
    setShowNewProductForm(false); setNewProductName('');
    setNewProductCategoryId(''); setCreateProductError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingDeal]);

  // Sync draft label
  useEffect(() => {
    setDraftLabel(dealName.trim() || (isEditing ? 'Edit deal' : 'New deal'));
  }, [dealName, isEditing, setDraftLabel]);

  // Company search debounce
  useEffect(() => {
    if (targetCompanyId != null) return;
    if (companyQuery.length < 2) { setCompanyResults([]); return; }
    if (companyDebounce.current) clearTimeout(companyDebounce.current);
    companyDebounce.current = setTimeout(async () => {
      setCompanySearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(companyQuery)}`);
        const data = await res.json();
        setCompanyResults((data.companies ?? []).slice(0, 8) as CompanySearchResult[]);
      } catch { /* ignore */ } finally { setCompanySearching(false); }
    }, 300);
    return () => { if (companyDebounce.current) clearTimeout(companyDebounce.current); };
  }, [companyQuery, targetCompanyId]);

  // Close rep dropdown on outside click
  useEffect(() => {
    if (!showRepDropdown) return;
    const handler = (e: MouseEvent) => {
      if (repDropdownRef.current && !repDropdownRef.current.contains(e.target as Node)) setShowRepDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showRepDropdown]);

  // Close conference dropdown on outside click
  useEffect(() => {
    if (!showConferenceDropdown) return;
    const handler = (e: MouseEvent) => {
      if (confDropdownRef.current && !confDropdownRef.current.contains(e.target as Node)) setShowConferenceDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showConferenceDropdown]);

  if (!isOpen) return null;

  // Derived values
  const computedTotal = products.reduce((sum, p) => {
    if (p.unit_price != null && p.quantity != null) return sum + p.unit_price * p.quantity;
    return sum;
  }, 0);
  const displayAmount: number | null = valueEntryMode === 'by_product'
    ? (computedTotal > 0 ? computedTotal : null)
    : (amount !== '' ? Number(amount) : null);

  const getCategoryForProduct = (productName: string): ConfigOption | null => {
    const opt = configProducts.find(p => p.value === productName);
    if (!opt?.category_id) return null;
    return configCategories.find(c => c.id === opt.category_id) ?? null;
  };

  const handleAddProduct = () => setProducts(prev => [...prev, { ...EMPTY_PRODUCT(), sort_order: prev.length }]);
  const handleRemoveProduct = (idx: number) => setProducts(prev => prev.filter((_, i) => i !== idx));
  const handleProductChange = (idx: number, field: keyof DealProduct, value: string) => {
    setProducts(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      if (field === 'product_name') return { ...p, product_name: value };
      if (field === 'quantity') return { ...p, quantity: value === '' ? null : Number(value) };
      if (field === 'unit_price') return { ...p, unit_price: value === '' ? null : Number(value) };
      return p;
    }));
  };

  const handleSelectAttendee = (attendeeId: number) => {
    if (attendeeId === -1) {
      setContactMode('other'); setContactAttendeeId(null);
      setContactName(''); setContactTitle(''); setContactFunction(''); setContactSeniority('');
      return;
    }
    if (attendeeId === 0) {
      setContactMode(''); setContactAttendeeId(null);
      setContactName(''); setContactTitle(''); setContactFunction(''); setContactSeniority('');
      return;
    }
    const att = companyAttendees.find(a => a.id === attendeeId);
    if (!att) return;
    setContactMode('attendee');
    setContactAttendeeId(att.id);
    setContactName(`${att.first_name} ${att.last_name}`.trim());
    setContactTitle(att.title || '');
    setContactFunction(att.function || '');
    setContactSeniority(att.seniority || '');
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim()) { setCreateProductError('Product name is required.'); return; }
    setCreatingProduct(true); setCreateProductError('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'products', value: newProductName.trim(), category_id: newProductCategoryId !== '' ? Number(newProductCategoryId) : null }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateProductError(data.error || 'Failed to create product.'); return; }
      setConfigProducts(prev => [...prev, { id: Number(data.id), value: String(data.value), category_id: data.category_id != null ? Number(data.category_id) : null, color: data.color ? String(data.color) : null }]);
      setShowNewProductForm(false); setNewProductName(''); setNewProductCategoryId('');
    } catch { setCreateProductError('Network error. Please try again.'); }
    finally { setCreatingProduct(false); }
  };

  const handleSubmit = async () => {
    setError('');
    if (!resolvedCompanyId) { setError('Please select a company.'); return; }
    if (!dealName.trim()) { setError('Deal name is required.'); return; }
    if (!closeDate.trim()) { setError('Close date is required.'); return; }
    setIsSubmitting(true);
    try {
      const body = {
        deal_name: dealName.trim(),
        close_date: closeDate.trim(),
        amount: valueEntryMode === 'by_product' ? (computedTotal > 0 ? computedTotal : null) : (amount !== '' ? Number(amount) : null),
        currency: currency || 'USD',
        notes: notes.trim() || null,
        opportunity_id: opportunityId.trim() || null,
        deal_type: dealType.trim() || null,
        contact_signor: contactName.trim() || null,
        contact_signor_attendee_id: contactMode === 'attendee' ? contactAttendeeId : null,
        contact_signor_title: contactTitle.trim() || null,
        contact_signor_function: contactFunction.trim() || null,
        contact_signor_seniority: contactSeniority.trim() || null,
        attributed_conference: attributedConferences.length > 0 ? JSON.stringify(attributedConferences) : null,
        attribution_type: attributionType.trim() || null,
        attribution_pct: (attributionType === 'Influenced' || attributionType === 'Accelerated') ? attributionPct : null,
        attributed_rep: attributedReps.length > 0 ? JSON.stringify(attributedReps) : null,
        products: valueEntryMode === 'by_product' ? products.filter(p => p.product_name.trim()).map((p, i) => ({ ...p, sort_order: i })) : [],
      };
      const url = isEditing
        ? `/api/companies/${resolvedCompanyId}/closed-deals/${editingDeal!.id}`
        : `/api/companies/${resolvedCompanyId}/closed-deals`;
      const res = await fetch(url, { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      window.dispatchEvent(new CustomEvent('closed-deal-saved', { detail: { companyId: resolvedCompanyId, deal: data.deal } }));
      closeDeal();
    } catch { setError('Network error. Please try again.'); }
    finally { setIsSubmitting(false); }
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary';
  const labelCls = 'block text-xs font-medium text-gray-700 mb-1';

  if (isMinimized) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={minimizeDeal}>
      <div className="bg-white rounded-2xl shadow-2xl border border-brand-highlight w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-brand-primary font-serif">
              {isEditing ? 'Edit Deal' : 'Log Closed/Won Deal'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Click outside to minimize</p>
          </div>
          <button onClick={closeDeal} className="text-gray-400 hover:text-gray-600 transition-colors" title="Discard draft">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Company search */}
          {targetCompanyId == null && (
            <div className="relative">
              <label className={labelCls}>Company <span className="text-red-500">*</span></label>
              {selectedCompanyId ? (
                <div className="flex items-center justify-between px-3 py-2 border border-brand-primary rounded-lg bg-blue-50">
                  <span className="text-sm font-medium text-gray-800 truncate">{selectedCompanyName}</span>
                  <button type="button" onClick={() => { setSelectedCompanyId(null); setSelectedCompanyName(''); setCompanyQuery(''); setCompanyAttendees([]); setCompanyConferences([]); }} className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <input type="text" value={companyQuery} onChange={e => setCompanyQuery(e.target.value)} placeholder="Search companies…" className={inputCls} />
                  {(companyResults.length > 0 || companySearching) && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {companySearching && <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>}
                      {companyResults.map(c => (
                        <button key={c.id} type="button" onClick={() => { setSelectedCompanyId(c.id); setSelectedCompanyName(c.name); setCompanyQuery(''); setCompanyResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors">{c.name}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Deal Name */}
          <div>
            <label className={labelCls}>Deal Name <span className="text-red-500">*</span></label>
            <input type="text" value={dealName} onChange={e => setDealName(e.target.value)} placeholder="e.g. Acme Corp — Enterprise License" className={inputCls} />
          </div>

          {/* ── Contact / Signor ────────────────────────────────────────────── */}
          <div>
            <label className={labelCls}>Contact / Signor</label>
            <select
              value={contactMode === 'attendee' ? String(contactAttendeeId ?? '') : contactMode === 'other' ? '-1' : '0'}
              onChange={e => handleSelectAttendee(Number(e.target.value))}
              className={inputCls}
              disabled={!resolvedCompanyId}
            >
              <option value="0">— Select contact —</option>
              {companyAttendees.map(a => (
                <option key={a.id} value={a.id}>
                  {`${a.first_name} ${a.last_name}`.trim()}{a.title ? ` — ${a.title}` : ''}
                </option>
              ))}
              <option value="-1">Other (enter manually)</option>
            </select>
            {!resolvedCompanyId && (
              <p className="text-[10px] text-gray-400 mt-0.5">Select a company first to see contacts</p>
            )}
            {/* Attendee metadata badges */}
            {contactMode === 'attendee' && contactTitle && (
              <div className="flex items-center gap-2 mt-1.5 pl-0.5">
                <span className="text-xs text-gray-500">{contactTitle}</span>
                {contactFunction && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{contactFunction}</span>}
                {contactSeniority && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{contactSeniority}</span>}
              </div>
            )}
            {/* "Other" custom fields */}
            {contactMode === 'other' && (
              <div className="mt-2 space-y-2 pl-1 border-l-2 border-gray-100">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Full name" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Title</label>
                    <input type="text" value={contactTitle} onChange={e => setContactTitle(e.target.value)} placeholder="Job title" className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Function</label>
                    <select value={contactFunction} onChange={e => setContactFunction(e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {configFunctions.map(f => <option key={f.id} value={f.value}>{f.value}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Seniority</label>
                    <select value={contactSeniority} onChange={e => setContactSeniority(e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {configSeniorities.map(s => <option key={s.id} value={s.value}>{s.value}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Attributed Rep (multiselect from config_options category=user) ─ */}
          <MultiSelectField
            label="Attributed Rep(s)"
            options={configUsers}
            selected={attributedReps}
            onToggle={v => setAttributedReps(prev => prev.includes(v) ? prev.filter(r => r !== v) : [...prev, v])}
            placeholder="Select reps…"
            dropdownRef={repDropdownRef}
            isOpen={showRepDropdown}
            setIsOpen={setShowRepDropdown}
          />

          {/* ── Attributed Conference(s) ─────────────────────────────────────── */}
          <MultiSelectField
            label="Attributed Conference(s)"
            options={companyConferences.map(c => ({ value: c.name }))}
            selected={attributedConferences}
            onToggle={v => setAttributedConferences(prev => prev.includes(v) ? prev.filter(c => c !== v) : [...prev, v])}
            placeholder="Select conferences…"
            disabledMessage={!resolvedCompanyId ? 'Select a company first' : undefined}
            dropdownRef={confDropdownRef}
            isOpen={showConferenceDropdown}
            setIsOpen={setShowConferenceDropdown}
          />

          {/* ── Attribution Type + % ─────────────────────────────────────────── */}
          <div>
            {(attributionType === 'Influenced' || attributionType === 'Accelerated') ? (
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className={labelCls}>Attribution Type</label>
                  <select value={attributionType} onChange={e => setAttributionType(e.target.value)} className={inputCls}>
                    <option value="">— Select —</option>
                    {ATTRIBUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="w-32 flex-shrink-0">
                  <label className={labelCls}>Attribution %</label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={attributionPct}
                      onChange={e => setAttributionPct(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-full border border-gray-300 rounded-lg pl-3 pr-7 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                    />
                    <span className="pointer-events-none absolute right-3 text-sm text-gray-400">%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Attribution Type</label>
                <select value={attributionType} onChange={e => setAttributionType(e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  {ATTRIBUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* ── Close Date + Annual Deal Value display ───────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Close Date <span className="text-red-500">*</span></label>
              <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>
                <span className="hidden sm:inline">Annual Deal Value</span>
                <span className="sm:hidden">Annual Value</span>
              </label>
              <div className="flex items-center border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 min-h-[38px]">
                {displayAmount != null ? (
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {currency} {displayAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Deal Value Entry toggle ──────────────────────────────────────── */}
          <div className="flex items-end gap-3">
            <div className="flex-shrink-0">
              <label className={labelCls}>Deal Value Entry</label>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setValueEntryMode('by_product')}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${valueEntryMode === 'by_product' ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >By Product</button>
                <button
                  type="button"
                  onClick={() => setValueEntryMode('manual')}
                  className={`px-4 py-2 text-xs font-medium transition-colors border-l border-gray-300 ${valueEntryMode === 'manual' ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >Manual</button>
              </div>
            </div>
            {valueEntryMode === 'manual' && (
              <div className="flex-1 min-w-0 flex gap-1">
                <select value={currency} onChange={e => setCurrency(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary w-16 flex-shrink-0">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary" />
              </div>
            )}
          </div>

          {/* ── Products / Services (By Product mode only) ──────────────────── */}
          {valueEntryMode === 'by_product' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">Products / Services</label>
                <button type="button" onClick={handleAddProduct} className="text-xs text-brand-primary hover:underline font-medium">+ Add line</button>
              </div>
              {products.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">No products added.</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_80px_108px_20px] gap-1.5 px-0.5">
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Product</span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Qty</span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Unit Price/yr</span>
                    <span />
                  </div>
                  {products.map((p, i) => {
                    const cat = getCategoryForProduct(p.product_name);
                    const inConfig = configProducts.some(o => o.value === p.product_name);
                    const allOptions = [...configProducts, ...(!inConfig && p.product_name ? [{ id: -1, value: p.product_name, category_id: null, color: null }] : [])];
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="grid grid-cols-[minmax(0,1fr)_80px_108px_20px] gap-1.5 items-center">
                          <div className="relative">
                            <select value={p.product_name} onChange={e => handleProductChange(i, 'product_name', e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary appearance-none pr-6 truncate">
                              <option value="">— Select —</option>
                              {allOptions.map(o => <option key={o.id} value={o.value}>{o.value}</option>)}
                            </select>
                            <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>
                          <input type="number" min="0" value={p.quantity ?? ''} onChange={e => handleProductChange(i, 'quantity', e.target.value)} placeholder="1" className="border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary" />
                          <input type="number" min="0" step="0.01" value={p.unit_price ?? ''} onChange={e => handleProductChange(i, 'unit_price', e.target.value)} placeholder="0.00" className="border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary" />
                          <button type="button" onClick={() => handleRemoveProduct(i)} className="text-gray-300 hover:text-red-400 transition-colors flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        {cat && <div className="pl-0.5"><span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{cat.value}</span></div>}
                      </div>
                    );
                  })}
                </div>
              )}
              {!showNewProductForm ? (
                <button type="button" onClick={() => setShowNewProductForm(true)} className="mt-2 text-xs text-brand-primary hover:underline font-medium">+ Create new</button>
              ) : (
                <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                  <p className="text-xs font-medium text-gray-700">New product</p>
                  <input type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)} placeholder="Product name" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary" />
                  {configCategories.length > 0 && (
                    <select value={newProductCategoryId} onChange={e => setNewProductCategoryId(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary">
                      <option value="">No category</option>
                      {configCategories.map(c => <option key={c.id} value={c.id}>{c.value}</option>)}
                    </select>
                  )}
                  {createProductError && <p className="text-xs text-red-500">{createProductError}</p>}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleCreateProduct} disabled={creatingProduct} className="px-3 py-1 text-xs font-medium bg-brand-primary text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50">{creatingProduct ? 'Saving…' : 'Create'}</button>
                    <button type="button" onClick={() => { setShowNewProductForm(false); setNewProductName(''); setNewProductCategoryId(''); setCreateProductError(''); }} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Advanced details — Opportunity ID, Deal Type */}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <button type="button" onClick={() => setShowAdvanced(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
              <span className="text-xs font-medium text-gray-600">Advanced details</span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showAdvanced && (
              <div className="px-4 py-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Opportunity ID</label>
                    <input type="text" value={opportunityId} onChange={e => setOpportunityId(e.target.value)} placeholder="CRM reference" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Deal Type</label>
                    <select value={dealType} onChange={e => setDealType(e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes — below Advanced */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Additional context, deal terms, etc." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary resize-none" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={closeDeal} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="px-5 py-2 text-sm font-medium bg-brand-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
            {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Log Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}
