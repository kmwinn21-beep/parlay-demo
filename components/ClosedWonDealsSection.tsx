'use client';

import { useState, useEffect } from 'react';
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

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function attributedAmount(deal: ClosedDeal): number {
  if (deal.amount == null) return 0;
  if (!deal.attribution_type || deal.attribution_type === 'None') return 0;
  if (deal.attribution_type === 'Direct Source') return deal.amount;
  // Influenced / Accelerated
  return deal.amount * ((deal.attribution_pct ?? 50) / 100);
}

const ATTRIBUTION_PILL: Record<string, string> = {
  'Direct Source': 'bg-green-50 text-green-700 border-green-200',
  'Influenced': 'bg-blue-50 text-blue-700 border-blue-200',
  'Accelerated': 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

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

  // Summary calculations
  const dealsWithAmount = deals.filter(d => d.amount != null);
  const hasMixedCurrencies = new Set(dealsWithAmount.map(d => d.currency)).size > 1;
  const primaryCurrency = dealsWithAmount[0]?.currency ?? 'USD';
  const totalAmount = dealsWithAmount.reduce((sum, d) => sum + d.amount!, 0);
  const totalAttributed = deals.reduce((sum, d) => sum + attributedAmount(d), 0);

  // Unique attributed conference names across all deals
  const allAttributedConferences = Array.from(
    new Set(deals.flatMap(d => parseJsonArray(d.attributed_conference)))
  ).filter(Boolean);

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

      {/* Summary cards row */}
      {deals.length > 0 && !hasMixedCurrencies && (
        <div
          className="flex gap-2 mb-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' } as React.CSSProperties}
        >
          {/* Deals count */}
          <div className="flex-shrink-0 px-3 py-2 bg-green-50 border border-green-100 rounded-lg min-w-[72px] text-center">
            <p className="text-xs text-gray-500 whitespace-nowrap">Deals</p>
            <p className="text-sm font-semibold text-gray-800">{deals.length}</p>
          </div>

          {/* Total Value */}
          {totalAmount > 0 && (
            <div className="flex-shrink-0 px-3 py-2 bg-green-50 border border-green-100 rounded-lg min-w-[90px] text-center">
              <p className="text-xs text-gray-500 whitespace-nowrap">Total Value</p>
              <p className="text-sm font-semibold text-gray-800">{formatCurrency(totalAmount, primaryCurrency)}</p>
            </div>
          )}

          {/* Attributed */}
          {totalAttributed > 0 && (
            <div className="flex-shrink-0 px-3 py-2 bg-green-50 border border-green-100 rounded-lg min-w-[90px] text-center">
              <p className="text-xs text-gray-500 whitespace-nowrap">Attributed</p>
              <p className="text-sm font-semibold text-gray-800">{formatCurrency(totalAttributed, primaryCurrency)}</p>
            </div>
          )}
        </div>
      )}

      {/* Attributed conferences pill row */}
      {allAttributedConferences.length > 0 && (
        <div
          className="flex gap-1.5 flex-wrap mb-3"
        >
          {allAttributedConferences.map(conf => (
            <span key={conf} className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-medium">
              {conf}
            </span>
          ))}
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
            const confList = parseJsonArray(deal.attributed_conference);
            const repList = parseJsonArray(deal.attributed_rep);

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

                    {/* Metadata rows */}
                    <div className="mt-2 mb-2 space-y-1.5">
                      {/* Attribution type */}
                      {deal.attribution_type && deal.attribution_type !== 'None' && (() => {
                        const cls = ATTRIBUTION_PILL[deal.attribution_type] ?? 'bg-gray-50 text-gray-600 border-gray-200';
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 flex-shrink-0">Attribution Type:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
                              {deal.attribution_type}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Rep pills */}
                      {repList.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400 flex-shrink-0">Rep(s):</span>
                          {repList.map(rep => (
                            <span key={rep} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 text-xs font-medium">
                              <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {getInitials(rep)}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Signor */}
                      {deal.contact_signor && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">Signor:</span>
                          <span className="text-xs text-gray-600">{deal.contact_signor}{deal.contact_signor_title && <span className="text-gray-400"> ({deal.contact_signor_title})</span>}</span>
                        </div>
                      )}

                      {/* Other metadata */}
                      {(deal.deal_type || deal.opportunity_id) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {deal.deal_type && <span className="text-xs text-gray-500"><span className="text-gray-400">Type:</span> {deal.deal_type}</span>}
                          {deal.opportunity_id && <span className="text-xs text-gray-500"><span className="text-gray-400">Opp ID:</span> {deal.opportunity_id}</span>}
                        </div>
                      )}
                    </div>

                    {/* Products table */}
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

                    {/* Attribution breakdown — Influenced or Accelerated only */}
                    {confList.length > 0 && deal.attribution_type && deal.attribution_type !== 'None' && deal.attribution_type !== 'Direct Source' && (
                      <div className="mt-2 mb-3">
                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Attribution</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left font-medium pb-1">Conference</th>
                              <th className="text-right font-medium pb-1 w-10">%</th>
                              <th className="text-right font-medium pb-1 w-24">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {confList.map((conf, ci) => {
                              const totalPct = deal.attribution_pct ?? 50;
                              const perConfPct = totalPct / confList.length;
                              const perConfAmt = deal.amount != null ? deal.amount * (perConfPct / 100) : null;
                              return (
                                <tr key={ci} className="text-gray-700">
                                  <td className="py-1 pr-2">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-medium">{conf}</span>
                                  </td>
                                  <td className="py-1 text-right text-gray-500">{Math.round(perConfPct * 10) / 10}%</td>
                                  <td className="py-1 text-right">
                                    {perConfAmt != null ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100 text-[11px] font-medium">{formatCurrency(perConfAmt, deal.currency)}</span>
                                    ) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
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
