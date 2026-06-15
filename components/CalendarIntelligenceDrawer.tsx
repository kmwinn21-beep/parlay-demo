'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PathToTier } from '@/components/calendar-intelligence/PathToTier';
import { ExecutionComparison } from '@/components/calendar-intelligence/ExecutionComparison';
import { type CalendarConferenceRow } from '@/lib/calendarIntelligenceStore';

interface Props {
  conferenceId: number;
  conferenceName: string;
  basicScore: { score: number; tier: string; confidence: string };
  onClose: () => void;
}

const TIER_LABELS: Record<string, string> = {
  attend_invest_more:         'Attend & Invest More',
  attend_maintain:            'Attend & Maintain',
  attend_reconsider_format:   'Reconsider Format',
  evaluate_before_committing: 'Evaluate First',
  do_not_prioritize:          'Do Not Prioritize',
  remove_from_calendar:       'Remove from Calendar',
};

function calendarScoreColor(score: number | null): string {
  if (score == null) return '#9ca3af';
  if (score >= 85) return '#059669';
  if (score >= 70) return '#0d9488';
  if (score >= 55) return '#d97706';
  if (score >= 40) return '#f97316';
  return '#dc2626';
}

const TIER_PILL_CLASSES: Record<string, string> = {
  attend_invest_more:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  attend_maintain:            'bg-emerald-50 text-emerald-600 border-emerald-100',
  attend_reconsider_format:   'bg-amber-50 text-amber-700 border-amber-200',
  evaluate_before_committing: 'bg-amber-50 text-amber-700 border-amber-200',
  remove_from_calendar:       'bg-red-50 text-red-700 border-red-200',
  do_not_prioritize:          'bg-red-50 text-red-600 border-red-100',
};

