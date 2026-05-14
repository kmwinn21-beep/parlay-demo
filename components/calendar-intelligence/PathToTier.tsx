'use client';

import { useState } from 'react';

interface ComponentScores {
  audienceFit: number | null;
  targetOpportunity: number | null;
  commercialPotential: number | null;
  costJustification: number | null;
  strategicValue: number | null;
}

interface Props {
  score: {
    calendarRecommendationScore: number | null;
    componentScores?: ComponentScores;
    confidenceMultiplier?: number;
  };
  conferenceId: number;
}

type TargetTier = 'attend_invest_more' | 'attend_maintain';

const TIER_REQUIREMENTS: Record<TargetTier, Partial<Record<keyof ComponentScores, number>> & { overallScore: number }> = {
  attend_invest_more: { overallScore: 85, audienceFit: 75, targetOpportunity: 75, costJustification: 60 },
  attend_maintain:    { overallScore: 70, audienceFit: 65, targetOpportunity: 60 },
};

const COMPONENT_LABELS: Record<keyof ComponentScores, string> = {
  audienceFit:        'Audience Fit',
  targetOpportunity:  'Target Opportunity',
  commercialPotential:'Commercial Potential',
  costJustification:  'Cost Justification',
  strategicValue:     'Strategic Value',
};

const COMPONENT_WEIGHTS: Record<keyof ComponentScores, number> = {
  audienceFit: 30,
  targetOpportunity: 24,
  commercialPotential: 18,
  costJustification: 18,
  strategicValue: 10,
};

const IMPROVEMENT_NOTES: Record<keyof ComponentScores, string> = {
  audienceFit: 'More ICP-matching companies in the attendee list, or a higher buyer access score.',
  targetOpportunity: 'More high-priority companies need a recommended action; increase the actionable rate among scored companies.',
  commercialPotential: 'Increase projected pipeline by assigning more targets or raising WSE values.',
  costJustification: 'Reduce conference cost or increase projected pipeline conversion.',
  strategicValue: 'Improve relationship leverage scores by increasing rep coverage and prior engagement.',
};

function computeWhatIfScore(
  currentScores: ComponentScores,
  componentKey: keyof ComponentScores,
  targetValue: number,
): number {
  const updated = { ...currentScores, [componentKey]: targetValue };
  const keys = Object.keys(updated) as (keyof ComponentScores)[];
  const available = keys.filter(k => updated[k] != null);
  const totalWeight = available.reduce((s, k) => s + COMPONENT_WEIGHTS[k], 0);
  if (totalWeight === 0) return 0;
  const weightedSum = available.reduce((s, k) => s + (updated[k]! * COMPONENT_WEIGHTS[k]), 0);
  return Math.round((weightedSum / totalWeight) * (totalWeight / 100) * 100);
}

export function PathToTier({ score, conferenceId: _conferenceId }: Props) {
  const [targetTier, setTargetTier] = useState<TargetTier>('attend_invest_more');
  const cs = score.componentScores ?? {
    audienceFit: null, targetOpportunity: null,
    commercialPotential: null, costJustification: null, strategicValue: null,
  };
  const requirements = TIER_REQUIREMENTS[targetTier];

  type GapItem = { key: keyof ComponentScores; label: string; current: number | null; required: number; gap: number; note: string; whatIfScore: number };
  const gaps: GapItem[] = [];

  for (const [key, required] of Object.entries(requirements) as [string, number][]) {
    if (key === 'overallScore') continue;
    const k = key as keyof ComponentScores;
    const current = cs[k];
    const gap = required - (current ?? 0);
    if (gap > 0) {
      gaps.push({
        key: k,
        label: COMPONENT_LABELS[k],
        current,
        required,
        gap,
        note: IMPROVEMENT_NOTES[k],
        whatIfScore: computeWhatIfScore(cs, k, required),
      });
    }
  }
  gaps.sort((a, b) => b.gap - a.gap);

  const overallGap = requirements.overallScore - (score.calendarRecommendationScore ?? 0);
  const alreadyMeetsOverall = overallGap <= 0;
  const alreadyMeetsAll = gaps.length === 0 && alreadyMeetsOverall;

  return (
    <div className="p-5 space-y-5">
      {/* Target tier selector */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Target Tier</p>
        <div className="flex gap-2">
          {(['attend_invest_more', 'attend_maintain'] as TargetTier[]).map(t => (
            <button
              key={t}
              onClick={() => setTargetTier(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${targetTier === t ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 text-gray-600 hover:border-emerald-500'}`}
            >
              {t === 'attend_invest_more' ? 'Attend & Invest More' : 'Attend & Maintain'}
            </button>
          ))}
        </div>
      </div>

      {/* Overall gap */}
      <div className={`rounded-lg p-3 border ${alreadyMeetsAll ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <p className="text-sm font-semibold text-gray-800 mb-1">Overall Score</p>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-bold text-gray-900">{score.calendarRecommendationScore ?? '—'}/100</span>
          <span className="text-gray-500">→ need</span>
          <span className="font-bold text-gray-900">{requirements.overallScore}/100</span>
          {alreadyMeetsOverall
            ? <span className="text-emerald-600 font-medium">✓ Met</span>
            : <span className="text-amber-700 font-medium">+{overallGap} points needed</span>
          }
        </div>
      </div>

      {/* Component gaps */}
      {alreadyMeetsAll ? (
        <div className="text-center py-6">
          <div className="text-2xl mb-2">🎯</div>
          <p className="font-semibold text-emerald-700">All thresholds met!</p>
          <p className="text-sm text-gray-500 mt-1">This conference already qualifies for the {targetTier === 'attend_invest_more' ? 'Attend & Invest' : 'Attend & Maintain'} tier.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Component Gaps</p>
          {gaps.length === 0 && !alreadyMeetsOverall && (
            <p className="text-sm text-gray-500">All individual components meet their thresholds, but the overall score needs {overallGap} more points.</p>
          )}
          {gaps.map(g => (
            <div key={g.key} className="border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-sm text-gray-800">{g.label}</p>
                <span className="text-xs text-red-600 font-semibold flex-shrink-0">Gap: +{Math.round(g.gap)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm mb-2">
                <span className="text-gray-500">Current: <strong>{g.current != null ? Math.round(g.current) : '—'}</strong></span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-500">Need: <strong>{g.required}</strong></span>
              </div>
              <div className="h-1.5 rounded bg-gray-100 overflow-hidden mb-2">
                <div className="h-full bg-brand-secondary rounded" style={{ width: `${Math.min(g.current ?? 0, 100)}%` }} />
                <div className="h-full bg-emerald-500 rounded -mt-1.5 opacity-30" style={{ width: `${g.required}%` }} />
              </div>
              <p className="text-xs text-gray-500 mb-2">{g.note}</p>
              <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">
                If {g.label} reaches {g.required}, overall score becomes <strong>{g.whatIfScore}</strong>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
