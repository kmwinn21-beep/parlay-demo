'use client';

import { useState, useEffect, useCallback } from 'react';
import { useClosedDealDraft, type ClosedDeal } from '@/lib/ClosedDealDraftContext';

export type { ClosedDeal };

interface ClosedWonDealsSectionProps {
  companyId: number;
  initialDeals?: ClosedDeal[];
  canEdit?: boolean;
}

function formatCurrency(amount: number | null, currency: string): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseAttributedConferences(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

export function ClosedWonDealsSection({ companyId, initialDeals = [], canEdit = true }: ClosedWonDealsSectionProps) {
  const { openDeal } = useClosedDealDraft();
  const [deals, setDeals] = useState<ClosedDeal[]>(initialDeals);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Listen for deals saved via the global modal
  useEffect(() => {
    const handler = (e: Event) => {
      const { companyId: savedCompanyId, deal } = (e as CustomEvent).detail as { companyId: number; deal: ClosedDeal };
      if (savedCompanyId !== companyId) return;
      setDeals(prev => {
        const idx = prev.findIndex(d => d.id === deal.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = deal;
          return next;
        }
        return [deal, ...prev];
      });
    };
    window.addEventListener('closed-deal-saved', handler);
    return () => window.removeEventListener('closed-deal-saved', handler);
  }, [companyId]);

  const handleDelete = async (dealId: number) => {
    setDeletingId(dealId);
    try {
      const res = await fetch(`/api/companies/${companyId}/closed-deals/${dealId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeals(prev => prev.filter(d => d.id !== dealId));
        setDeleteConfirmId(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalAmount = deals.reduce((sum, d) => d.amount != null ? sum + d.amount : sum, 0);
  const hasMixedCurrencies = new Set(deals.filter(d => d.amount != null).map(d => d.currency)).size > 1;
  const primaryCurrency = deals.find(d => d.amount != null)?.currency ?? 'USD';

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-brand-primary font-serif">
          Closed / Won Deals {deals.length > 0 && `(${deals.length})`}
        </h2>
        {canEdit && (
          <button type="button" onClick={() => openDeal(companyId)} className="flex items-center gap-1 text-xs font-medium text-brand-primary hover:opacity-75 transition-opacity">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Deal
          </button>
        )}
      </div>

      {deals.length > 0 && !hasMixedCurrencies && totalAmount > 0 && (
        <div className="mb-3 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
          <p className="text-xs text-gray-500">Total Value</p>
          <p className="text-sm font-semibold text-gray-800">{formatCurrency(totalAmount, primaryCurrency)}</p>
        </div>
      )}

      {deals.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-3">No closed deals logged yet.</p>
      ) : (
        <div className="space-y-2">
          {deals.map(deal => {
            const isExpanded = expandedIds.has(deal.id);
            const isConfirmingDelete = deleteConfirmId === deal.id;
            const isDeleting = deletingId === deal.id;
            const confList = parseAttributedConferences(deal.attributed_conference);

            return (
              <div key={deal.id} className="border border-gray-100 rounded-lg overflow-hidden">
                <button type="button" onClick={() => toggleExpanded(deal.id)} className="w-full flex items-start justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors text-left">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-sm font-medium text-gray-800 truncate">{deal.deal_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-500">{formatDate(deal.close_date)}</span>
                      {deal.amount != null && (
                        <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded px-1.5 py-0.5">{formatCurrency(deal.amount, deal.currency)}</span>
                      )}
                      {deal.products.length > 0 && (
                        <span className="text-xs text-gray-400">{deal.products.length} product{deal.products.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50">
                    {deal.notes && <p className="text-xs text-gray-600 mt-2 mb-2 leading-relaxed">{deal.notes}</p>}

                    {/* Advanced metadata */}
                    {(deal.deal_type || deal.attributed_conference || deal.attribution_type || deal.attributed_rep || deal.contact_signor || deal.opportunity_id) && (
                      <div className="mt-2 mb-2 flex flex-wrap gap-x-4 gap-y-1">
                        {deal.deal_type && <span className="text-xs text-gray-500"><span className="text-gray-400">Type:</span> {deal.deal_type}</span>}
                        {confList.length > 0 && <span className="text-xs text-gray-500"><span className="text-gray-400">Conference{confList.length > 1 ? 's' : ''}:</span> {confList.join(', ')}</span>}
                        {deal.attribution_type && <span className="text-xs text-gray-500"><span className="text-gray-400">Attribution:</span> {deal.attribution_type}</span>}
                        {deal.attributed_rep && <span className="text-xs text-gray-500"><span className="text-gray-400">Rep:</span> {deal.attributed_rep}</span>}
                        {deal.contact_signor && (
                          <span className="text-xs text-gray-500">
                            <span className="text-gray-400">Signor:</span> {deal.contact_signor}
                            {deal.contact_signor_title && <span className="text-gray-400"> ({deal.contact_signor_title})</span>}
                          </span>
                        )}
                        {deal.opportunity_id && <span className="text-xs text-gray-500"><span className="text-gray-400">Opp ID:</span> {deal.opportunity_id}</span>}
                      </div>
                    )}

                    {deal.products.length > 0 && (
                      <div className="mt-2 mb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left font-medium pb-1">Product</th>
                              <th className="text-right font-medium pb-1 w-12">Qty</th>
                              <th className="text-right font-medium pb-1 w-20">Unit Price</th>
                              <th className="text-right font-medium pb-1 w-20">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {deal.products.map((p, i) => (
                              <tr key={i} className="text-gray-700">
                                <td className="py-0.5 pr-2">{p.product_name}</td>
                                <td className="py-0.5 text-right text-gray-500">{p.quantity ?? '—'}</td>
                                <td className="py-0.5 text-right text-gray-500">{p.unit_price != null ? formatCurrency(p.unit_price, deal.currency) : '—'}</td>
                                <td className="py-0.5 text-right font-medium">{p.unit_price != null && p.quantity != null ? formatCurrency(p.unit_price * p.quantity, deal.currency) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {deal.created_by_name && <p className="text-[10px] text-gray-400 mb-2">Logged by {deal.created_by_name}</p>}

                    {canEdit && (
                      <div className="flex items-center gap-3 pt-1">
                        {!isConfirmingDelete ? (
                          <>
                            <button type="button" onClick={() => openDeal(companyId, deal)} className="text-xs text-brand-primary hover:underline font-medium">Edit</button>
                            <button type="button" onClick={() => setDeleteConfirmId(deal.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Delete</button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Delete this deal?</span>
                            <button type="button" onClick={() => handleDelete(deal.id)} disabled={isDeleting} className="text-xs text-red-600 hover:underline font-medium disabled:opacity-50">{isDeleting ? 'Deleting…' : 'Yes, delete'}</button>
                            <button type="button" onClick={() => setDeleteConfirmId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
