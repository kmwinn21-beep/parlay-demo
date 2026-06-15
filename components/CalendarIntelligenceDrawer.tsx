'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PathToTier } from '@/components/calendar-intelligence/PathToTier';
import { ExecutionComparison } from '@/components/calendar-intelligence/ExecutionComparison';

interface ComponentScores {
  audienceFit: number | null;
  targetOpportunity: number | null;
  commercialPotential: number | null;
  costJustification: number | null;
  strategicValue: number | null;
}

interface DeepScore {
  conferenceId: number;
  conferenceName: string;
  recommendationTier: string;
  calendarRecommendationScore: number | null;
  confidenceLevel: 'high' | 'medium' | 'low';
  componentScores?: ComponentScores | null;
  confidenceMultiplier?: number;
  availableComponentCount?: number;
  maxPossibleScore?: number;
}

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

export function CalendarIntelligenceDrawer({ conferenceId, conferenceName, basicScore, onClose }: Props) {
  const [deepScore, setDeepScore] = useState<DeepScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [pathToTierOpen, setPathToTierOpen] = useState(false);
  const [executionCompOpen, setExecutionCompOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/program-intelligence/calendar-intelligence/${conferenceId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setDeepScore({
            conferenceId: data.conferenceId ?? conferenceId,
            conferenceName: data.conferenceName ?? conferenceName,
            recommendationTier: data.recommendationTier ?? basicScore.tier,
            calendarRecommendationScore: data.calendarRecommendationScore ?? basicScore.score,
            confidenceLevel: data.confidenceLevel ?? basicScore.confidence,
            componentScores: data.componentScores ?? null,
            confidenceMultiplier: data.confidenceMultiplier,
            availableComponentCount: data.availableComponentCount,
            maxPossibleScore: data.maxPossibleScore,
          });
        } else {
          // Fallback to basic score if deep fetch fails
          setDeepScore({
            conferenceId,
            conferenceName,
            recommendationTier: basicScore.tier,
            calendarRecommendationScore: basicScore.score,
            confidenceLevel: basicScore.confidence as 'high' | 'medium' | 'low',
            componentScores: null,
          });
        }
      })
      .catch(() => {
        setDeepScore({
          conferenceId,
          conferenceName,
          recommendationTier: basicScore.tier,
          calendarRecommendationScore: basicScore.score,
          confidenceLevel: basicScore.confidence as 'high' | 'medium' | 'low',
          componentScores: null,
        });
      })
      .finally(() => setLoading(false));
  }, [conferenceId]);

  const isExpanded = pathToTierOpen || executionCompOpen;
  const scoreColor = calendarScoreColor(basicScore.score);
  const tierLabel = TIER_LABELS[basicScore.tier] ?? basicScore.tier;
  const tierClasses = TIER_PILL_CLASSES[basicScore.tier] ?? 'bg-gray-50 text-gray-600 border-gray-200';

  if (!mounted) return null;

  const mainPanel = (
    <div ref={panelRef} className="flex flex-col h-full w-full max-w-[520px] bg-white overflow-hidden" onClick={e => e.stopPropagation()}>
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
            <span className="text-4xl font-bold leading-tight" style={{ color: scoreColor }}>{Math.round(basicScore.score)}</span>
            <span className="text-sm text-gray-400 mb-0.5">/100</span>
          </div>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tierClasses}`}>{tierLabel}</span>
          <p className="text-[11px] text-gray-400 mt-1.5">Confidence: {basicScore.confidence}</p>
          {deepScore && deepScore.availableComponentCount != null && (
            <p className="text-[11px] text-gray-400">Based on {deepScore.availableComponentCount} of 5 components · max possible {deepScore.maxPossibleScore ?? '—'}/100</p>
          )}
        </div>
      </div>

      {/* Tool toggle buttons */}
      <div className="flex-shrink-0 px-5 pb-3 flex gap-2">
        <button
          onClick={() => { setPathToTierOpen(o => !o); setExecutionCompOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            pathToTierOpen
              ? 'bg-brand-secondary text-white border-brand-secondary'
              : 'border-gray-200 text-gray-600 hover:border-gray-400'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Path to Tier
        </button>
        <button
          onClick={() => { setExecutionCompOpen(o => !o); setPathToTierOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            executionCompOpen
              ? 'bg-brand-secondary text-white border-brand-secondary'
              : 'border-gray-200 text-gray-600 hover:border-gray-400'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Execution Comparison
        </button>
      </div>

      <div className="border-t border-gray-100" />

      {/* Score breakdown (scrollable main content) */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin" />
          </div>
        ) : deepScore?.componentScores ? (
          <div className="p-5 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Component Scores</p>
            {([
              { key: 'audienceFit' as const,         label: 'Audience Fit',         weight: 30 },
              { key: 'targetOpportunity' as const,   label: 'Target Opportunity',   weight: 24 },
              { key: 'commercialPotential' as const, label: 'Commercial Potential', weight: 18 },
              { key: 'costJustification' as const,   label: 'Cost Justification',   weight: 18 },
              { key: 'strategicValue' as const,      label: 'Strategic Value',       weight: 10 },
            ]).map(({ key, label, weight }) => {
              const val = deepScore.componentScores?.[key] ?? null;
              const color = calendarScoreColor(val);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                    <span className="text-xs text-gray-400">{val != null ? Math.round(val) : '—'}/100 · {weight}%</span>
                  </div>
                  <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
                    <div className="h-full rounded transition-all" style={{ width: `${val ?? 0}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-5">
            <p className="text-sm text-gray-400">Component-level scores are available after a full scoring run. Basic score shown above.</p>
          </div>
        )}
      </div>
    </div>
  );

  const sidePanelContent = isExpanded ? (
    <div className="flex flex-col bg-white rounded-xl shadow-sm overflow-hidden w-[420px] flex-shrink-0 h-full">
      {/* Side panel header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 flex-shrink-0">
        <h3 className="font-semibold text-gray-900 text-sm">
          {pathToTierOpen ? 'Path to Tier' : 'Execution Comparison'}
        </h3>
        <button
          onClick={() => { setPathToTierOpen(false); setExecutionCompOpen(false); }}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {pathToTierOpen && deepScore ? (
          <PathToTier
            score={{ ...deepScore, componentScores: deepScore.componentScores ?? undefined }}
            conferenceId={conferenceId}
          />
        ) : executionCompOpen && deepScore ? (
          <ExecutionComparison score={deepScore} conferenceId={conferenceId} />
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin" />
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  const content = (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 drawer-overlay" onClick={onClose}>
      {/* Mobile: bottom-up drawer */}
      <div className="md:hidden w-full h-[85vh] absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl overflow-hidden flex flex-col drawer-mobile-responsive" onClick={e => e.stopPropagation()}>
        {mainPanel}
      </div>

      {/* Desktop: side panel(s) sliding in from right */}
      <div
        className="hidden md:flex h-full gap-2 p-2 overflow-x-auto"
        style={{ animation: 'slideInFromRight 200ms ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes slideInFromRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        {sidePanelContent && (
          <div className="h-full">
            {sidePanelContent}
          </div>
        )}
        <div className="h-full w-[520px] flex-shrink-0 overflow-hidden shadow-xl">
          {mainPanel}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
