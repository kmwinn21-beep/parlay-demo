'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const HEADER_BG = 'rgb(var(--brand-primary-rgb))';
const HEADER_TEXT = '#ffffff';

interface DealProduct {
  id: number;
  product_name: string;
  quantity: number | null;
  unit_price: number | null;
  sort_order: number;
}

interface Deal {
  id: number;
  company_id: number;
  company_name: string | null;
  deal_name: string;
  close_date: string;
  amount: number | null;
  currency: string;
  attributed_amount: number;
  days_to_close: number | null;
  opportunity_id: string | null;
  deal_type: string | null;
  contact_signor: string | null;
  contact_signor_title: string | null;
  attributed_conference: string | null;
  attribution_type: string | null;
  attribution_pct: number | null;
  attributed_rep: string | null;
  products: DealProduct[];
}

interface Summary {
  total_amount: number;
  total_attributed: number;
  avg_days_to_close: number | null;
}

interface DrawerData {
  conference?: { id: number; name: string; start_date: string; end_date: string; location: string | null; series_name: string | null };
  series?: { id: string; name: string; start_date: string | null; end_date: string | null };
  deals: Deal[];
  summary: Summary;
}

// Conference-level: conferenceId provided
// Series-level: seriesId provided
type ClosedWonTarget =
  | { type: 'conference'; conferenceId: number; conferenceName: string }
  | { type: 'series'; seriesId: string; seriesName: string };

interface Props {
  target: ClosedWonTarget;
  onClose: () => void;
}

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

function fmtDate(d: string) {
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

function parseJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [String(p)];
  } catch { return raw ? [raw] : []; }
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

const ATTR_PILL: Record<string, { bg: string; text: string; border: string }> = {
  'Direct Source': { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  'Influenced':    { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  'Accelerated':   { bg: '#fefce8', text: '#a16207', border: '#fef08a' },
};

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      <div className="text-[12px] text-gray-700 font-medium leading-snug">{children}</div>
    </div>
  );
}

