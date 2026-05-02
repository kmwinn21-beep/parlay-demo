'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EffectivenessData } from '../ConferenceEffectivenessModal';
import { ConferenceRankingsModal } from './ConferenceRankingsModal';

const MAX_GENERATIONS = 4; // 1 auto + 3 manual

function ProgressBar({ value, max = 100, color = '#1B76BC' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function cesScoreColor(score: number) {
  if (score >= 70) return '#059669';
  if (score >= 50) return '#1B76BC';
  if (score >= 40) return '#d97706';
  if (score >= 25) return '#f97316';
  return '#dc2626';
}

function cesScoreGrade(score: number) {
  if (score >= 70) return 'Strong performance';
  if (score >= 50) return 'Acceptable performance';
  if (score >= 40) return 'Below target';
  if (score >= 25) return 'Weak performance';
  return 'Needs improvement';
}

function repCESColor(score: number) {
  if (score >= 90) return '#059669';
  if (score >= 75) return '#1B76BC';
  if (score >= 60) return '#d97706';
  if (score >= 50) return '#f97316';
  return '#dc2626';
}

const DIM_COLORS = ['#1B76BC', '#10b981', '#8b5cf6', '#0891b2', '#f97316', '#d97706', '#14b8a6'];

// Renders streamed markdown text with basic formatting
function SummaryRenderer({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      elements.push(
        <h4 key={i} className="text-sm font-bold text-brand-primary uppercase tracking-wide mt-5 mb-2 first:mt-0">
          {line.slice(3)}
        </h4>
      );
    } else if (line.startsWith('### ')) {
      elements.push(<h5 key={i} className="text-xs font-bold text-gray-700 mt-3 mb-1">{line.slice(4)}</h5>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const bulletLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        bulletLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 text-sm text-gray-700 my-1.5">
          {bulletLines.map((b, j) => <li key={j}>{renderInline(b)}</li>)}
        </ul>
      );
      continue;
    } else if (line.trim() === '') {
      // skip blank lines (margin is handled by elements themselves)
    } else {
      elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }
  return <div className="space-y-1">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold** inline
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="font-semibold text-gray-800">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

interface DimRow { label: string; value: number; weight: string; }

export function SummaryTab({ data, conferenceId }: { data: EffectivenessData; conferenceId: number }) {
  const { ces, engagement, pipeline } = data;
  const repCESRows = (data.operational.rep_ces ?? []) as Record<string, unknown>[];
  const cesRank = data.operational.conf_efficiency_rank ?? null;
  const cesTotal = data.operational.conf_efficiency_total ?? null;

  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [genCount, setGenCount] = useState(0);
  const [showRankings, setShowRankings] = useState(false);

  const dims: DimRow[] = [
    { label: 'ICP & Target Quality',    value: ces.dim1_icp_target,          weight: '20%' },
    { label: 'Meeting Execution',        value: ces.dim2_meeting_exec,         weight: '20%' },
    { label: 'Pipeline Influence Index', value: ces.dim3_pipeline_index,       weight: '30%' },
    { label: 'Engagement Breadth',       value: ces.dim4_breadth,              weight: '5%'  },
    { label: 'Cost Efficiency',          value: ces.dim7_cost_efficiency ?? 0, weight: '10%' },
    { label: 'Follow-up Execution',      value: ces.dim5_followup,             weight: '10%' },
    { label: 'Net-New Engaged',          value: ces.dim6_net_new,              weight: '5%'  },
  ];

  const fmt$ = (n: number | null | undefined) => n == null ? '—' : '$' + Math.round(n).toLocaleString();
  const totalPI = Number(pipeline.total_pipeline_influence ?? 0);
  const icpPI   = Number(pipeline.icp_pipeline_influence ?? 0);
  const netPI   = Number(pipeline.net_new_pipeline_influence ?? 0);
  const hiPI    = Number(pipeline.high_engagement_influence ?? 0);

  const tgtEngd  = Number(engagement.target_companies_engaged ?? 0);
  const tgtTotal = Number(engagement.targets_total ?? 0);
  const icpEngd  = Number(data.audience.icp_coverage.icp_companies_engaged ?? 0);
  const icpTotal = Number(data.audience.icp_coverage.icp_companies_total ?? 0);
  const held      = Number(engagement.total_held ?? 0);
  const scheduled = Number(engagement.total_scheduled ?? 0);
  const contactsEngaged = Number(engagement.contacts_engaged ?? 0);
  const operatorTotal   = Number(engagement.operator_contacts_total ?? 0);

  const scoreColor = cesScoreColor(ces.score);
  const storageKey = `ces_summary_${conferenceId}`;
  const countKey   = `ces_summary_count_${conferenceId}`;

  const generateSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryText('');
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/effectiveness-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setSummaryText(full);
      }
      const newCount = genCount + 1;
      setGenCount(newCount);
      localStorage.setItem(storageKey, full);
      localStorage.setItem(countKey, String(newCount));
    } catch (err) {
      setSummaryError(String(err));
    } finally {
      setSummaryLoading(false);
    }
  }, [conferenceId, data, genCount, storageKey, countKey]);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    const storedCount = Number(localStorage.getItem(countKey) ?? '0');
    if (stored && storedCount > 0) {
      setSummaryText(stored);
      setGenCount(storedCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRegenerate = genCount < MAX_GENERATIONS && !summaryLoading;
  const regenerationsLeft = Math.max(0, MAX_GENERATIONS - genCount);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Top section: stacked on mobile, 2-col on sm+ */}
      <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3">

        {/* Left col on desktop: CES Score + Rank — each full-width on mobile, side-by-side (2/3 + 1/3) on sm+ */}
        <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-3">
          <div
            className="sm:col-span-2 rounded-xl p-4 flex flex-col justify-between"
            style={{ backgroundColor: scoreColor + '15', borderLeft: `4px solid ${scoreColor}` }}
          >
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Conference Effectiveness Score</div>
            <div>
              <div className="flex items-end gap-1">
                <div className="text-4xl font-bold leading-tight" style={{ color: scoreColor }}>{ces.score}</div>
                <div className="text-sm font-normal text-gray-400 mb-0.5">/100</div>
              </div>
              <div className="text-xs font-semibold mt-0.5" style={{ color: scoreColor }}>{cesScoreGrade(ces.score)}</div>
            </div>
          </div>
          {cesRank != null && (
            <button
              type="button"
              onClick={() => setShowRankings(true)}
              className="sm:col-span-1 rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center hover:border-brand-secondary hover:bg-blue-50 transition-colors group w-full"
              title="View full rankings"
            >
              <div className="text-xs text-gray-500 font-medium mb-1 group-hover:text-brand-secondary transition-colors">Efficiency Rank</div>
              <div className="text-3xl font-bold text-brand-secondary leading-tight">#{cesRank}</div>
              {cesTotal != null && <div className="text-xs text-gray-400 mt-0.5">of {cesTotal} conferences</div>}
              <div className="text-[10px] text-gray-400 mt-1.5 group-hover:text-brand-secondary transition-colors">View all →</div>
            </button>
          )}
        </div>

        {/* Right col on desktop: Pipeline Influence Summary — each sub-card full-width on mobile, 4-col on sm+ */}
        <div className="card p-4 sm:p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Pipeline Influence Summary</h3>
          <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-4 sm:gap-2">
            {[
              { label: 'Total',       value: fmt$(totalPI) },
              { label: 'ICP',         value: fmt$(icpPI),  sub: totalPI > 0 ? `${Math.round(icpPI / totalPI * 100)}%` : null },
              { label: 'Net-New',     value: fmt$(netPI),  sub: totalPI > 0 ? `${Math.round(netPI / totalPI * 100)}%` : null },
              { label: 'Multi-Touch', value: fmt$(hiPI),   sub: totalPI > 0 ? `${Math.round(hiPI / totalPI * 100)}%` : null },
            ].map(({ label, value, sub }) => (
              <div key={label} className="flex sm:flex-col items-center sm:items-center justify-between sm:justify-start rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 sm:p-3 sm:text-center">
                <div className="text-sm font-medium text-gray-600 sm:hidden">{label}</div>
                <div className="text-right sm:text-center">
                  <div className="text-base font-bold text-brand-secondary leading-tight">{value}</div>
                  {sub && <div className="text-xs text-gray-400">{sub} of total</div>}
                  <div className="hidden sm:block text-xs font-medium text-gray-500 mt-0.5">{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: detail cards — stack on mobile, 2 cols on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* [row 2, col 1]: CES Breakdown bars */}
        <div className="card p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Conference Effectiveness Score Breakdown</h3>
          <div className="space-y-3">
            {dims.map((d, i) => (
              <div key={d.label}>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{d.label} <span className="text-gray-300">({d.weight})</span></span>
                  <span className="font-semibold text-gray-700">{Math.round(d.value)}</span>
                </div>
                <ProgressBar value={d.value} color={DIM_COLORS[i]} />
              </div>
            ))}
          </div>
        </div>

        {/* [row 2, col 2]: Effectiveness Score by Rep */}
        <div className="card p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-4">Effectiveness Score by Rep</h3>
          {repCESRows.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No rep engagement data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-2 py-2 font-semibold text-gray-500">Rep</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-500" title="ICP & Target Quality">ICP</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Meeting Execution">Mtg</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Pipeline Influence Index">PI</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Engagement Breadth">Brd</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Cost Efficiency">Cost</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Follow-up Execution">FU</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Net-New Engaged">NN</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-500">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {repCESRows.map((r, i) => {
                    const score = Number(r.rep_ces_score ?? 0);
                    const dim = (key: string) => {
                      const v = r[key];
                      if (v == null) return <span className="text-gray-300">—</span>;
                      return <span className="font-medium text-gray-600">{Math.round(Number(v))}</span>;
                    };
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-2 font-medium text-gray-800 whitespace-nowrap">{String(r.rep ?? '—')}</td>
                        <td className="px-2 py-2 text-center">{dim('rep_dim1_icp_target')}</td>
                        <td className="px-2 py-2 text-center">{dim('rep_dim2_meeting_exec')}</td>
                        <td className="px-2 py-2 text-center">{dim('rep_dim3_pipeline_index')}</td>
                        <td className="px-2 py-2 text-center">{dim('rep_dim4_breadth')}</td>
                        <td className="px-2 py-2 text-center">{dim('rep_dim5_cost_efficiency')}</td>
                        <td className="px-2 py-2 text-center">{dim('rep_dim6_followup')}</td>
                        <td className="px-2 py-2 text-center">{dim('rep_dim7_net_new')}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <span className="font-bold text-sm" style={{ color: repCESColor(score) }}>{score}</span>
                          <span className="text-xs text-gray-400 ml-1">· {String(r.rep_ces_tier ?? '')}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-3 leading-tight">
                ICP = ICP &amp; Target Quality · Mtg = Meeting Execution · PI = Pipeline Influence · Brd = Breadth · Cost = Cost Efficiency · FU = Follow-up · NN = Net-New
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Conference Effectiveness Summary — full width */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Conference Effectiveness Summary</h3>
            <p className="text-xs text-gray-400 mt-0.5">AI-generated executive narrative · powered by Claude</p>
          </div>
          {genCount > 0 && (
            <div className="flex items-center gap-3 flex-shrink-0">
              {!summaryLoading && (
                <span className="text-xs text-gray-400">
                  {regenerationsLeft > 0 ? `${regenerationsLeft} regeneration${regenerationsLeft !== 1 ? 's' : ''} left` : 'Regeneration limit reached'}
                </span>
              )}
              <button
                type="button"
                disabled={!canRegenerate}
                onClick={generateSummary}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-brand-secondary text-brand-secondary hover:bg-blue-50"
              >
                <svg className={`w-3.5 h-3.5 ${summaryLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate
              </button>
            </div>
          )}
        </div>

        {/* Not yet generated — prompt the user to generate */}
        {genCount === 0 && !summaryLoading && (
          <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
            <div>
              <p className="text-gray-800 font-semibold mb-1">No summary generated yet</p>
              <p className="text-sm text-gray-500 max-w-sm">
                Generate an AI executive narrative that synthesizes conference effectiveness data, pipeline performance, and engagement insights.
              </p>
            </div>
            {summaryError && <p className="text-sm text-red-600">{summaryError}</p>}
            <button
              type="button"
              onClick={generateSummary}
              className="btn-primary text-sm flex items-center gap-2"
            >
              Generate Summary
            </button>
          </div>
        )}

        {summaryLoading && summaryText === '' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Generating executive summary…
          </div>
        )}

        {summaryError && genCount > 0 && (
          <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
            Failed to generate summary: {summaryError}
          </div>
        )}

        {summaryText && (
          <div className={`transition-opacity ${summaryLoading ? 'opacity-60' : 'opacity-100'}`}>
            <SummaryRenderer text={summaryText} />
          </div>
        )}
      </div>

      {showRankings && (
        <ConferenceRankingsModal
          title="Conference Efficiency Rankings"
          currentConferenceId={conferenceId}
          onClose={() => setShowRankings(false)}
        />
      )}
    </div>
  );
}
