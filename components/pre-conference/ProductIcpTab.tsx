'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRecordDrawer } from './RecordDrawerContext';
import { TargetBtn } from './TargetBtn';
import { formatValuePill, useAvgCostPerUnit } from '@/lib/useAvgCostPerUnit';
import type { TargetEntry } from '../PreConferenceReview';

// ── API response types ─────────────────────────────────────────────────────────

interface ApiAttendee {
  id: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniority: string | null;
  function: string | null;
  buyerRole: string | null;
  functionMatch: { fn: string; level: 'high' | 'med' } | null;
  industryMatch: boolean;
  keywordMatches: string[];
}

interface ApiCompany {
  companyId: number | null;
  companyName: string;
  companyWse: number | null;
  assignedUserNames: string[];
  attendees: ApiAttendee[];
}

interface ApiColumn {
  product: {
    id: number;
    name: string;
    color: string | null;
    categoryId: number | null;
    categoryLabel: string;
    categoryColor: string | null;
    meta: string | null;
  };
  companies: ApiCompany[];
  totalAttendees: number;
  hasBuyerRole: boolean;
}

interface ApiResponse {
  computedAt: string | null;
  columns: ApiColumn[];
}

type BuyerRole = 'decision_maker' | 'influencer' | 'target_title' | null;

// ── Buying committee coverage types ───────────────────────────────────────────

interface BcProduct {
  product_id: number;
  product_name: string;
  buying_committee: { decision_maker: boolean; influencer: boolean; target_title: boolean };
  decision_maker_count: number;
  influencer_count: number;
  target_title_count: number;
  committee_presence: number;
  strength: 'high' | 'moderate' | 'low' | 'none';
  floor_priority: 'high' | 'medium' | 'low' | 'partial' | 'gap';
}

interface BcCoverage {
  total_attendees: number;
  icp_matched: number;
  decision_makers: number;
  target_titles: number;
  products: BcProduct[];
}

// ── Category color palette ─────────────────────────────────────────────────────