function DealCard({ deal }: { deal: Deal }) {
  const reps = parseJson(deal.attributed_rep);
  const attrConfs = parseJson(deal.attributed_conference);
  const attrPillStyle = deal.attribution_type ? (ATTR_PILL[deal.attribution_type] ?? ATTR_PILL['Influenced']) : ATTR_PILL['Influenced'];

  // Attribution % per conference for this deal
  const attrPct = deal.attribution_pct ?? (deal.attribution_type === 'Direct Source' ? 100 : 50);
  const perConfPct = attrConfs.length > 1 ? Math.round(attrPct / attrConfs.length) : attrPct;
  const showAttrPct = deal.attribution_type && deal.attribution_type !== 'None';

  return (
    <div className="card p-0 overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 leading-tight truncate">{deal.deal_name}</div>
            {deal.company_name && (
              <div className="text-xs text-gray-500 mt-0.5 truncate">{deal.company_name}</div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {deal.amount != null && (
              <span className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                {fmt$(deal.amount)}
              </span>
            )}
            {deal.company_id && (
              <a
                href={`/companies/${deal.company_id}?tab=deals`}
                className="text-gray-400 hover:text-brand-secondary transition-colors"
                title="Open deal"
                onClick={e => e.stopPropagation()}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Primary meta row: Opp ID · Close Date · Attributed Rep */}
      <div className="px-4 py-3 grid grid-cols-3 gap-3 border-b border-gray-50">
        <MetaField label="Deal / Opp ID">
          {deal.opportunity_id ?? <span className="text-gray-400">—</span>}
        </MetaField>
        <MetaField label="Closed/Won Date">
          {deal.close_date ? fmtDate(deal.close_date) : <span className="text-gray-400">—</span>}
        </MetaField>
        <MetaField label="Attributed Rep">
          {reps.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {reps.map(rep => (
                <span key={rep} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 text-[11px] font-medium">
                  <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {getInitials(rep)}
                </span>
              ))}
            </div>
          ) : <span className="text-gray-400">—</span>}
        </MetaField>
      </div>

      {/* Contact / Signor row */}
      <div className="px-4 py-3 border-b border-gray-50">
        <MetaField label="Contact / Signor">
          {deal.contact_signor ? (
            <div>
              <span>{deal.contact_signor}</span>
              {deal.contact_signor_title && (
                <div className="text-[10px] text-gray-400 mt-0.5">{deal.contact_signor_title}</div>
              )}
            </div>
          ) : <span className="text-gray-400">—</span>}
        </MetaField>
      </div>

      {/* Attribution Type · Days to Close */}
      <div className="px-4 py-3 grid grid-cols-2 gap-3 border-b border-gray-50">
        <MetaField label="Attribution Type">
          {deal.attribution_type ? (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border" style={{ background: attrPillStyle.bg, color: attrPillStyle.text, borderColor: attrPillStyle.border }}>
              {deal.attribution_type}
            </span>
          ) : <span className="text-gray-400">—</span>}
        </MetaField>
        <MetaField label="Days to Close">
          {deal.days_to_close != null && deal.days_to_close >= 0
            ? <span>{deal.days_to_close} days</span>
            : <span className="text-gray-400">—</span>}
        </MetaField>
      </div>

      {/* Attributed Conference(s) */}
      <div className="px-4 py-3 border-b border-gray-50">
        <MetaField label="Attributed Conference(s)">
          {attrConfs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {attrConfs.map(c => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                  style={{
                    borderColor: 'rgb(var(--brand-secondary-rgb))',
                    background: 'rgb(var(--brand-secondary-rgb) / 0.1)',
                    color: 'rgb(var(--brand-secondary-rgb))',
                  }}
                >
                  {c}
                  {showAttrPct && (
                    <>
                      <span className="opacity-40 select-none">|</span>
                      <span>{perConfPct}%</span>
                    </>
                  )}
                </span>
              ))}
            </div>
          ) : <span className="text-gray-400">—</span>}
        </MetaField>
      </div>

      {/* Products */}
      {deal.products.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Products</div>
          <div className="flex flex-wrap gap-1.5">
            {deal.products.map(p => (
              <span key={p.id} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-medium border border-gray-200">
                {p.product_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ClosedWonDrawer({ target, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<DrawerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    const url = target.type === 'conference'
      ? `/api/conferences/${target.conferenceId}/closed-deals`
      : `/api/conferences/series/${target.seriesId}/closed-deals`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json(); })
      .then((d: DrawerData) => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [target.type === 'conference' ? target.conferenceId : (target as any).seriesId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }, []);

  const handleChevronClick = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottom) el.scrollTo({ top: 0, behavior: 'smooth' });
    else el.scrollBy({ top: el.clientHeight * 0.75, behavior: 'smooth' });
  }, [atBottom]);

  if (!mounted) return null;

  // Header text
  const isSeries = target.type === 'series';
  const displayName = isSeries
    ? (target as { type: 'series'; seriesName: string }).seriesName
    : (target as { type: 'conference'; conferenceName: string }).conferenceName;

  const conf = data?.conference;
  const series = data?.series;
  const startDate = (conf?.start_date || series?.start_date) ? fmtDate(conf?.start_date ?? series?.start_date ?? '') : '';
  const endDate = (conf?.end_date || series?.end_date) ? fmtDate(conf?.end_date ?? series?.end_date ?? '') : '';
  const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : startDate;
  const location = !isSeries && conf?.location ? conf.location : '';

  const summary = data?.summary;
  const totalAttributedPct = summary && summary.total_amount > 0
    ? Math.round((summary.total_attributed / summary.total_amount) * 100)
    : null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="drawer-mobile-responsive relative flex flex-col bg-white w-full sm:w-[500px] h-[90vh] sm:h-full shadow-2xl rounded-t-2xl sm:rounded-tl-2xl sm:rounded-bl-2xl sm:rounded-tr-none sm:rounded-br-none overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3" style={{ backgroundColor: HEADER_BG }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: `${HEADER_TEXT}99` }}>
                Closed/Won Details
              </p>
              <h2 className="text-sm font-bold leading-tight truncate" style={{ color: HEADER_TEXT }}>{displayName}</h2>
              {(dateRange || location) && (
                <p className="text-[11px] mt-0.5 opacity-60 truncate" style={{ color: HEADER_TEXT }}>
                  {[dateRange, location].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <button
                type="button"
                onClick={() => setStatsOpen(v => !v)}
                className="transition-colors opacity-60 hover:opacity-100"
                style={{ color: HEADER_TEXT }}
                aria-label={statsOpen ? 'Collapse stats' : 'Expand stats'}
              >
                <svg className={`w-4 h-4 transition-transform duration-200 ${statsOpen ? '' : '-rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="transition-colors opacity-60 hover:opacity-100"
                style={{ color: HEADER_TEXT }}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Collapsible stat pills */}
          {statsOpen && summary && (
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              {[
                { label: 'Total C/W', value: fmt$(summary.total_amount) },
                { label: 'Conf. Attributed', value: `${fmt$(summary.total_attributed)}${totalAttributedPct != null ? ` · ${totalAttributedPct}%` : ''}` },
                { label: 'Avg Days to Close', value: summary.avg_days_to_close != null ? `${summary.avg_days_to_close}d` : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border-2 p-2 flex flex-col items-center gap-0.5 min-w-0" style={{ borderColor: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)' }}>
                  <div className="text-sm font-bold leading-tight text-white truncate w-full text-center">{value}</div>
                  <div className="text-[10px] font-semibold text-center leading-tight" style={{ color: 'rgba(255,255,255,0.65)' }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
            <svg className="w-7 h-7 animate-spin text-brand-secondary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-gray-500">Loading closed/won deals…</p>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-red-500 text-center">{error}</p>
          </div>
        )}

        {data && (
          <div className="relative flex-1 min-h-0">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full overflow-y-auto scrollbar-hide"
            >
              {data.deals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
                  <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm text-gray-500">No closed/won deals attributed to this {isSeries ? 'series' : 'conference'}.</p>
                </div>
              ) : (
                <div className="p-4 space-y-4 pb-10">
                  {data.deals.map(deal => <DealCard key={deal.id} deal={deal} />)}
                </div>
              )}
            </div>

            {/* Scroll chevron */}
            {data.deals.length > 0 && (
              <button
                type="button"
                onClick={handleChevronClick}
                className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-2 pt-6 transition-opacity hover:opacity-80"
                style={{ background: 'linear-gradient(to bottom, transparent, white 60%)' }}
                aria-label={atBottom ? 'Scroll to top' : 'Scroll down'}
              >
                <svg
                  className="w-5 h-5 text-gray-400 transition-transform duration-300"
                  style={{ transform: atBottom ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