// Builds the same component cards as ScoreDrawerContent in the Cal Intel page
function ScoreComponentCards({ row }: { row: CalendarConferenceRow }) {
  const cs = row.componentScores;
  const d = row.diagnostics ?? {};
  const te = d.targetingEngine;
  const cp = d.commercialPotential;
  const bud = d.budget;
  const W = { audienceFit: 30, targetOpportunity: 24, commercialPotential: 18, costJustification: 18, strategicValue: 10 };

  const projectedPipeline = Number(cp?.projected_pipeline ?? 0);
  const realisticPipeline = Number(cp?.realistic_pipeline ?? 0);
  const reqPipeline = Number(bud?.required_pipeline_amount ?? 0);
  const reqMultiple = Number(bud?.required_pipeline_multiple ?? 5);
  const teBenchmarks = te != null ? (te.isLargeConference ? { must: '15%', high: '30%', worth: '25%' } : { must: '10%', high: '20%', worth: '20%' }) : null;
  const teActionableRate = te != null && te.totalScoredCompanies > 0
    ? (te.actionableCount / te.totalScoredCompanies * 100).toFixed(0) + '%'
    : null;

  const components: { key: string; score: number | null; weight: number; unavailable?: string; bullets: string[] }[] = [
    {
      key: 'Audience Fit',
      score: cs?.audienceFit ?? null,
      weight: W.audienceFit,
      bullets: [
        `${row.icpCompanies} ICP companies out of ${row.totalCompanies} total (${row.icpDensityPct.toFixed(1)}% density — benchmark 15%)`,
        ...(te != null ? [`Avg buyer access score: ${te.avgBuyerAccessScore.toFixed(0)}/100`] : []),
      ],
    },
    {
      key: 'Target Opportunity',
      score: cs?.targetOpportunity ?? null,
      weight: W.targetOpportunity,
      unavailable: te == null ? 'Prospect company type not configured.' : undefined,
      bullets: te != null ? [
        `${te.totalScoredCompanies} companies scored`,
        `Must Target: ${te.mustTargetCount} (benchmark ${teBenchmarks!.must})`,
        `High Priority: ${te.highPriorityCount} (benchmark ${teBenchmarks!.high})`,
        `Worth Engaging: ${te.worthEngagingCount} (benchmark ${teBenchmarks!.worth})`,
        `Actionable rate: ${teActionableRate}`,
      ] : ['Target scoring not run.', 'Ensure the prospect company type is configured.'],
    },
    {
      key: 'Commercial Potential',
      score: cs?.commercialPotential ?? null,
      weight: W.commercialPotential,
      unavailable: cp == null ? 'Commercial inputs unavailable.' : undefined,
      bullets: cp != null ? [
        `Available pipeline: $${projectedPipeline.toLocaleString()}`,
        ...(realisticPipeline > 0 ? [`Realistic pipeline: $${realisticPipeline.toLocaleString()}`] : []),
        ...(reqPipeline > 0 ? [
          `Required: $${reqPipeline.toLocaleString()}`,
          `Total Coverage: ${((projectedPipeline / reqPipeline) * 100).toFixed(0)}%`,
          ...(realisticPipeline > 0 ? [`Realistic Coverage: ${((realisticPipeline / reqPipeline) * 100).toFixed(0)}%`] : []),
        ] : ['No budget entered.']),
      ] : ['No target WSE or avg cost data available.'],
    },
    {
      key: 'Cost Justification',
      score: cs?.costJustification ?? null,
      weight: W.costJustification,
      unavailable: bud == null ? 'No budget data available.' : undefined,
      bullets: bud != null ? [
        `Required pipeline: $${reqPipeline.toLocaleString()}`,
        `Required ROI multiple: ${reqMultiple}x`,
        ...(cp != null && reqPipeline > 0 ? [
          `Attainable Pipeline: $${realisticPipeline > 0 ? realisticPipeline.toLocaleString() : projectedPipeline.toLocaleString()} (${(((realisticPipeline > 0 ? realisticPipeline : projectedPipeline) / reqPipeline) * 100).toFixed(0)}%)`,
        ] : []),
      ] : ['Budget not entered.', 'Add budget in conference settings. This would add up to 18 points to your score.'],
    },
    {
      key: 'Strategic Value',
      score: cs?.strategicValue ?? null,
      weight: W.strategicValue,
      unavailable: te == null ? 'Prospect company type not configured.' : undefined,
      bullets: (() => {
        const sv = d.strategicValue;
        if (!sv) return ['Prospect company type not configured.', 'This would add up to 10 points to your score.'];
        return [
          `Avg relationship leverage: ${sv.base_score}/100 (across ${sv.total_scored} prospect companies)`,
          `Companies with internal relationships: ${sv.internal_rel_count}`,
          `Companies with prior engagement: ${sv.prior_engagement_count}`,
          `Known prospects attending: ${sv.known_prospect_count}`,
          sv.client_count > 0 ? `Clients attending: ${sv.client_count} ↩ retention/expansion signal` : 'Clients attending: 0',
          sv.has_competitor ? `Competitor presence: Yes (+${sv.competitor_bonus} pts applied)` : 'Competitor presence: No',
        ];
      })(),
    },
  ];

  return (
    <div className="space-y-3">
      {components.map((c) => (
        <div key={c.key} className="border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className={`font-semibold text-sm ${c.score == null ? 'text-gray-400' : 'text-gray-800'}`}>{c.key}</p>
            <p className="text-xs text-gray-500">
              {c.score == null ? '—' : Math.round(c.score)}/100 · {c.weight}%
              {c.score == null ? ' — not scored' : ''}
            </p>
          </div>
          <div className="mt-2 h-1.5 rounded bg-gray-100 overflow-hidden">
            <div className="h-full rounded" style={{ width: `${c.score ?? 0}%`, backgroundColor: calendarScoreColor(c.score) }} />
          </div>
          {c.score == null && c.unavailable && (
            <p className="text-xs text-gray-400 mt-1.5">{c.unavailable}</p>
          )}
          <ul className="list-disc pl-4 mt-2 text-xs text-gray-500 space-y-0.5">
            {c.bullets.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Scrollable overlay panel with chevron indicators (same as Cal Intel page OverlayPanel)
function OverlayPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative flex flex-col bg-white rounded-xl shadow-sm overflow-hidden ${className ?? ''}`}>
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {children}
      </div>
    </div>
  );
}

export function CalendarIntelligenceDrawer({ conferenceId, conferenceName, basicScore, onClose }: Props) {
  const [deepRow, setDeepRow] = useState<CalendarConferenceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [pathToTierOpen, setPathToTierOpen] = useState(false);
  const [executionCompOpen, setExecutionCompOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/program-intelligence/calendar-intelligence/${conferenceId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        const conf = data?.conference ?? null;
        if (conf) setDeepRow(conf);
      })
      .catch(() => { /* silently fall back to basic score display */ })
      .finally(() => setLoading(false));
  }, [conferenceId]);

  const displayScore = deepRow?.calendarRecommendationScore ?? basicScore.score;
  const displayTier = deepRow?.recommendationTier ?? basicScore.tier;
  const displayConfidence = deepRow?.confidenceLevel ?? basicScore.confidence;
  const scoreColor = calendarScoreColor(displayScore);
  const tierLabel = TIER_LABELS[displayTier] ?? displayTier;
  const tierClasses = TIER_PILL_CLASSES[displayTier] ?? 'bg-gray-50 text-gray-600 border-gray-200';
  const anyToolOpen = pathToTierOpen || executionCompOpen;

  if (!mounted) return null;

  // ── Main panel content ────────────────────────────────────────────────────────
  const mainPanelContent = (
    <>
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 py-4 flex items-start justify-between gap-3"
        style={{ background: 'rgb(var(--brand-primary-rgb))' }}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-0.5">Cal. Intelligence</p>
          <h2 className="text-base font-bold text-white leading-snug truncate" title={conferenceName}>{conferenceName}</h2>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 mt-0.5 text-white/70 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Score card */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3">
        <div className="rounded-xl p-4" style={{ backgroundColor: scoreColor + '15', borderLeft: `4px solid ${scoreColor}` }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">Calendar Score</p>
          <div className="flex items-end gap-2 mb-1">
            <span className="text-4xl font-bold leading-tight" style={{ color: scoreColor }}>
              {loading ? '…' : Math.round(displayScore)}
            </span>
            <span className="text-sm text-gray-400 mb-0.5">/100</span>
          </div>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tierClasses}`}>{tierLabel}</span>
          <p className="text-[11px] text-gray-400 mt-1.5">Confidence: {displayConfidence}</p>
          {deepRow && deepRow.availableComponentCount != null && (
            <p className="text-[11px] text-gray-400">
              Based on {deepRow.availableComponentCount} of 5 components · max possible {deepRow.maxPossibleScore ?? '—'}/100
            </p>
          )}
        </div>
      </div>

      {/* Tool toggle buttons — both independently togglable */}
      <div className="flex-shrink-0 px-5 pb-3 flex gap-2">
        <button
          onClick={() => setPathToTierOpen(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            pathToTierOpen
              ? 'bg-brand-secondary text-white border-brand-secondary'
              : 'border-gray-200 text-gray-600 hover:border-brand-secondary hover:text-brand-secondary'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          Path to Tier
        </button>
        <button
          onClick={() => setExecutionCompOpen(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            executionCompOpen
              ? 'bg-teal-600 text-white border-teal-600'
              : 'border-gray-200 text-gray-600 hover:border-teal-600 hover:text-teal-600'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Execution Comparison
        </button>
      </div>

      <div className="border-t border-gray-100 flex-shrink-0" />

      {/* Score breakdown (scrollable) */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin" />
          </div>
        ) : deepRow?.componentScores ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">Score Breakdown</p>
            <ScoreComponentCards row={deepRow} />
          </>
        ) : (
          <p className="text-sm text-gray-400">Component-level scores are available after a full scoring run.</p>
        )}
      </div>
    </>
  );

  // ── Portal content ────────────────────────────────────────────────────────────
  const content = anyToolOpen ? (
    // Full-screen overlay with panels side by side (same pattern as Cal Intel page)
    <div className="fixed inset-0 z-50 flex bg-black/50" onClick={onClose}>
      <div className="flex h-full w-full gap-3 p-3 overflow-x-auto" onClick={e => e.stopPropagation()}>
        {/* Main score panel */}
        <OverlayPanel className="w-[480px] flex-shrink-0 flex flex-col">
          {mainPanelContent}
        </OverlayPanel>

        {/* Path to Tier panel */}
        {pathToTierOpen && deepRow && (
          <OverlayPanel className="w-[420px] flex-shrink-0">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-gray-900 text-sm">Path to Tier</h3>
              <button onClick={() => setPathToTierOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <PathToTier
              score={{ ...deepRow, componentScores: deepRow.componentScores ?? undefined }}
              conferenceId={conferenceId}
            />
          </OverlayPanel>
        )}

        {/* Execution Comparison panel */}
        {executionCompOpen && deepRow && (
          <OverlayPanel className="w-[420px] flex-shrink-0">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-gray-900 text-sm">Execution Comparison</h3>
              <button onClick={() => setExecutionCompOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ExecutionComparison score={deepRow} conferenceId={conferenceId} />
          </OverlayPanel>
        )}
      </div>
    </div>
  ) : (
    // Normal right-panel drawer (no tool open)
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      {/* Mobile: bottom-up */}
      <div
        className="md:hidden w-full h-[85vh] absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {mainPanelContent}
      </div>

      {/* Desktop: slide in from right */}
      <div
        className="hidden md:flex flex-col h-full w-[480px] bg-white rounded-l-xl overflow-hidden shadow-xl"
        style={{ animation: 'slideInFromRight 200ms ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes slideInFromRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        {mainPanelContent}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