const CAT_PALETTE = [
  { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
  { bg: '#F5F3FF', border: '#DDD6FE', text: '#5B21B6' },
  { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
  { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  { bg: '#FFF1F2', border: '#FECDD3', text: '#9F1239' },
  { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
];

function getCatStyle(catLabel: string, catColor: string | null): { bg: string; border: string; text: string } {
  if (catColor) return { bg: `${catColor}18`, border: `${catColor}55`, text: catColor };
  let h = 0;
  for (let i = 0; i < catLabel.length; i++) h = (h * 31 + catLabel.charCodeAt(i)) & 0xffff;
  return CAT_PALETTE[h % CAT_PALETTE.length];
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const BUYER_ROLE_ORDER: Record<string, number> = { decision_maker: 0, influencer: 1, target_title: 2 };

function sortAttendees(attendees: ApiAttendee[], mode: string): ApiAttendee[] {
  return [...attendees].sort((a, b) => {
    if (mode === 'buyer_role') {
      const oa = a.buyerRole ? (BUYER_ROLE_ORDER[a.buyerRole] ?? 3) : 3;
      const ob = b.buyerRole ? (BUYER_ROLE_ORDER[b.buyerRole] ?? 3) : 3;
      if (oa !== ob) return oa - ob;
    }
    if (mode === 'function') {
      const la = a.functionMatch?.level;
      const lb = b.functionMatch?.level;
      const oa = la === 'high' ? 0 : la === 'med' ? 1 : 2;
      const ob = lb === 'high' ? 0 : lb === 'med' ? 1 : 2;
      if (oa !== ob) return oa - ob;
    }
    return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
  });
}

// ── Pill components ────────────────────────────────────────────────────────────

function BuyerRolePill({ role }: { role: BuyerRole }) {
  if (!role) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
        not mapped
      </span>
    );
  }
  const config = {
    decision_maker: { label: 'Decision maker', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
    influencer: { label: 'Influencer', bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
    target_title: { label: 'Target title', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  }[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.text} border ${config.border}`}>
      {config.label}
    </span>
  );
}

function FunctionPill({ fn, level }: { fn: string; level: 'high' | 'med' }) {
  const isHigh = level === 'high';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${isHigh ? 'bg-teal-100 text-teal-700 border border-teal-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
      {fn} — {level}
    </span>
  );
}

function KeywordPill({ keyword }: { keyword: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
      &quot;{keyword}&quot;
    </span>
  );
}

function IndustryPill() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">
      industry match
    </span>
  );
}

function BuyerDot({ role }: { role: BuyerRole }) {
  const color = !role ? '#9CA3AF'
    : role === 'decision_maker' ? '#7C3AED'
    : role === 'influencer' ? '#0D9488'
    : '#D97706';
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: color }} />;
}

// ── AttendeeRow ────────────────────────────────────────────────────────────────

function AttendeeRow({
  attendee,
  company,
  isTarget,
  onToggleTarget,
  readOnly,
}: {
  attendee: ApiAttendee;
  company: ApiCompany;
  isTarget: boolean;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  readOnly: boolean;
}) {
  const openRecord = useRecordDrawer();
  return (
    <div className="flex gap-2 py-1.5 border-t border-gray-50 first:border-t-0">
      <BuyerDot role={attendee.buyerRole as BuyerRole} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => openRecord('attendee', attendee.id)}
            className="font-medium text-xs text-gray-800 hover:text-brand-secondary transition-colors text-left truncate flex-1 min-w-0"
          >
            {attendee.firstName} {attendee.lastName}
          </button>
          <TargetBtn
            isTarget={isTarget}
            disabled={readOnly}
            onClick={() => onToggleTarget({
              attendeeId: attendee.id,
              firstName: attendee.firstName,
              lastName: attendee.lastName,
              title: attendee.title,
              seniority: attendee.seniority,
              companyName: company.companyName,
              companyId: company.companyId ?? null,
              companyWse: company.companyWse,
              assignedUserNames: company.assignedUserNames,
            })}
          />
        </div>
        {attendee.title && (
          <p className="text-[11px] text-gray-400 truncate leading-tight">{attendee.title}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          <BuyerRolePill role={attendee.buyerRole as BuyerRole} />
          {attendee.functionMatch && (
            <FunctionPill fn={attendee.functionMatch.fn} level={attendee.functionMatch.level} />
          )}
          {attendee.industryMatch && <IndustryPill />}
          {attendee.keywordMatches.map(kw => (
            <KeywordPill key={kw} keyword={kw} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CompanyCard ────────────────────────────────────────────────────────────────

function CompanyCard({
  company,
  sortMode,
  avgCostPerUnit,
  targetMap,
  onToggleTarget,
  readOnly,
}: {
  company: ApiCompany;
  sortMode: string;
  avgCostPerUnit: number;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  readOnly: boolean;
}) {
  const openRecord = useRecordDrawer();
  const sorted = sortAttendees(company.attendees, sortMode);
  const valueLabel = formatValuePill(company.companyWse, avgCostPerUnit);
  const allUnmapped = company.attendees.every(
    (a) => !a.buyerRole && !a.functionMatch && !a.industryMatch && a.keywordMatches.length === 0,
  );
  return (
    <div className={`border rounded-xl p-3 bg-white transition-all ${allUnmapped ? 'opacity-60 border-gray-100' : 'border-gray-200 hover:shadow-sm'}`}>
      <div className="mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {company.companyId != null && company.companyId > 0 ? (
            <button
              type="button"
              onClick={() => openRecord('company', company.companyId!)}
              className="font-semibold text-sm text-gray-900 hover:text-brand-secondary transition-colors text-left truncate flex-1 min-w-0"
            >
              {company.companyName}
            </button>
          ) : (
            <span className="font-semibold text-sm text-gray-900 truncate flex-1 min-w-0">{company.companyName || 'Unknown Company'}</span>
          )}
          {valueLabel && (
            <span className="flex-shrink-0 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
              {valueLabel}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {company.attendees.length} {company.attendees.length === 1 ? 'attendee' : 'attendees'}
        </p>
      </div>
      {sorted.map(a => (
        <AttendeeRow
          key={a.id}
          attendee={a}
          company={company}
          isTarget={targetMap.has(a.id)}
          onToggleTarget={onToggleTarget}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

// ── ProductColumn ─────────────────────────────────────────────────────────────

function ProductColumn({
  col,
  sortMode,
  catStyle,
  avgCostPerUnit,
  targetMap,
  onToggleTarget,
  readOnly,
}: {
  col: ApiColumn;
  sortMode: string;
  catStyle: { bg: string; border: string; text: string };
  avgCostPerUnit: number;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  readOnly: boolean;
}) {
  return (
    <div className="flex-shrink-0 w-80 flex flex-col gap-3">
      <div className="rounded-xl px-4 py-3 border" style={{ backgroundColor: catStyle.bg, borderColor: catStyle.border }}>
        <h3 className="font-semibold text-sm" style={{ color: catStyle.text }}>{col.product.name}</h3>
        {col.product.categoryLabel && (
          <p className="text-[11px] mt-0.5 opacity-70" style={{ color: catStyle.text }}>{col.product.categoryLabel}</p>
        )}
        <p className="text-[11px] mt-1 opacity-60" style={{ color: catStyle.text }}>
          {col.companies.length} {col.companies.length === 1 ? 'company' : 'companies'} · {col.totalAttendees} {col.totalAttendees === 1 ? 'attendee' : 'attendees'}
        </p>
      </div>

      {!col.hasBuyerRole && (
        <div className="rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
          No buyer roles resolved —{' '}
          <Link href="/admin?tab=products" className="underline hover:text-amber-900">
            check seniority mapping
          </Link>
        </div>
      )}

      {col.companies.map(company => (
        <CompanyCard
          key={company.companyId ?? `u-${company.companyName}`}
          company={company}
          sortMode={sortMode}
          avgCostPerUnit={avgCostPerUnit}
          targetMap={targetMap}
          onToggleTarget={onToggleTarget}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function ProductIcpTab({
  conferenceId,
  targetMap,
  onToggleTarget,
  readOnly = false,
}: {
  conferenceId: number;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  readOnly?: boolean;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'buyer_role' | 'function' | 'company_name'>('buyer_role');
  const avgCostPerUnit = useAvgCostPerUnit();

  // Buying committee coverage
  const [coverage, setCoverage] = useState<BcCoverage | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/product-icp-signals`);
      if (res.ok) setData(await res.json());
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [conferenceId]);

  const fetchCoverage = useCallback(async () => {
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/buying-committee-coverage`);
      if (res.ok) setCoverage(await res.json());
    } catch { /* non-fatal */ }
  }, [conferenceId]);

  useEffect(() => { fetchSignals(); fetchCoverage(); }, [fetchSignals, fetchCoverage]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/refresh-icp`, { method: 'POST' });
      if (!res.ok) throw new Error('Refresh failed');
      await Promise.all([fetchSignals(), fetchCoverage()]);
      toast.success('Product ICP signals refreshed');
    } catch {
      toast.error('Failed to refresh signals');
    } finally {
      setRefreshing(false);
    }
  }, [conferenceId, fetchSignals, fetchCoverage]);

  const columns = data?.columns ?? [];
  const computedAt = data?.computedAt ?? null;

  const categoryLabels = useMemo(() => {
    const seen = new Set<string>();
    return columns
      .map(col => col.product.categoryLabel)
      .filter(l => { if (seen.has(l)) return false; seen.add(l); return true; });
  }, [columns]);

  const visibleColumns = useMemo(() => (
    categoryFilter ? columns.filter(col => col.product.categoryLabel === categoryFilter) : columns
  ), [columns, categoryFilter]);

  const totalCompanies = useMemo(() => {
    const ids = new Set<number | null>();
    visibleColumns.forEach(col => col.companies.forEach(co => ids.add(co.companyId)));
    return ids.size;
  }, [visibleColumns]);

  const totalAttendees = useMemo(() => {
    const ids = new Set<number>();
    visibleColumns.forEach(col => col.companies.forEach(co => co.attendees.forEach(a => ids.add(a.id))));
    return ids.size;
  }, [visibleColumns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!computedAt) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-gray-500 font-medium text-sm">No product ICP signals computed yet</p>
        <p className="text-gray-400 text-xs mt-1 mb-4">
          Signals are computed after each CSV import, or you can trigger them manually.
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          {refreshing && <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />}
          {refreshing ? 'Computing…' : 'Compute signals now'}
        </button>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-gray-500 font-medium text-sm">No product ICP matches found for this conference</p>
        <p className="text-gray-400 text-xs mt-1 mb-4">Configure products and their function/seniority mappings to see matches here.</p>
        <div className="flex items-center gap-3">
          <Link href="/admin?tab=products" className="text-xs text-brand-secondary hover:underline">
            Configure products in admin settings →
          </Link>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            {refreshing && <span className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />}
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // ── Priority pill helpers ──────────────────────────────────────────────────
  const strengthPill = (s: BcProduct['strength']) => {
    const map = {
      high:     { label: 'High',     style: { background: '#EAF3DE', color: '#27500A' } },
      moderate: { label: 'Moderate', style: { background: '#FAEEDA', color: '#633806' } },
      low:      { label: 'Low',      style: { background: '#FCEBEB', color: '#791F1F' } },
      none:     { label: 'None',     style: { background: '#F1EFE8', color: '#5F5E5A' } },
    };
    const { label, style } = map[s];
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border" style={{ ...style, borderColor: style.color + '44' }}>{label}</span>;
  };

  const floorPill = (p: BcProduct['floor_priority']) => {
    const map = {
      high:    { label: 'High',    style: { background: '#EAF3DE', color: '#0F6E56' } },
      medium:  { label: 'Medium',  style: { background: '#E6F1FB', color: '#0C447C' } },
      low:     { label: 'Low',     style: { background: '#FAEEDA', color: '#633806' } },
      partial: { label: 'Partial', style: { background: '#FAEEDA', color: '#633806' } },
      gap:     { label: 'Gap',     style: { background: '#FCEBEB', color: '#A32D2D' } },
    };
    const { label, style } = map[p];
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border" style={{ ...style, borderColor: style.color + '44' }}>{label}</span>;
  };

  const presenceColor = (pct: number) =>
    pct === 100 ? '#0F6E56' : pct >= 50 ? '#854F0B' : '#A32D2D';

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* ── Buying committee presence ── */}
      {coverage && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-brand-primary">Buying committee presence</h3>

          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total attendees', value: coverage.total_attendees },
              { label: 'ICP matched', value: coverage.icp_matched },
              { label: 'Decision makers', value: coverage.decision_makers },
              { label: 'Target titles', value: coverage.target_titles },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                <p className="text-2xl font-bold text-brand-primary">{value}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Per-product floor priority table */}
          {coverage.products.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left font-semibold text-gray-500 px-4 py-2.5">Product</th>
                      <th className="text-center font-semibold text-gray-500 px-3 py-2.5">DMs</th>
                      <th className="text-center font-semibold px-3 py-2.5" style={{ color: '#6B7280' }}>Influencers</th>
                      <th className="text-center font-semibold text-gray-500 px-3 py-2.5">Target titles</th>
                      <th className="text-center font-semibold text-gray-500 px-3 py-2.5">Committee %</th>
                      <th className="text-center font-semibold text-gray-500 px-3 py-2.5">Strength</th>
                      <th className="text-center font-semibold text-gray-500 px-3 py-2.5">Floor priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.products.map(prod => {
                      const influencerDisabled = !prod.buying_committee.influencer;
                      return (
                        <tr key={prod.product_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{prod.product_name}</td>
                          <td className="px-3 py-2.5 text-center text-gray-700">{prod.decision_maker_count || '—'}</td>
                          <td className="px-3 py-2.5 text-center" style={{ color: influencerDisabled ? '#9CA3AF' : '#374151' }}>
                            {influencerDisabled ? '—' : (prod.influencer_count || '—')}
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-700">{prod.target_title_count || '—'}</td>
                          <td className="px-3 py-2.5 text-center font-semibold tabular-nums" style={{ color: presenceColor(prod.committee_presence) }}>
                            {prod.committee_presence}%
                          </td>
                          <td className="px-3 py-2.5 text-center">{strengthPill(prod.strength)}</td>
                          <td className="px-3 py-2.5 text-center">{floorPill(prod.floor_priority)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Legend */}
              <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Strength:</span>
                  {(['high', 'moderate', 'low', 'none'] as const).map(s => (
                    <span key={s} className="flex items-center gap-1 text-[11px] text-gray-500">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: s === 'high' ? '#27500A' : s === 'moderate' ? '#633806' : s === 'low' ? '#791F1F' : '#9CA3AF' }} />
                      {s === 'high' ? 'High (5+)' : s === 'moderate' ? 'Moderate (2–4)' : s === 'low' ? 'Low (1)' : 'None (0)'}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 w-full">Committee presence = required roles present / roles configured per product in admin settings</p>
              </div>
            </div>
          )}

          <hr className="border-gray-200" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
        {/* Category filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!categoryFilter ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
          >
            All products
          </button>
          {categoryLabels.map(label => (
            <button
              key={label}
              type="button"
              onClick={() => setCategoryFilter(prev => prev === label ? null : label)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${categoryFilter === label ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as typeof sortMode)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-600 ml-auto"
        >
          <option value="buyer_role">Sort: Buyer role</option>
          <option value="function">Sort: Function match</option>
          <option value="company_name">Sort: Company A–Z</option>
        </select>

        {/* Summary + refresh */}
        <p className="text-xs text-gray-400 flex-shrink-0">
          {visibleColumns.length} product{visibleColumns.length !== 1 ? 's' : ''} · {totalCompanies} {totalCompanies === 1 ? 'company' : 'companies'} · {totalAttendees} attendee{totalAttendees !== 1 ? 's' : ''} matched
        </p>

        <div className="flex items-center gap-2 flex-shrink-0">
          {computedAt && (
            <span className="text-[11px] text-gray-400">
              Synced {formatRelativeTime(computedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Recompute product ICP signals"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            {refreshing ? (
              <span className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 items-start">
        {visibleColumns.map(col => (
          <ProductColumn
            key={col.product.id || col.product.name}
            col={col}
            sortMode={sortMode}
            catStyle={getCatStyle(col.product.categoryLabel, col.product.categoryColor)}
            avgCostPerUnit={avgCostPerUnit}
            targetMap={targetMap}
            onToggleTarget={onToggleTarget}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}
