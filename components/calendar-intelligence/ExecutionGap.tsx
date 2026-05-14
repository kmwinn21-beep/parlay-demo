'use client';

import { useState, useEffect } from 'react';

interface ComponentScores {
  audienceFit: number | null;
  targetOpportunity: number | null;
  engagementCapture: number | null;
  commercialPotential: number | null;
  costJustification: number | null;
  strategicValue: number | null;
}

interface ScoreRow {
  conferenceId: number;
  conferenceName: string;
  recommendationTier: string;
  componentScores?: ComponentScores | null;
}

interface CESData {
  score: number;
  dim1_icp_target: number;
  dim2_meeting_exec: number;
  dim3_pipeline_index: number;
  dim4_breadth: number;
  dim5_followup: number;
  dim6_net_new: number;
  dim7_cost_efficiency: number;
}

interface Props {
  score: ScoreRow;
  conferenceId: number;
}

const CI_TIER_INFO: Record<string, { label: string; color: string }> = {
  attend_invest_more:          { label: 'Attend & Invest',      color: 'emerald' },
  attend_maintain:             { label: 'Attend & Maintain',    color: 'green' },
  attend_reconsider_format:    { label: 'Reconsider Format',    color: 'amber' },
  evaluate_before_committing:  { label: 'Evaluate First',       color: 'amber' },
  do_not_prioritize:           { label: 'Do Not Prioritize',    color: 'red' },
  remove_from_calendar:        { label: 'Remove from Calendar', color: 'red' },
};

function ciTierInfo(tier: string): { label: string; color: string } {
  return CI_TIER_INFO[tier] ?? { label: tier.replace(/_/g, ' '), color: 'gray' };
}

function cesTierInfo(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Exceptional', color: 'emerald' };
  if (score >= 75) return { label: 'Strong',       color: 'green' };
  if (score >= 60) return { label: 'Acceptable',   color: 'amber' };
  if (score >= 50) return { label: 'Weak',         color: 'orange' };
  return                  { label: 'Inefficient',  color: 'red' };
}

function tierBadgeClasses(color: string): string {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    green:   'bg-green-50 text-green-700 border-green-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    orange:  'bg-orange-50 text-orange-700 border-orange-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    gray:    'bg-gray-50 text-gray-600 border-gray-200',
  };
  return map[color] ?? map.gray;
}

function isPositiveTier(color: string): boolean {
  return color === 'emerald' || color === 'green';
}

function isNegativeTier(color: string): boolean {
  return color === 'red' || color === 'orange';
}

function tierAligned(ciColor: string, cesColor: string): boolean {
  const ciPos = isPositiveTier(ciColor);
  const cesPos = isPositiveTier(cesColor);
  const ciNeg = isNegativeTier(ciColor);
  const cesNeg = isNegativeTier(cesColor);
  return (ciPos && cesPos) || (ciNeg && cesNeg);
}

function gapColor(gap: number): string {
  if (gap > 0) return 'text-green-600';
  if (gap < 0) return 'text-red-600';
  return 'text-gray-500';
}

function gapNote(
  rowKey: string,
  ciScore: number,
  cesScore: number,
  gap: number
): string {
  switch (rowKey) {
    case 'audienceFit':
      if (gap > 15) return `Audience Fit scored ${ciScore} going in — ICP & Target Quality came in at ${cesScore}. Targeting execution delivered beyond the opportunity.`;
      if (gap < -15) return `Audience Fit scored ${ciScore} going in — but ICP & Target Quality came in at ${cesScore}. The right companies were there but targeting broke down in execution.`;
      return 'Audience Fit and ICP & Target Quality are closely aligned — targeting execution matched the opportunity assessment.';
    case 'engagementCapture':
      if (gap > 15) return `Engagement Capture scored ${ciScore} going in — actual meeting execution came in at ${cesScore}. Execution outperformed the opportunity assessment.`;
      if (gap < -15) return `Engagement Capture scored ${ciScore} going in — actual execution was ${cesScore}. Next time, prioritize pre-conference scheduling to convert the attendance opportunity.`;
      return 'Engagement Capture and meeting execution are well-matched — the team extracted close to the expected value from attendance.';
    case 'targetOpportunity':
      if (gap > 15) return `Target Opportunity assessed at ${ciScore} — ICP engagement came in at ${cesScore}. Prioritization drove above-average targeting outcomes.`;
      if (gap < -15) return `Target Opportunity assessed at ${ciScore} — ICP engagement landed at ${cesScore}. Tighten target list preparation before the next event.`;
      return 'Target Opportunity and ICP engagement are well-aligned.';
    case 'commercialPotential':
      if (gap > 15) return `Commercial Potential was ${ciScore} pre-conference — Pipeline Influence landed at ${cesScore}. Deal conversion exceeded the opportunity model.`;
      if (gap < -15) return `Commercial Potential was ${ciScore} pre-conference — Pipeline Influence came in at ${cesScore}. Focus on converting meetings to pipeline more consistently.`;
      return 'Pipeline generation tracked closely with the pre-conference commercial opportunity.';
    case 'costJustification':
      if (gap > 15) return `Cost Justification scored ${ciScore} — post-conference Cost Efficiency landed at ${cesScore}. Spend efficiency outperformed plan.`;
      if (gap < -15) return `Cost Justification scored ${ciScore} — post-conference Cost Efficiency landed at ${cesScore}. Look at reducing non-pipeline spend at the next event.`;
      return 'Cost efficiency aligned with the pre-conference budget model.';
    default:
      return '';
  }
}

interface MappedRow {
  key: string;
  ciLabel: string;
  cesLabel: string;
  ciScore: number;
  cesScore: number;
  gap: number;
}

