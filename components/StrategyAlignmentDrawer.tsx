'use client';

import { useMemo } from 'react';
import { STRATEGY_WEIGHT_PROFILES, DEFAULT_WEIGHTS } from '@/lib/strategyAssessment';

export interface StrategyAlignmentDrawerComponentScores {
  icpOpportunity: number;
  targetAccountOpportunity: number;
  buyerAccess: number;
  relationshipLeverage: number;
  customerPresence: number;
  pipelinePotential: number;
  eventEconomicsFit: number;
}

export interface StrategyAlignmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alignment: 'partial' | 'misaligned';
  selectedStrategy: string;
  recommendedStrategy: string;
  secondaryStrategy?: string | null;
  alignmentMessage: string | null;
  componentScores: StrategyAlignmentDrawerComponentScores;
  scoreWithSelected: number;
  scoreWithRecommended: number;
  /** px offset from the row's left edge (label + score-dash column widths) */
  leftOffsetPx: number;
}

const COMPONENT_LABELS: Record<keyof StrategyAlignmentDrawerComponentScores, string> = {
  icpOpportunity: 'ICP Opportunity',
  targetAccountOpportunity: 'Target Acct. Opp.',
  buyerAccess: 'Buyer Access',
  relationshipLeverage: 'Relationship Leverage',
  customerPresence: 'Customer Presence',
  pipelinePotential: 'Pipeline Potential',
  eventEconomicsFit: 'Event Economics',
};

function scoreBarColor(score: number): string {
  if (score >= 65) return '#059669';
  if (score >= 40) return '#d97706';
  return '#dc2626';
}

export function StrategyAlignmentDrawer({
  isOpen,
  onClose,
  alignment,
  selectedStrategy,
  recommendedStrategy,
  alignmentMessage,
  componentScores,
  scoreWithSelected,
  scoreWithRecommended,
  leftOffsetPx,
}: StrategyAlignmentDrawerProps) {
  // Four components with the largest |weight diff| between the recommended and selected
  // profiles — the signals that most explain why the data points away from the selection.
  const signalComponents = useMemo(() => {
    const recommendedWeights = STRATEGY_WEIGHT_PROFILES[recommendedStrategy] ?? DEFAULT_WEIGHTS;
    const selectedWeights = STRATEGY_WEIGHT_PROFILES[selectedStrategy] ?? DEFAULT_WEIGHTS;
    const keys = Object.keys(componentScores) as (keyof StrategyAlignmentDrawerComponentScores)[];
    return keys
      .map(key => {
        const diff = recommendedWeights[key] - selectedWeights[key];
        const direction: 'up' | 'down' | null = Math.abs(diff) <= 0.02 ? null : diff > 0 ? 'up' : 'down';
        return { key, label: COMPONENT_LABELS[key], score: componentScores[key], absDiff: Math.abs(diff), direction };
      })
      .sort((a, b) => b.absDiff - a.absDiff)
      .slice(0, 4);
  }, [componentScores, recommendedStrategy, selectedStrategy]);

  if (!isOpen) return null;

  const toneHex = alignment === 'partial' ? '#d97706' : '#dc2626';
  const toneBg = alignment === 'partial' ? 'bg-amber-50' : 'bg-red-50';
  const toneText = alignment === 'partial' ? 'text-amber-700' : 'text-red-700';
  const toneBorder = alignment === 'partial' ? 'border-amber-200' : 'border-red-200';

  const fallbackMessage = alignment === 'partial'
    ? `The attendee data suggests a stronger fit with ${recommendedStrategy}. Your selected strategy will still work, but the score reflects a weight profile that may understate this conference's actual opportunity.`
    : `The attendee data does not align with ${selectedStrategy}. The score is being calculated with weights that don't match what this conference's audience is built for.`;

  const improves = scoreWithRecommended > scoreWithSelected;
  const selectedColor = scoreWithSelected >= scoreWithRecommended ? 'text-emerald-600' : 'text-amber-600';
  const recommendedColor = scoreWithRecommended >= scoreWithSelected ? 'text-emerald-600' : 'text-amber-600';

  return (
    <div
      className="absolute bg-white rounded-b-xl shadow-lg overflow-hidden"
      style={{
        top: 0,
        left: leftOffsetPx,
        right: 0,
        minHeight: '100%',
        height: 'auto',
        borderLeft: `0.5px solid ${toneHex}`,
      }}
    >
      {/* Section 1 — Header */}
      <div className={`flex items-center justify-between gap-3 px-4 py-3 ${toneBg}`}>
        <div className={`flex items-center gap-2 text-sm font-semibold ${toneText}`}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {alignment === 'partial' ? 'Partial strategy alignment' : 'Strategy misaligned'}
        </div>
        <button type="button" onClick={onClose} className={`${toneText} hover:opacity-70 transition-opacity flex-shrink-0`} aria-label="Close">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Section 2 — Strategy comparison */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-lg p-3 ${toneBg} border ${toneBorder}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${toneText} mb-1`}>Selected</p>
            <p className={`text-sm font-bold ${toneText}`}>{selectedStrategy}</p>
          </div>
          <div className="rounded-lg p-3 bg-emerald-50 border border-emerald-200">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">Recommended by data</p>
            <p className="text-sm font-bold text-emerald-700">{recommendedStrategy}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{alignmentMessage ?? fallbackMessage}</p>
      </div>

      {/* Section 3 — Component signal bars */}
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-600 mb-2">Why the data recommends {recommendedStrategy}</p>
        <div className="space-y-2">
          {signalComponents.map(c => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-32 flex-shrink-0 truncate">{c.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="h-2 rounded-full" style={{ width: `${c.score}%`, backgroundColor: scoreBarColor(c.score) }} />
              </div>
              <span className="text-xs font-semibold text-gray-600 w-7 text-right flex-shrink-0">{c.score}</span>
              <span className="w-3 flex-shrink-0">
                {c.direction === 'up' && (
                  <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                  </svg>
                )}
                {c.direction === 'down' && (
                  <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4 — Score impact */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Score with {selectedStrategy} weights</span>
            <span className={`font-semibold ${selectedColor}`}>{scoreWithSelected}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Score with {recommendedStrategy} weights</span>
            <span className={`font-semibold ${recommendedColor}`}>{scoreWithRecommended}</span>
          </div>
        </div>
      </div>

      {/* Section 5 — Actionable suggestion */}
      <div className="px-4 py-3">
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs text-blue-700 leading-relaxed">
            Consider updating this conference&apos;s strategy to <span className="font-semibold">{recommendedStrategy}</span> if the attendee profile better matches your goals. Your score would{' '}
            {improves ? <>improve to <span className="font-semibold">{scoreWithRecommended}</span></> : 'remain similar'}.
          </p>
        </div>
      </div>
    </div>
  );
}
