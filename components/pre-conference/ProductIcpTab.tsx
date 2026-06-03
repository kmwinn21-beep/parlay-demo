'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { TargetEntry } from '../PreConferenceReview';

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

// ── Pill helpers ──────────────────────────────────────────────────────────────

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

// ── Main export ────────────────────────────────────────────────────────────────

export function ProductIcpTab({
  conferenceId,
}: {
  conferenceId: number;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  readOnly?: boolean;
}) {
  const [coverage, setCoverage] = useState<BcCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCoverage = useCallback(async () => {
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/buying-committee-coverage`);
      if (res.ok) setCoverage(await res.json());
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [conferenceId]);

  useEffect(() => { fetchCoverage(); }, [fetchCoverage]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/refresh-icp`, { method: 'POST' });
      if (!res.ok) throw new Error('Refresh failed');
      await fetchCoverage();
      toast.success('Product ICP signals refreshed');
    } catch {
      toast.error('Failed to refresh signals');
    } finally {
      setRefreshing(false);
    }
  }, [conferenceId, fetchCoverage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!coverage) {
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

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-primary">Buying committee presence</h3>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
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

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total attendees',  value: coverage.total_attendees },
          { label: 'ICP matched',      value: coverage.icp_matched },
          { label: 'Decision makers',  value: coverage.decision_makers },
          { label: 'Target titles',    value: coverage.target_titles },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-2xl font-bold text-brand-primary">{value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Per-product floor priority table */}
      {coverage.products.length > 0 ? (
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
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No product ICP matches found for this conference.</p>
          <p className="text-xs text-gray-400 mt-1">Configure products and their function/seniority mappings in admin settings, then refresh.</p>
        </div>
      )}
    </div>
  );
}