export function ExecutionGap({ score, conferenceId }: Props) {
  const [ces, setCes] = useState<CESData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/conferences/${conferenceId}/effectiveness`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { ces?: CESData }) => {
        if (data?.ces) {
          setCes(data.ces);
        } else {
          setCes(null);
        }
      })
      .catch(() => { setError(true); setCes(null); })
      .finally(() => setLoading(false));
  }, [conferenceId]);

  const ciTier = ciTierInfo(score.recommendationTier);

  if (loading) {
    return (
      <div className="p-5 space-y-4">
        {/* Tier boxes skeleton */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-16 rounded-lg bg-gray-100 animate-pulse" />
          <div className="text-gray-300 text-lg">→</div>
          <div className="flex-1 h-16 rounded-lg bg-gray-100 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !ces) {
    return (
      <div className="p-5">
        {/* Tier comparison — CI side only */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 rounded-lg border border-gray-100 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Pre-conference (CI)</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${tierBadgeClasses(ciTier.color)}`}>
              {ciTier.label}
            </span>
          </div>
          <span className="text-gray-300 text-lg flex-shrink-0">→</span>
          <div className="flex-1 rounded-lg border border-gray-100 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Post-conference (CES)</p>
            <p className="text-xs text-gray-400">No CES data available for this conference.</p>
          </div>
        </div>
      </div>
    );
  }

  const cesTier = cesTierInfo(ces.score);
  const aligned = tierAligned(ciTier.color, cesTier.color);

  const cs = score.componentScores;

  // Build mapped rows (skip if CI score is null)
  const mappedRows: MappedRow[] = [];

  if (cs?.audienceFit != null) {
    const ci = Math.round(cs.audienceFit);
    const cesVal = Math.round(ces.dim1_icp_target);
    mappedRows.push({ key: 'audienceFit', ciLabel: 'Audience Fit', cesLabel: 'ICP & Target Quality', ciScore: ci, cesScore: cesVal, gap: cesVal - ci });
  }

  if (cs?.engagementCapture != null) {
    const ci = Math.round(cs.engagementCapture);
    const cesVal = Math.round((ces.dim2_meeting_exec + ces.dim4_breadth) / 2);
    mappedRows.push({ key: 'engagementCapture', ciLabel: 'Engagement Capture', cesLabel: 'Meeting Exec + Breadth', ciScore: ci, cesScore: cesVal, gap: cesVal - ci });
  }

  if (cs?.targetOpportunity != null) {
    const ci = Math.round(cs.targetOpportunity);
    const cesVal = Math.round(ces.dim1_icp_target);
    mappedRows.push({ key: 'targetOpportunity', ciLabel: 'Target Opportunity', cesLabel: 'ICP & Target Quality', ciScore: ci, cesScore: cesVal, gap: cesVal - ci });
  }

  if (cs?.commercialPotential != null) {
    const ci = Math.round(cs.commercialPotential);
    const cesVal = Math.round(ces.dim3_pipeline_index);
    mappedRows.push({ key: 'commercialPotential', ciLabel: 'Commercial Potential', cesLabel: 'Pipeline Influence', ciScore: ci, cesScore: cesVal, gap: cesVal - ci });
  }

  if (cs?.costJustification != null) {
    const ci = Math.round(cs.costJustification);
    const cesVal = Math.round(ces.dim7_cost_efficiency);
    mappedRows.push({ key: 'costJustification', ciLabel: 'Cost Justification', cesLabel: 'Cost Efficiency', ciScore: ci, cesScore: cesVal, gap: cesVal - ci });
  }

  // Find largest gap
  let biggestGap: MappedRow | null = null;
  for (const row of mappedRows) {
    if (!biggestGap || Math.abs(row.gap) > Math.abs(biggestGap.gap)) {
      biggestGap = row;
    }
  }

  return (
    <div className="p-5 space-y-5">
      {/* Tier comparison */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Pre-conference (CI)</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${tierBadgeClasses(ciTier.color)}`}>
              {ciTier.label}
            </span>
          </div>
          <span className="text-gray-400 text-lg flex-shrink-0">→</span>
          <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Post-conference (CES)</p>
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${tierBadgeClasses(cesTier.color)}`}>
                {cesTier.label}
              </span>
              <span className="text-xs font-bold text-gray-500">{ces.score}</span>
            </div>
          </div>
        </div>
        {aligned
          ? <p className="text-xs text-gray-400">✓ Tiers aligned</p>
          : <p className="text-xs text-amber-600 font-medium">⚠ Execution diverged from prediction</p>
        }
      </div>

      {/* Component gap analysis */}
      {mappedRows.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Component Gap Analysis</h4>
          <div className="space-y-4">
            {mappedRows.map((row) => (
              <div key={row.key} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700">{row.ciLabel}</p>
                    <p className="text-lg font-bold text-gray-900">{row.ciScore}</p>
                  </div>
                  <div className="flex flex-col items-center flex-shrink-0 px-2">
                    <span className={`text-xs font-bold ${gapColor(row.gap)}`}>
                      {row.gap > 0 ? `+${row.gap}` : row.gap}
                    </span>
                    <span className="text-gray-300 text-sm">→</span>
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-xs font-semibold text-gray-700">{row.cesLabel}</p>
                    <p className="text-lg font-bold text-gray-900">{row.cesScore}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {gapNote(row.key, row.ciScore, row.cesScore, row.gap)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary sentence */}
      {biggestGap && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            Parlay recommended <span className="font-semibold">{ciTier.label}</span> — actual performance was <span className="font-semibold">{cesTier.label}</span>. The biggest execution gap was <span className="font-semibold">{biggestGap.ciLabel}</span>.
          </p>
        </div>
      )}
    </div>
  );
}
