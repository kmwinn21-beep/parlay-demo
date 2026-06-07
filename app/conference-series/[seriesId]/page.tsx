'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { SeriesYoYData, ConferenceYoYRow } from '@/lib/get-series-yoy-data';

type TabKey = 'program-intelligence';

function cesTier(score: number): string {
  if (score >= 90) return 'Exceptional';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Acceptable';
  if (score >= 50) return 'Weak';
  return 'Inefficient';
}

function cesTierColor(score: number): string {
  if (score >= 90) return 'text-green-700';
  if (score >= 75) return 'text-blue-700';
  if (score >= 60) return 'text-amber-700';
  if (score >= 50) return 'text-orange-700';
  return 'text-red-700';
}

function fmtPct(val: number | null): string {
  if (val == null) return '—';
  return (val * 100).toFixed(1) + '%';
}

function fmtMoney(val: number | null): string {
  if (val == null) return '—';
  if (Math.abs(val) >= 1_000_000) return '$' + (val / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(val) >= 1_000) return '$' + (val / 1_000).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
}

function fmtNum(val: number | null): string {
  if (val == null) return '—';
  return val.toFixed(0);
}

function fmtScore(val: number | null): string {
  if (val == null) return '—';
  return Math.round(val).toString();
}

function computeStats(instances: ConferenceYoYRow[]) {
  const withSnapshot = instances.filter(i => i.hasSnapshot);
  if (withSnapshot.length === 0) return null;

  const first = withSnapshot[0];
  const last = withSnapshot[withSnapshot.length - 1];

  const latestCes = last.cesScore;
  const cesTrend = first.cesScore != null && last.cesScore != null && withSnapshot.length > 1
    ? last.cesScore - first.cesScore
    : null;

  let cagr: number | null = null;
  if (
    withSnapshot.length > 1 &&
    first.pipelineInfluenced != null && first.pipelineInfluenced > 0 &&
    last.pipelineInfluenced != null && last.pipelineInfluenced > 0
  ) {
    const n = withSnapshot.length;
    cagr = ((last.pipelineInfluenced / first.pipelineInfluenced) ** (1 / (n - 1)) - 1) * 100;
  }

  return { latestCes, cesTrend, cagr, latestPipelinePerK: last.pipelinePerK };
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function SeriesDetailPage() {
  const params = useParams();
  const seriesId = params?.seriesId as string;

  const [activeTab] = useState<TabKey>('program-intelligence');
  const [data, setData] = useState<SeriesYoYData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ refreshed: number } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [refreshErrors, setRefreshErrors] = useState<{ conferenceId: number; error: string }[]>([]);

  useEffect(() => {
    if (!seriesId) return;
    setLoading(true);
    setError('');
    fetch(`/api/conferences/series/${seriesId}/yoy`)
      .then(res => {
        if (!res.ok) return res.json().then(e => Promise.reject(e.error ?? 'Failed to load'));
        return res.json();
      })
      .then((d: SeriesYoYData) => setData(d))
      .catch(e => setError(typeof e === 'string' ? e : 'Failed to load YoY data'))
      .finally(() => setLoading(false));
  }, [seriesId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    setRefreshErrors([]);
    try {
      const res = await fetch(`/api/conferences/series/${seriesId}/yoy/refresh`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Refresh failed');
      setData(result.data);
      setRefreshResult({ refreshed: result.refreshed });
      if (result.errors?.length > 0) setRefreshErrors(result.errors);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const stats = data ? computeStats(data.instances) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/program-intelligence" className="hover:text-gray-700">Program Intelligence</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{data?.seriesName ?? 'Series'}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-serif">{data?.seriesName ?? '—'}</h1>
          <div className="flex flex-wrap gap-3 mt-1">
            {data?.industryFocus && (
              <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5">{data.industryFocus}</span>
            )}
            {data?.conferenceType && (
              <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5">{data.conferenceType}</span>
            )}
            {data && (
              <span className="text-xs text-gray-400">{data.instanceCount} conference{data.instanceCount !== 1 ? 's' : ''} · {data.instancesWithSnapshots} with snapshots</span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            className="py-3 px-1 text-sm font-medium border-b-2 border-brand-secondary text-brand-secondary"
          >
            Program Intelligence
          </button>
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'program-intelligence' && (
        <div className="space-y-6">
          {/* Refresh button row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div />
            <div className="flex items-center gap-3">
              {refreshResult && (
                <span className="text-sm text-green-700">Updated {refreshResult.refreshed} snapshot{refreshResult.refreshed !== 1 ? 's' : ''}</span>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                {refreshing ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Refreshing…
                  </>
                ) : 'Refresh snapshots'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600 py-6">{error}</div>
          ) : !data || data.instancesWithSnapshots === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-10 text-center space-y-2">
              <p className="text-gray-700 font-medium">No snapshot data yet for this series.</p>
              <p className="text-sm text-gray-500">
                Snapshots are computed automatically when a conference closes,<br />
                or you can compute them manually from the ops panel.
              </p>
            </div>
          ) : (
            <>
              {/* Summary stat row */}
              {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    label="Latest CES"
                    value={
                      stats.latestCes != null ? (
                        <span className={cesTierColor(stats.latestCes)}>{Math.round(stats.latestCes)}</span>
                      ) : '—'
                    }
                    sub={stats.latestCes != null ? cesTier(stats.latestCes) : undefined}
                  />
                  <StatCard
                    label="CES Trend"
                    value={
                      stats.cesTrend != null ? (
                        <span className={stats.cesTrend >= 0 ? 'text-green-700' : 'text-red-700'}>
                          {stats.cesTrend >= 0 ? '↑' : '↓'}{Math.abs(Math.round(stats.cesTrend))}
                        </span>
                      ) : '—'
                    }
                    sub="first → latest"
                  />
                  <StatCard
                    label="Pipeline CAGR"
                    value={
                      stats.cagr != null ? (
                        <span className={stats.cagr >= 0 ? 'text-green-700' : 'text-red-700'}>
                          {stats.cagr >= 0 ? '+' : ''}{stats.cagr.toFixed(1)}%
                        </span>
                      ) : '—'
                    }
                    sub="compound annual growth"
                  />
                  <StatCard
                    label="Pipeline per $1K (latest)"
                    value={stats.latestPipelinePerK != null ? fmtMoney(stats.latestPipelinePerK * 1000) : '—'}
                    sub="pipeline per $1K spend"
                  />
                </div>
              )}

              {/* YoY data table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Year</th>
                        <th className="text-right px-4 py-3 font-medium whitespace-nowrap">CES</th>
                        <th className="text-right px-4 py-3 font-medium whitespace-nowrap">Cost eff.</th>
                        <th className="text-right px-4 py-3 font-medium whitespace-nowrap">Total cost</th>
                        <th className="text-right px-4 py-3 font-medium whitespace-nowrap">Pipeline</th>
                        <th className="text-right px-4 py-3 font-medium whitespace-nowrap">Net-new</th>
                        <th className="text-right px-4 py-3 font-medium whitespace-nowrap">Continued</th>
                        <th className="text-right px-4 py-3 font-medium whitespace-nowrap">ICP engaged</th>
                        <th className="text-right px-4 py-3 font-medium whitespace-nowrap">Hold rate</th>
                        <th className="text-right px-4 py-3 font-medium whitespace-nowrap">Follow-up %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.instances.map((row, idx) => {
                        const isLatest = idx === data.instances.length - 1;
                        const dimmed = !row.hasSnapshot;
                        const cellCls = dimmed ? 'text-gray-300' : 'text-gray-900';
                        return (
                          <tr
                            key={row.conferenceId}
                            className={isLatest ? 'bg-blue-50/50' : 'hover:bg-gray-50'}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${isLatest ? 'text-blue-700' : 'text-gray-900'}`}>
                                  {row.year || '—'}
                                </span>
                                <span className="text-xs text-gray-400 hidden sm:inline">{row.conferenceName}</span>
                                {!row.hasSnapshot && (
                                  <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                                    No snapshot
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums font-medium ${dimmed ? 'text-gray-300' : cesTierColor(row.cesScore ?? 0)}`}>
                              {dimmed ? '—' : fmtScore(row.cesScore)}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${cellCls}`}>
                              {dimmed ? '—' : fmtScore(row.costEfficiencyScore)}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${cellCls}`}>
                              {dimmed ? '—' : fmtMoney(row.totalCost)}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${cellCls}`}>
                              {dimmed ? '—' : fmtMoney(row.pipelineInfluenced)}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${cellCls}`}>
                              {dimmed ? '—' : fmtMoney(row.pipelineNetNew)}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${cellCls}`}>
                              {dimmed ? '—' : fmtMoney(row.pipelineContinuedEngagement)}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${cellCls}`}>
                              {dimmed ? '—' : fmtNum(row.icpCompaniesEngaged)}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${cellCls}`}>
                              {dimmed ? '—' : fmtPct(row.meetingHoldRate)}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${cellCls}`}>
                              {dimmed ? '—' : fmtPct(row.followupCompletionRate)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Refresh errors */}
              {refreshErrors.length > 0 && (
                <div className="text-sm">
                  <button
                    onClick={() => setShowErrors(v => !v)}
                    className="text-red-600 underline text-xs"
                  >
                    {showErrors ? 'Hide' : 'Show'} {refreshErrors.length} error{refreshErrors.length !== 1 ? 's' : ''}
                  </button>
                  {showErrors && (
                    <ul className="mt-2 space-y-1">
                      {refreshErrors.map(e => (
                        <li key={e.conferenceId} className="text-xs text-red-600">
                          Conference {e.conferenceId}: {e.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
