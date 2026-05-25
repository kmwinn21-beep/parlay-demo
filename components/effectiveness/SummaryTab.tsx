'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EffectivenessData } from '../ConferenceEffectivenessModal';
import { StrategyWeightNotice } from './StrategyWeightNotice';
import { ConferenceRankingsModal } from './ConferenceRankingsModal';

const MAX_GENERATIONS = 4;

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
      // skip
    } else {
      elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }
  return <div className="space-y-1">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
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

const fmt$ = (n: number | null | undefined) => n == null ? '—' : '$' + Math.round(n).toLocaleString();

export function SummaryTab({ data, conferenceId }: { data: EffectivenessData; conferenceId: number }) {
  const { ces, engagement, pipeline } = data;
  const repCESRows = (data.operational.rep_ces ?? []) as Record<string, unknown>[];
  const cesRank = data.operational.conf_efficiency_rank ?? null;
  const cesTotal = data.operational.conf_efficiency_total ?? null;
  const scoreColor = cesScoreColor(ces.score);
  const strategyLabel = (data as any).conference_strategy?.display_name || 'Not set';

  // Pipeline goal data
  const requiredPipelineAmount = (data.operational as any).required_pipeline?.required_pipeline_amount as number | null | undefined;
  const totalPI = Number(pipeline.total_pipeline_influence ?? 0);
  const icpPI = Number(pipeline.icp_pipeline_influence ?? 0);
  const netPI = Number(pipeline.net_new_pipeline_influence ?? 0);
  const hiPI = Number(pipeline.high_engagement_influence ?? 0);

  // Engagement funnel data
  const icpCompaniesTotal = Number(data.audience.icp_coverage.icp_companies_total ?? 0);
  const icpCompaniesEngaged = Number(data.audience.icp_coverage.icp_companies_engaged ?? 0);
  const held = Number(engagement.total_held ?? 0);
  const followupsCreated = Number(engagement.total_followups_created ?? 0);
  const followupsCompleted = Number(engagement.total_followups_completed ?? 0);
  const meetingsWithoutNotes = Number((engagement as any).meetings_held_without_notes ?? 0);

  // Needs attention flags
  const accountTable = ((data as any).marketing_audience?.account_level_table ?? []) as Record<string, unknown>[];
  const noFollowupAfterMeeting = accountTable.filter(
    r => Number(r.meetings_held ?? 0) > 0 && Number(r.followups_created ?? 0) === 0
  ).length;
  const repsBelowAvg = repCESRows.filter(r => Number(r.rep_ces_score ?? 0) < ces.score).length;

  const dims = [
    { label: 'ICP & Target Quality',    value: ces.dim1_icp_target,          weight: '20%', color: DIM_COLORS[0] },
    { label: 'Meeting Execution',        value: ces.dim2_meeting_exec,         weight: '20%', color: DIM_COLORS[1] },
    { label: 'Pipeline Influence Index', value: ces.dim3_pipeline_index,       weight: '30%', color: DIM_COLORS[2] },
    { label: 'Audience Coverage',         value: ces.dim4_breadth,              weight: '5%',  color: DIM_COLORS[3] },
    { label: 'Cost Efficiency',          value: ces.dim7_cost_efficiency ?? 0, weight: '10%', color: DIM_COLORS[4] },
    { label: 'Follow-up Execution',      value: ces.dim5_followup,             weight: '10%', color: DIM_COLORS[5] },
    { label: 'Net-New Engaged',          value: ces.dim6_net_new,              weight: '5%',  color: DIM_COLORS[6] },
  ];

  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [genCount, setGenCount] = useState(0);
  const [showRankings, setShowRankings] = useState(false);

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

  // Pipeline goal progress
  const pipelineGoal = requiredPipelineAmount && requiredPipelineAmount > 0 ? requiredPipelineAmount : null;
  const pipelineProgress = pipelineGoal ? Math.min(Math.round(totalPI / pipelineGoal * 100), 100) : null;
  const pipelineGap = pipelineGoal ? totalPI - pipelineGoal : null;

  return (
    <div className="p-4 sm:p-6 space-y-4">

      {/* ── Row 1: CES Score | Rank | Pipeline vs Goal ── */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_1fr] gap-3">

        {/* CES Score */}
        <div
          className="rounded-xl p-4 flex flex-col justify-between"
          style={{ backgroundColor: scoreColor + '15', borderLeft: `4px solid ${scoreColor}` }}
        >
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Conference Effectiveness Score</div>
          <div>
            <div className="flex items-end gap-1">
              <div className="text-4xl font-bold leading-tight" style={{ color: scoreColor }}>{ces.score}</div>
              <div className="text-sm font-normal text-gray-400 mb-0.5">/100</div>
            </div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: scoreColor }}>{cesScoreGrade(ces.score)}</div>
            <div className="mt-2 text-[11px] text-gray-500">Conference Strategy: {strategyLabel}</div>
            <StrategyWeightNotice
              applied={(data as any).sales_execution?.strategy_modifier_applied || (data as any).marketing_audience?.strategy_modifier_applied || (data as any).operational?.cost_efficiency?.strategy_modifier_applied || (data as any).ces?.strategy_modifier_applied}
              strategyLabel={strategyLabel}
            />
          </div>
        </div>

        {/* Rank badge */}
        {cesRank != null ? (
          <button
            type="button"
            onClick={() => setShowRankings(true)}
            className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center hover:border-brand-secondary hover:bg-blue-50 transition-colors group"
            title="View full rankings"
          >
            <div className="text-xs text-gray-500 font-medium mb-1 group-hover:text-brand-secondary transition-colors">Efficiency Rank</div>
            <div className="text-3xl font-bold text-brand-secondary leading-tight">#{cesRank}</div>
            {cesTotal != null && <div className="text-xs text-gray-400 mt-0.5">of {cesTotal}</div>}
            <div className="text-[10px] text-gray-400 mt-1.5 group-hover:text-brand-secondary transition-colors">View all →</div>
          </button>
        ) : (
          <div className="hidden sm:block" />
        )}

        {/* Pipeline vs Goal */}
        <div className="card p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Pipeline vs Goal</div>
          {pipelineGoal != null ? (
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xl font-bold text-brand-secondary leading-tight">{fmt$(totalPI)}</div>
                  <div className="text-xs text-gray-400">actual influenced</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-600">{fmt$(pipelineGoal)}</div>
                  <div className="text-xs text-gray-400">goal</div>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-2.5 rounded-full transition-all"
                  style={{
                    width: `${pipelineProgress}%`,
                    backgroundColor: pipelineProgress != null && pipelineProgress >= 100 ? '#059669' : pipelineProgress != null && pipelineProgress >= 70 ? '#1B76BC' : '#d97706',
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{pipelineProgress}% of goal</span>
                {pipelineGap != null && (
                  <span className={`font-semibold ${pipelineGap >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {pipelineGap >= 0 ? '+' : ''}{fmt$(pipelineGap)} {pipelineGap >= 0 ? 'surplus' : 'gap'}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-gray-100">
                {[
                  { label: 'ICP', value: fmt$(icpPI), sub: totalPI > 0 ? `${Math.round(icpPI / totalPI * 100)}%` : null },
                  { label: 'Net-New', value: fmt$(netPI), sub: totalPI > 0 ? `${Math.round(netPI / totalPI * 100)}%` : null },
                  { label: 'Multi-Touch', value: fmt$(hiPI), sub: totalPI > 0 ? `${Math.round(hiPI / totalPI * 100)}%` : null },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="text-center">
                    <div className="text-xs font-bold text-gray-700">{value}</div>
                    {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
                    <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <div className="text-xl font-bold text-brand-secondary leading-tight">{fmt$(totalPI)}</div>
                <div className="text-xs text-gray-400">total pipeline influenced</div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-gray-100">
                {[
                  { label: 'ICP', value: fmt$(icpPI), sub: totalPI > 0 ? `${Math.round(icpPI / totalPI * 100)}%` : null },
                  { label: 'Net-New', value: fmt$(netPI), sub: totalPI > 0 ? `${Math.round(netPI / totalPI * 100)}%` : null },
                  { label: 'Multi-Touch', value: fmt$(hiPI), sub: totalPI > 0 ? `${Math.round(hiPI / totalPI * 100)}%` : null },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="text-center">
                    <div className="text-xs font-bold text-gray-700">{value}</div>
                    {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
                    <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 italic">Set a budget goal to track progress.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Score Drivers | Funnel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Score Drivers */}
        <div className="card p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Score Drivers</h3>
          <div className="space-y-3">
            {dims.map(d => (
              <div key={d.label}>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{d.label} <span className="text-gray-300">({d.weight})</span></span>
                  <span className="font-semibold text-gray-700">{Math.round(d.value)}</span>
                </div>
                <ProgressBar value={d.value} color={d.color} />
              </div>
            ))}
          </div>
        </div>

        {/* Engagement Funnel */}
        <div className="card p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-4">Engagement Funnel</h3>
          <div className="space-y-0">
            {[
              { label: 'ICP companies attended', value: icpCompaniesTotal, pct: null, color: '#64748b' },
              { label: 'ICP companies engaged', value: icpCompaniesEngaged, pct: icpCompaniesTotal > 0 ? Math.round(icpCompaniesEngaged / icpCompaniesTotal * 100) : null, color: '#1B76BC' },
              { label: 'Meetings held', value: held, pct: icpCompaniesEngaged > 0 ? Math.round(held / icpCompaniesEngaged * 100) : null, color: '#8b5cf6' },
              { label: 'Follow-ups created', value: followupsCreated, pct: held > 0 ? Math.round(followupsCreated / held * 100) : null, color: '#059669' },
              { label: 'Follow-ups completed', value: followupsCompleted, pct: followupsCreated > 0 ? Math.round(followupsCompleted / followupsCreated * 100) : null, color: '#0891b2' },
            ].map((step, i, arr) => {
              const maxVal = arr[0].value || 1;
              const barPct = Math.min(Math.round(step.value / maxVal * 100), 100);
              return (
                <div key={step.label} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white" style={{ backgroundColor: step.color }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 truncate">{step.label}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <span className="text-xs font-bold text-gray-800">{step.value.toLocaleString()}</span>
                        {step.pct != null && (
                          <span className="text-[10px] text-gray-400">({step.pct}%)</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: step.color + '99' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row 3: Needs Attention | Rep Bar Chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Needs Attention */}
        <div className="card p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Needs Attention</h3>
          {noFollowupAfterMeeting === 0 && meetingsWithoutNotes === 0 && repsBelowAvg === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600 py-4">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">No items flagged — looking good!</span>
            </div>
          ) : (
            <div className="space-y-2">
              {noFollowupAfterMeeting > 0 && (
                <FlagRow
                  color="#d97706"
                  count={noFollowupAfterMeeting}
                  label="companies had meetings with no follow-up created"
                />
              )}
              {meetingsWithoutNotes > 0 && (
                <FlagRow
                  color="#f97316"
                  count={meetingsWithoutNotes}
                  label="meetings held have no notes recorded"
                />
              )}
              {repsBelowAvg > 0 && (
                <FlagRow
                  color="#dc2626"
                  count={repsBelowAvg}
                  label={`rep${repsBelowAvg !== 1 ? 's' : ''} scored below the conference average (${ces.score})`}
                />
              )}
            </div>
          )}
        </div>

        {/* Rep CES Bar Chart */}
        <div className="card p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Effectiveness by Rep</h3>
          {repCESRows.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-2">No rep engagement data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {[...repCESRows]
                .sort((a, b) => Number(b.rep_ces_score ?? 0) - Number(a.rep_ces_score ?? 0))
                .slice(0, 8)
                .map((r, i) => {
                  const score = Number(r.rep_ces_score ?? 0);
                  const color = repCESColor(score);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-24 truncate text-xs text-gray-600 flex-shrink-0 text-right">
                        {String(r.rep ?? '—')}
                      </div>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden relative">
                        <div
                          className="h-4 rounded-full flex items-center justify-end pr-1.5 transition-all"
                          style={{ width: `${score}%`, backgroundColor: color + '30', minWidth: 28 }}
                        />
                        {/* avg line */}
                        <div
                          className="absolute top-0 bottom-0 w-px bg-gray-400 opacity-50"
                          style={{ left: `${ces.score}%` }}
                          title={`Conference avg: ${ces.score}`}
                        />
                      </div>
                      <div className="w-8 text-right flex-shrink-0">
                        <span className="text-xs font-bold" style={{ color }}>{score}</span>
                      </div>
                    </div>
                  );
                })}
              {repCESRows.length > 8 && (
                <p className="text-[11px] text-gray-400">+{repCESRows.length - 8} more in the rep table below</p>
              )}
              <div className="flex items-center gap-1.5 pt-1">
                <div className="w-px h-3 bg-gray-400 opacity-60" />
                <span className="text-[10px] text-gray-400">Vertical line = conference avg ({ces.score})</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Rep Detail Table ── */}
      {repCESRows.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-4">Rep Detail</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-2 py-2 font-semibold text-gray-500">Rep</th>
                  <th className="text-center px-2 py-2 font-semibold text-gray-500" title="ICP & Target Quality">ICP</th>
                  <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Meeting Execution">Mtg</th>
                  <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Pipeline Influence Index">PI</th>
                  <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Audience Coverage">Cov</th>
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
        </div>
      )}

      {/* ── Row 5: AI Executive Summary ── */}
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
                  {regenerationsLeft > 0 ? `${regenerationsLeft} regeneration${regenerationsLeft !== 1 ? 's' : ''} left` : 'Limit reached'}
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

        {genCount === 0 && !summaryLoading && (
          <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
            <div>
              <p className="text-gray-800 font-semibold mb-1">No summary generated yet</p>
              <p className="text-sm text-gray-500 max-w-sm">
                Generate an AI executive narrative synthesizing conference effectiveness, pipeline performance, and engagement insights.
              </p>
            </div>
            {summaryError && <p className="text-sm text-red-600">{summaryError}</p>}
            <button type="button" onClick={generateSummary} className="btn-primary text-sm flex items-center gap-2">
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
            Failed to generate: {summaryError}
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
          metric="ces"
          onClose={() => setShowRankings(false)}
        />
      )}
    </div>
  );
}

function FlagRow({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg" style={{ backgroundColor: color + '12' }}>
      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ backgroundColor: color }}>
        {count}
      </div>
      <div className="text-xs text-gray-700 leading-relaxed pt-0.5">
        <span className="font-semibold" style={{ color }}>{count} </span>
        {label}
      </div>
    </div>
  );
}
