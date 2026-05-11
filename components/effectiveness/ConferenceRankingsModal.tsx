'use client';

import { useState, useEffect } from 'react';

interface RankedConference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  score: number;
  rank: number | null;
}

interface ConferenceNavRow {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface ConferenceEffectivenessResponse {
  ces?: {
    score?: number | null;
  };
}

function scoreColor(score: number) {
  if (score >= 90) return '#059669';
  if (score >= 75) return '#1B76BC';
  if (score >= 60) return '#d97706';
  if (score >= 50) return '#f97316';
  return '#dc2626';
}

function formatDate(d: string) {
  if (!d) return '';
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch { return d; }
}

interface Props {
  title: string;
  currentConferenceId: number;
  metric: 'ces' | 'sales_execution' | 'audience' | 'cost_efficiency';
  onClose: () => void;
}

export function ConferenceRankingsModal({ title, currentConferenceId, metric, onClose }: Props) {
  const [rows, setRows] = useState<RankedConference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/conferences?nav=1')
      .then(r => { if (!r.ok) throw new Error('Failed to load conferences'); return r.json(); })
      .then(async (conferences: ConferenceNavRow[]) => {
        const scored = await Promise.all((conferences ?? []).map(async (c) => {
          try {
            const res = await fetch(`/api/conferences/${c.id}/effectiveness`);
            if (!res.ok) return null;
            const eff = await res.json() as ConferenceEffectivenessResponse;
            const score = Number(
              metric === 'ces' ? eff?.ces?.score
                : metric === 'sales_execution' ? (eff as any)?.sales_execution?.sales_effectiveness_score
                : metric === 'audience' ? (eff as any)?.marketing_audience?.marketing_audience_signal_score
                : (eff as any)?.operational?.cost_efficiency?.cost_efficiency_score
              ?? 0,
            );
            if (score <= 0) return null;
            return {
              id: c.id,
              name: c.name,
              start_date: c.start_date,
              end_date: c.end_date,
              score,
            };
          } catch {
            return null;
          }
        }));

        const ranked = scored
          .filter((c): c is NonNullable<typeof c> => c !== null)
          .sort((a, b) => b.score - a.score)
          .map((c, idx) => ({ ...c, rank: idx + 1 }));

        setRows(ranked);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [metric]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-brand-primary uppercase tracking-wide">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">All conferences ranked by score</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          )}
          {error && (
            <p className="text-sm text-red-500 text-center py-8">{error}</p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No conferences to rank yet.</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-center px-4 py-2.5 font-semibold text-gray-400 text-xs w-10">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-400 text-xs">Conference</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-gray-400 text-xs">Date</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-400 text-xs">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(conf => {
                  const isCurrent = conf.id === currentConferenceId;
                  return (
                    <tr
                      key={conf.id}
                      className={isCurrent ? 'bg-blue-50' : 'hover:bg-gray-50'}
                    >
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-bold ${isCurrent ? 'text-brand-secondary' : 'text-gray-400'}`}>
                          {conf.rank ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`font-medium ${isCurrent ? 'text-brand-secondary' : 'text-gray-800'}`}>
                          {conf.name}
                        </span>
                        {isCurrent && (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-brand-secondary bg-blue-100 rounded px-1.5 py-0.5">
                            This
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-400">
                        {formatDate(conf.start_date)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {conf.score > 0 ? (
                          <span className="font-bold text-sm" style={{ color: scoreColor(conf.score) }}>
                            {conf.score}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
