'use client';

import { useState, useEffect, useMemo } from 'react';
import { TargetBtn } from './TargetBtn';
import { useRecordDrawer } from './RecordDrawerContext';
import type { LandscapeData, TargetEntry, ClientCompanyEntry, ByRepEntry, IcpCompany, RelationshipRow } from '../PreConferenceReview';
import type { StrategyAssessment } from '@/lib/strategyAssessment';
import { useAvgCostPerUnit } from '@/lib/useAvgCostPerUnit';

// ─── Shared helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return '#059669';
  if (score >= 60) return '#1B76BC';
  if (score >= 45) return '#d97706';
  return '#dc2626';
}

function componentTierLabel(score: number): string {
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Good';
  if (score >= 45) return 'Moderate';
  return 'Weak';
}

function fmtDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// ─── Pipeline Reality popover bar chart ────────────────────────────────────────

function PipelineBarChart({ realistic, required }: { realistic: number; required: number | null }) {
  const max = Math.max(realistic, required ?? 0, 1);
  const realisticPct = Math.min((realistic / max) * 100, 100);
  const requiredPct = required ? Math.min((required / max) * 100, 100) : 100;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-500 font-medium">Realistic Goal</span>
          <span className="font-bold text-brand-secondary">{fmtDollars(realistic)}</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-3 rounded-full bg-brand-secondary" style={{ width: `${realisticPct}%` }} />
        </div>
      </div>
      {required != null && (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500 font-medium">Required Pipeline</span>
            <span className="font-bold text-gray-600">{fmtDollars(required)}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-3 rounded-full bg-gray-300" style={{ width: `${requiredPct}%` }} />
          </div>
        </div>
      )}
      {required != null && (
        <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">
          Coverage: <span className="font-semibold text-gray-600">{Math.min(Math.round((realistic / required) * 1000) / 10, 100).toFixed(1)}%</span> of required pipeline is realistically achievable.
        </p>
      )}
    </div>
  );
}

// ─── Score Fit Card (mirrors Sales Effectiveness Score card) ───────────────────

function StrategyFitScoreCard({ sa }: { sa: StrategyAssessment }) {
  const color = scoreColor(sa.strategyFitScore);
  const components: [string, number, string][] = [
    ['ICP Opportunity', sa.icpOpportunityScore, '20%'],
    ['Target Account Opp.', sa.targetAccountOpportunityScore, '20%'],
    ['Buyer Access', sa.buyerAccessScore, '15%'],
    ['Relationship Leverage', sa.relationshipLeverageScore, '15%'],
    ['Customer Presence', sa.customerPresenceScore, '10%'],
    ['Pipeline Potential', sa.pipelinePotentialScore, '15%'],
    ['Event Economics', sa.eventEconomicsFitScore, '5%'],
  ];

  return (
    <div
      className="rounded-xl p-4 flex flex-col w-full"
      style={{ backgroundColor: color + '15', borderLeft: `4px solid ${color}` }}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
        Pre-Conference Strategy Score
      </div>
      <div className="flex items-end gap-1 mt-1">
        <div className="text-4xl font-bold" style={{ color }}>{sa.strategyFitScore}</div>
        <div className="text-sm text-gray-400 mb-0.5">/100</div>
      </div>
      <div className="text-xs font-semibold mb-3" style={{ color }}>{sa.strategyFitInterpretation}</div>

      <div className="mt-auto pt-3 border-t space-y-1.5" style={{ borderColor: color + '33' }}>
        {components.map(([label, score, weight]) => (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-gray-500">
              {label} <span className="text-gray-300">({weight})</span>
            </span>
            <span className="font-semibold" style={{ color: scoreColor(score) }}>
              {score} <span className="text-gray-400">· {componentTierLabel(score)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recommended Strategy card (brand Primary #1) ──────────────────────────────

function PrimaryStrategyCard({ sa }: { sa: StrategyAssessment }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col w-full"
      style={{
        borderLeft: '4px solid rgb(var(--brand-primary-rgb))',
        backgroundColor: 'rgb(var(--brand-primary-rgb) / 0.08)',
      }}
    >
      <div
        className="text-xs font-bold uppercase tracking-wide mb-1"
        style={{ color: 'rgb(var(--brand-primary-rgb) / 0.6)' }}
      >
        Recommended Strategy
      </div>
      <div
        className="text-base font-bold leading-tight"
        style={{ color: 'rgb(var(--brand-primary-rgb))' }}
      >
        {sa.primaryStrategy}
      </div>

      {sa.primaryStrategyReasons.length > 0 && (
        <>
          <div
            className="mt-3 pt-3 border-t"
            style={{ borderColor: 'rgb(var(--brand-primary-rgb) / 0.15)' }}
          />
          <ul className="space-y-1.5 -mt-1">
            {sa.primaryStrategyReasons.map((r, i) => (
              <li key={i} className="flex gap-1.5 text-xs" style={{ color: 'rgb(var(--brand-primary-rgb) / 0.8)' }}>
                <span className="mt-0.5 flex-shrink-0">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── Secondary Strategy card (gray, rank-card style) ──────────────────────────

function SecondaryStrategyCard({ sa }: { sa: StrategyAssessment }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col w-full">
      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
        Secondary Strategy
      </div>
      {sa.secondaryStrategy ? (
        <>
          <div className="text-base font-bold text-brand-secondary leading-tight">
            {sa.secondaryStrategy}
          </div>
          {sa.secondaryStrategyReasons.length > 0 && (
            <>
              <div className="mt-3 pt-3 border-t border-gray-200" />
              <ul className="space-y-1.5 -mt-1">
                {sa.secondaryStrategyReasons.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-gray-600">
                    <span className="mt-0.5 flex-shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <div className="text-sm text-gray-400">No secondary strategy identified.</div>
      )}
    </div>
  );
}

// ─── Shared pill ──────────────────────────────────────────────────────────────

function FitScorePill({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
      style={{ color, backgroundColor: color + '18' }}
    >
      {score}
    </span>
  );
}

// ─── Combined actions panel (right 2 cols) ────────────────────────────────────

function ActionsPanel({ sa }: { sa: StrategyAssessment }) {
  const [showChart, setShowChart] = useState(false);
  const isCovered = sa.currentRepCount >= sa.recommendedRepMin;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3 h-full">
      {/* Pipeline Reality */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Pipeline Reality</div>
          <button
            onClick={() => setShowChart(v => !v)}
            className="text-gray-400 hover:text-brand-secondary transition-colors"
            title="View pipeline bar chart"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        {showChart ? (
          <PipelineBarChart realistic={sa.realisticPipelineGoal} required={sa.requiredPipeline} />
        ) : (
          <div className="flex gap-4 text-xs">
            <div>
              <div className="text-gray-400">Realistic Goal</div>
              <div className="font-bold text-brand-secondary">{fmtDollars(sa.realisticPipelineGoal)}</div>
            </div>
            {sa.requiredPipeline != null && (
              <div>
                <div className="text-gray-400">Required</div>
                <div className="font-semibold text-gray-600">{fmtDollars(sa.requiredPipeline)}</div>
              </div>
            )}
            <div>
              <div className="text-gray-400">Coverage</div>
              <div className="font-semibold text-gray-700">{sa.pipelineCoverageRate.toFixed(1)}%</div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100" />

      {/* Hosted Event */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-0.5">Hosted Event</div>
          <div className="text-xs font-semibold text-gray-800">{sa.hostedEventRecommendation}</div>
        </div>
        <FitScorePill score={sa.hostedEventFitScore} />
      </div>

      <div className="border-t border-gray-100" />

      {/* Sponsorship */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-0.5">Sponsorship</div>
          <div className="text-xs font-semibold text-gray-800">{sa.sponsorshipRecommendation}</div>
        </div>
        <FitScorePill score={sa.sponsorshipFitScore} />
      </div>

      <div className="border-t border-gray-100" />

      {/* Staffing */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-0.5">Staffing</div>
          <div className="text-xs font-semibold text-gray-800">
            {sa.recommendedRepMin}–{sa.recommendedRepMax} reps recommended
          </div>
          <div className="text-xs text-gray-400">Current: {sa.currentRepCount} rep{sa.currentRepCount !== 1 ? 's' : ''}</div>
          {!isCovered && (
            <div className="text-xs text-amber-600 font-medium mt-0.5">
              Coverage gap: add {sa.recommendedRepMin - sa.currentRepCount}–{sa.recommendedRepMax - sa.currentRepCount} more
            </div>
          )}
        </div>
        {isCovered ? (
          <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Full section ──────────────────────────────────────────────────────────────

function StrategyAssessmentSection({ sa }: { sa: StrategyAssessment }) {
  return (
    <div className="pb-2 border-b border-gray-100 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 items-stretch">
        {/* Score card — 2 cols */}
        <div className="lg:col-span-2 flex">
          <StrategyFitScoreCard sa={sa} />
        </div>
        {/* Recommended Strategy — 1 col */}
        <div className="lg:col-span-1 flex">
          <PrimaryStrategyCard sa={sa} />
        </div>
        {/* Secondary Strategy — 1 col */}
        <div className="lg:col-span-1 flex">
          <SecondaryStrategyCard sa={sa} />
        </div>
        {/* Actions panel — 2 cols */}
        <div className="lg:col-span-2">
          <ActionsPanel sa={sa} />
        </div>
      </div>
    </div>
  );
}

// ─── Existing landscape helpers ────────────────────────────────────────────────

function BarChart({ items, total, colorClass }: { items: { label: string; count: number }[]; total: number; colorClass: string }) {
  if (items.length === 0) return <p className="text-sm text-gray-400">No data</p>;
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-28 truncate flex-shrink-0">{item.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className={`h-2 rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-gray-500 w-10 text-right flex-shrink-0">{item.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function UserPill({ name }: { name: string }) {
  return (
    <span className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-blue-100 text-blue-800 border border-blue-300">
      <svg className="w-3 h-3 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {name}
    </span>
  );
}

const NAMED_COLORS: Record<string, string> = {
  red: '#dc2626', blue: '#1d4ed8', green: '#16a34a', yellow: '#ca8a04',
  orange: '#ea580c', purple: '#9333ea', pink: '#db2777', gray: '#6b7280',
};

function hexAlpha(hex: string, alpha: number): string {
  const resolved = NAMED_COLORS[hex.toLowerCase()] ?? hex;
  const h = resolved.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(156,163,175,${alpha})`; // gray fallback
  return `rgba(${r},${g},${b},${alpha})`;
}

function CompanyCard({ co, accentColor }: { co: ClientCompanyEntry; accentColor: string }) {
  const openRecord = useRecordDrawer();
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="rounded-lg overflow-hidden bg-white"
      style={{ border: `1px solid ${hexAlpha(accentColor, 0.3)}` }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-left gap-2 transition-colors"
        style={{ backgroundColor: hexAlpha(accentColor, 0.07) }}
      >
        <span className="text-xs font-semibold text-gray-800 truncate flex-1">{co.companyName}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-bold" style={{ color: accentColor }}>{co.attendeeCount}</span>
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            style={{ color: accentColor }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && co.attendees.length > 0 && (
        <div
          className="divide-y"
          style={{ borderTop: `1px solid ${hexAlpha(accentColor, 0.2)}`, borderColor: hexAlpha(accentColor, 0.1) }}
        >
          {co.attendees.map(a => (
            <div key={a.id} className="px-3 py-1.5 bg-white">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); openRecord('attendee', a.id); }}
                className="text-xs font-medium text-gray-800 hover:text-brand-secondary transition-colors block truncate text-left w-full"
              >
                {a.firstName} {a.lastName}
              </button>
              {a.title && <p className="text-xs text-gray-400 truncate">{a.title}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyPanel({
  title,
  companies,
  accentColor,
  emptyText,
}: {
  title: string;
  companies: ClientCompanyEntry[];
  accentColor: string | null;
  emptyText: string;
}) {
  const color = accentColor || '#9ca3af';
  return (
    <div className="relative min-h-[200px] h-full">
      <div
        className="absolute inset-0 flex flex-col rounded-xl overflow-hidden"
        style={{ border: `2px solid ${hexAlpha(color, 0.5)}` }}
      >
        {/* Panel header — matches tier-card header style */}
        <div
          className="px-3 py-2.5 border-b flex items-center justify-between flex-shrink-0"
          style={{
            backgroundColor: hexAlpha(color, 0.12),
            borderBottom: `1px solid ${hexAlpha(color, 0.3)}`,
          }}
        >
          <h3
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color }}
          >
            {title}
          </h3>
          {companies.length > 0 && (
            <span className="text-xs font-bold" style={{ color }}>
              {companies.length}
            </span>
          )}
        </div>
        {/* Card list */}
        <div
          className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0"
          style={{ backgroundColor: hexAlpha(color, 0.04) }}
        >
          {companies.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">{emptyText}</p>
          ) : (
            companies.map(co => (
              <CompanyCard key={co.companyId} co={co} accentColor={color} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Charts Panel ─────────────────────────────────────────────────────

const TIER_DATA = [
  { key: '1', label: 'Must Target', hex: '#dc2626' },
  { key: '2', label: 'High Priority', hex: '#1B76BC' },
  { key: '3', label: 'Worth Engaging', hex: '#059669' },
  { key: 'unassigned', label: 'Monitor', hex: '#9ca3af' },
] as const;

const TIER_PRIORITY: Record<string, number> = { '1': 0, '2': 1, '3': 2, 'unassigned': 3 };

function PipelineChartsPanel({
  conferenceId,
  targetMap,
  meetingAttendeeIds,
}: {
  conferenceId: number;
  targetMap: Map<number, TargetEntry>;
  meetingAttendeeIds: Set<number>;
}) {
  const avgCostPerUnit = useAvgCostPerUnit();
  const [meetingsConvPct, setMeetingsConvPct] = useState(60);
  const [requiredPipeline, setRequiredPipeline] = useState<number | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [meetingPipelineOpen, setMeetingPipelineOpen] = useState(false);

  // Fixed conversion rate matching ConferenceTargetsTab default — not user-adjustable here
  const conversionPct = 60;

  useEffect(() => {
    Promise.all([
      fetch(`/api/conferences/${conferenceId}/budget`).then(r => r.ok ? r.json() : null),
      fetch('/api/admin/effectiveness').then(r => r.ok ? r.json() : null),
    ]).then(([budgetData, effectivenessData]) => {
      const val = (budgetData as { required_pipeline_amount?: number | null } | null)?.required_pipeline_amount;
      if (val != null && Number(val) > 0) setRequiredPipeline(Number(val));
      const mhRate = (effectivenessData as Record<string, string> | null)?.meetings_held_conversion_rate;
      if (mhRate != null) {
        const pct = parseFloat(mhRate);
        if (!isNaN(pct) && pct > 0) setMeetingsConvPct(pct);
      }
    }).catch(() => {});
  }, [conferenceId]);

  // Targeted pipeline: deduplicate by company, best tier wins
  const companyBestTier = useMemo(() => {
    const map = new Map<number, { tier: string; wse: number }>();
    for (const t of Array.from(targetMap.values())) {
      if (t.companyId == null || t.companyWse == null) continue;
      const existing = map.get(t.companyId);
      if (!existing || (TIER_PRIORITY[t.tier] ?? 99) < (TIER_PRIORITY[existing.tier] ?? 99)) {
        map.set(t.companyId, { tier: t.tier, wse: t.companyWse });
      }
    }
    return map;
  }, [targetMap]);

  const tierValueSum: Record<string, number> = {};
  for (const { tier, wse } of Array.from(companyBestTier.values())) {
    tierValueSum[tier] = (tierValueSum[tier] ?? 0) + Math.round(wse * avgCostPerUnit);
  }
  const hasValues = avgCostPerUnit > 0 && companyBestTier.size > 0;
  const totalTargetValue = Object.values(tierValueSum).reduce((a, b) => a + b, 0);
  const convertedValue = Math.round(totalTargetValue * conversionPct / 100);
  const coverageRatio = requiredPipeline && requiredPipeline > 0 ? convertedValue / requiredPipeline : null;
  const maxTierValue = Math.max(1, ...Object.values(tierValueSum));

  // Meetings pipeline
  const meetingCompanyBestTier = useMemo(() => {
    const map = new Map<number, { tier: string; wse: number }>();
    for (const t of Array.from(targetMap.values())) {
      if (!meetingAttendeeIds.has(t.attendeeId)) continue;
      if (t.companyId == null || t.companyWse == null) continue;
      const existing = map.get(t.companyId);
      if (!existing || (TIER_PRIORITY[t.tier] ?? 99) < (TIER_PRIORITY[existing.tier] ?? 99)) {
        map.set(t.companyId, { tier: t.tier, wse: t.companyWse });
      }
    }
    return map;
  }, [targetMap, meetingAttendeeIds]);

  const meetingTierValueSum: Record<string, number> = {};
  for (const { tier, wse } of Array.from(meetingCompanyBestTier.values())) {
    meetingTierValueSum[tier] = (meetingTierValueSum[tier] ?? 0) + Math.round(wse * avgCostPerUnit);
  }
  const totalMeetingValue = Object.values(meetingTierValueSum).reduce((a, b) => a + b, 0);
  const convertedMeetingValue = Math.round(totalMeetingValue * meetingsConvPct / 100);
  const meetingsCoverageRatio = requiredPipeline && requiredPipeline > 0 ? convertedMeetingValue / requiredPipeline : null;
  const maxMeetingTierValue = Math.max(1, ...Object.values(meetingTierValueSum));
  const hasMeetingValues = avgCostPerUnit > 0 && meetingCompanyBestTier.size > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Targeted Pipeline Value */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <button type="button" onClick={() => setPipelineOpen(o => !o)} className="flex items-center justify-between w-full mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider leading-tight">Targeted Pipeline Value</p>
          <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${pipelineOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>

        {requiredPipeline != null && (
          <div className={`pb-3 ${pipelineOpen ? 'mb-3 border-b border-gray-100' : ''}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500 font-medium">Required Pipeline</span>
              <span className="text-xs text-gray-400">${requiredPipeline.toLocaleString('en-US')}</span>
            </div>
            <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min((coverageRatio ?? 0) * 100, 100)}%`,
                  backgroundColor: (coverageRatio ?? 0) >= 1 ? '#059669' : (coverageRatio ?? 0) >= 0.6 ? '#f59e0b' : '#dc2626',
                }}
              />
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-gray-400">
                Projected: <span className="font-medium text-gray-600">${convertedValue.toLocaleString('en-US')}</span>
              </span>
              {coverageRatio != null && (
                <span className={`text-xs font-medium ${(coverageRatio ?? 0) >= 1 ? 'text-emerald-600' : (coverageRatio ?? 0) >= 0.6 ? 'text-amber-600' : 'text-red-500'}`}>
                  ({Math.round((coverageRatio ?? 0) * 100)}%)
                </span>
              )}
            </div>
          </div>
        )}

        {pipelineOpen && (
          hasValues ? (
            <div className="space-y-2">
              {TIER_DATA.map(tier => {
                const val = tierValueSum[tier.key] ?? 0;
                return (
                  <div key={tier.key} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-24 flex-shrink-0 truncate">{tier.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: val > 0 ? `${Math.round((val / maxTierValue) * 100)}%` : '0%',
                          backgroundColor: tier.hex,
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0">
                      {val > 0 ? '$' + val.toLocaleString('en-US') : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Set avg. cost per unit in Admin Settings to see values.</p>
          )
        )}
      </div>

      {/* Meetings Pipeline Value */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <button type="button" onClick={() => setMeetingPipelineOpen(o => !o)} className="flex items-center justify-between w-full mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider leading-tight">Meetings Pipeline</p>
          <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${meetingPipelineOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>

        {requiredPipeline != null && (
          <div className={`pb-3 ${meetingPipelineOpen ? 'mb-3 border-b border-gray-100' : ''}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500 font-medium">Required Pipeline</span>
              <span className="text-xs text-gray-400">${requiredPipeline.toLocaleString('en-US')}</span>
            </div>
            <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min((meetingsCoverageRatio ?? 0) * 100, 100)}%`,
                  backgroundColor: (meetingsCoverageRatio ?? 0) >= 1 ? '#059669' : (meetingsCoverageRatio ?? 0) >= 0.6 ? '#f59e0b' : '#dc2626',
                }}
              />
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-gray-400">
                Projected: <span className="font-medium text-gray-600">${convertedMeetingValue.toLocaleString('en-US')}</span>
              </span>
              {meetingsCoverageRatio != null && (
                <span className={`text-xs font-medium ${(meetingsCoverageRatio ?? 0) >= 1 ? 'text-emerald-600' : (meetingsCoverageRatio ?? 0) >= 0.6 ? 'text-amber-600' : 'text-red-500'}`}>
                  ({Math.round((meetingsCoverageRatio ?? 0) * 100)}%)
                </span>
              )}
            </div>
          </div>
        )}

        {meetingPipelineOpen && (
          hasMeetingValues ? (
            <div className="space-y-2">
              {TIER_DATA.map(tier => {
                const val = meetingTierValueSum[tier.key] ?? 0;
                return (
                  <div key={tier.key} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-24 flex-shrink-0 truncate">{tier.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: val > 0 ? `${Math.round((val / maxMeetingTierValue) * 100)}%` : '0%',
                          backgroundColor: tier.hex,
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0">
                      {val > 0 ? '$' + val.toLocaleString('en-US') : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              {avgCostPerUnit > 0
                ? meetingAttendeeIds.size === 0
                  ? 'No meetings scheduled yet.'
                  : 'No target companies with meetings.'
                : 'Set avg. cost per unit in Admin Settings to see values.'}
            </p>
          )
        )}
      </div>
    </div>
  );
}

// ─── Relationship Heatmap helpers ─────────────────────────────────────────────

function repInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().substring(0, 2).toUpperCase();
}

function RepInitialChip({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700 border border-teal-300"
    >
      <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {repInitials(name)}
    </span>
  );
}

function RelTypePill({ status }: { status: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
      {status}
    </span>
  );
}

function AttendeeRelCard({
  attendee,
  rels,
}: {
  attendee: IcpCompany['attendees'][0];
  rels: RelationshipRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasRels = rels.length > 0;

  const openRecord = useRecordDrawer();
  // Deduplicated rep list for collapsed rep-pills-only row
  const uniqueReps = Array.from(new Set(rels.flatMap(r => r.rep_names)));

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Clickable header — always visible */}
      <div
        role={hasRels ? 'button' : undefined}
        onClick={() => hasRels && setExpanded(v => !v)}
        className={`px-3 py-2.5 select-none ${hasRels ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
      >
        {/* Row 1: name (content-width link) + spacer + health score label + chevron */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); openRecord('attendee', attendee.id); }}
            className="text-xs font-medium text-gray-800 hover:text-brand-secondary underline-offset-2 hover:underline truncate text-left"
          >
            {String(attendee.first_name)} {String(attendee.last_name)}
          </button>
          <div className="flex-1" />
          <span className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
            Relationship Health Score:{' '}
            <span className="font-bold" style={{ color: scoreColor(attendee.health) }}>{attendee.health}</span>
          </span>
          {hasRels && (
            <svg
              className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>

        {/* Row 2: title */}
        {attendee.title && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{String(attendee.title)}</p>
        )}

        {/* Row 3: rep initial pills only — collapsed state */}
        {hasRels && !expanded && uniqueReps.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {uniqueReps.map(rep => <RepInitialChip key={rep} name={rep} />)}
          </div>
        )}
      </div>

      {/* Expanded: one block per relationship record */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 py-2 space-y-3">
          {rels.map((rel, i) => (
            <div key={i}>
              {/* Rep pill(s) + relationship type pill(s) on same row */}
              <div className="flex items-center flex-wrap gap-1 mb-1">
                {rel.rep_names.map(rep => <RepInitialChip key={rep} name={rep} />)}
                {rel.relationship_status.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                  <RelTypePill key={s} status={s} />
                ))}
              </div>
              {/* Note — only if present */}
              {rel.description && rel.description.trim() && (
                <p className="text-xs text-gray-600 leading-relaxed pl-1">{rel.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Relationship Heatmap Panel ────────────────────────────────────────────────

const HEALTH_BANDS = ['76–100', '51–75', '26–50', '0–25'] as const;
const COVERAGE_TIERS = ['1', '2', '3'] as const;
const COVERAGE_TIER_LABELS: Record<string, string> = {
  '1': 'Must Target', '2': 'High Priority', '3': 'Worth Engaging',
};

type DrillInternalState = {
  repName: string;
  relType: string;
  companies: Array<{ id: number; name: string; status: string }>;
};

function RelationshipHeatmapPanel({
  byRep,
  icpCompanies,
  targetMap,
  relationships,
}: {
  byRep: ByRepEntry[];
  icpCompanies: IcpCompany[];
  targetMap: Map<number, TargetEntry>;
  relationships: RelationshipRow[];
}) {
  const [view, setView] = useState<'internal' | 'coverage'>('internal');
  const [drillInternal, setDrillInternal] = useState<DrillInternalState | null>(null);
  const openRecord = useRecordDrawer();
  const [drillCoverage, setDrillCoverage] = useState<IcpCompany | null>(null);

  // ── Internal relationships matrix ──────────────────────────────────────────
  const { reps, relTypes, matrix, repRelMap } = useMemo(() => {
    const allReps: string[] = byRep.map(r => r.rep);
    const relTypeSet = new Set<string>();
    const repRelMap = new Map<string, Map<string, Array<{ id: number; name: string; status: string }>>>();

    for (const repEntry of byRep) {
      const relMap = new Map<string, Array<{ id: number; name: string; status: string }>>();
      for (const co of repEntry.companies) {
        for (const rel of co.internal_relationships) {
          const types = rel.relationship_status.split(',').map(s => s.trim()).filter(Boolean);
          for (const t of types) {
            relTypeSet.add(t);
            if (!relMap.has(t)) relMap.set(t, []);
            const arr = relMap.get(t)!;
            if (!arr.some(c => c.id === co.company_id)) {
              arr.push({ id: co.company_id, name: co.company_name, status: rel.relationship_status });
            }
          }
        }
      }
      repRelMap.set(repEntry.rep, relMap);
    }

    // Exclude "Not Targeted" and non-relationship-type values unconditionally
    const relTypes = Array.from(relTypeSet)
      .filter(rt => {
        const lower = rt.toLowerCase().trim();
        return lower !== 'not targeted' && !lower.startsWith('not target') && lower !== 'none' && lower !== 'no relationship';
      })
      .sort();

    const fullMatrix: number[][] = allReps.map(rep =>
      relTypes.map(relType => repRelMap.get(rep)?.get(relType)?.length ?? 0)
    );

    // Only include reps who have at least one relationship in this conference
    const reps: string[] = [];
    const matrix: number[][] = [];
    allReps.forEach((rep, i) => {
      if (fullMatrix[i].some(v => v > 0)) {
        reps.push(rep);
        matrix.push(fullMatrix[i]);
      }
    });

    return { reps, relTypes, matrix, repRelMap };
  }, [byRep]);

  const maxCell = Math.max(1, ...matrix.flat());

  // ── Company tier lookup (by companyId) ─────────────────────────────────────
  const companyTierMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of Array.from(targetMap.values())) {
      if (entry.companyId == null) continue;
      const current = map.get(entry.companyId);
      if (!current || (TIER_PRIORITY[entry.tier] ?? 99) < (TIER_PRIORITY[current] ?? 99)) {
        map.set(entry.companyId, entry.tier);
      }
    }
    return map;
  }, [targetMap]);

  // ── Coverage grid: health band × target tier ───────────────────────────────
  const coverageGrid = useMemo(() => {
    const grid: IcpCompany[][][] = HEALTH_BANDS.map(() => COVERAGE_TIERS.map(() => []));
    for (const co of icpCompanies) {
      const health = co.avgHealth;
      const bandIdx = health >= 76 ? 0 : health >= 51 ? 1 : health >= 26 ? 2 : 3;
      const rawTier = companyTierMap.get(co.id) ?? 'unassigned';
      const tierIdx = COVERAGE_TIERS.indexOf(rawTier as typeof COVERAGE_TIERS[number]);
      if (tierIdx < 0) continue;
      grid[bandIdx][tierIdx].push(co);
    }
    return grid;
  }, [icpCompanies, companyTierMap]);

  const handleToggle = (next: 'internal' | 'coverage') => {
    setView(next);
    setDrillInternal(null);
    setDrillCoverage(null);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col h-full">
      {/* Toggle header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <button
          onClick={() => handleToggle('internal')}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${view === 'internal' ? 'bg-brand-primary text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Internal Relationships
        </button>
        <button
          onClick={() => handleToggle('coverage')}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${view === 'coverage' ? 'bg-brand-primary text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Relationship Coverage
        </button>
      </div>

      {/* Fixed-height content — no resize on toggle */}
      <div className="flex-1 overflow-hidden relative">
        {/* ── Internal relationships view ── */}
        {view === 'internal' && (
          drillInternal ? (
            <div className="absolute inset-0 p-4 overflow-y-auto">
              <button
                onClick={() => setDrillInternal(null)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-primary mb-3 font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <p className="text-xs font-semibold text-gray-700 mb-0.5">{drillInternal.repName}</p>
              <p className="text-xs text-gray-400 mb-3">
                {drillInternal.relType} · {drillInternal.companies.length} compan{drillInternal.companies.length === 1 ? 'y' : 'ies'}
              </p>
              <div className="space-y-1.5">
                {drillInternal.companies.map(co => (
                  <div key={co.id} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <p className="text-xs font-medium text-gray-700 mb-1.5">{co.name}</p>
                    <div className="flex flex-wrap gap-1">
                      {co.status.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                        <RelTypePill key={s} status={s} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 p-4 overflow-auto">
              {byRep.length === 0 || relTypes.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No internal relationship data available.</p>
              ) : (
                <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
                  <thead>
                    <tr>
                      <th className="text-left text-gray-400 font-medium pb-2 pr-3 sticky left-0 bg-white" style={{ minWidth: '6rem' }}>Rep</th>
                      {relTypes.map(rt => (
                        <th key={rt} className="text-center text-gray-400 font-medium pb-2 px-1" style={{ minWidth: '3.5rem', maxWidth: '5rem' }}>
                          <span className="block truncate" title={rt}>{rt}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reps.map((rep, ri) => (
                      <tr key={rep}>
                        <td className="text-gray-600 font-medium pr-3 py-1 sticky left-0 bg-white" style={{ minWidth: '6rem', maxWidth: '8rem' }}>
                          <span className="block truncate" title={rep}>{rep}</span>
                        </td>
                        {relTypes.map((relType, ci) => {
                          const count = matrix[ri][ci];
                          const intensity = count / maxCell;
                          const coList = repRelMap.get(rep)?.get(relType) ?? [];
                          return (
                            <td key={relType} className="px-1 py-1 text-center">
                              {count > 0 ? (
                                <button
                                  onClick={() => setDrillInternal({ repName: rep, relType, companies: coList })}
                                  className="w-8 h-7 rounded-md text-xs font-bold transition-all hover:scale-110 hover:ring-2 hover:ring-brand-secondary/50"
                                  style={{
                                    backgroundColor: `rgba(27,118,188,${Math.max(0.12, intensity * 0.85)})`,
                                    color: intensity > 0.5 ? '#fff' : '#1B76BC',
                                  }}
                                  title={`${rep} · ${relType}: ${count} compan${count === 1 ? 'y' : 'ies'}`}
                                >
                                  {count}
                                </button>
                              ) : (
                                <div className="w-8 h-7 rounded-md bg-gray-50 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        )}

        {/* ── Relationship Coverage view ── */}
        {view === 'coverage' && (
          drillCoverage ? (
            <div className="absolute inset-0 p-4 overflow-y-auto">
              <button
                onClick={() => setDrillCoverage(null)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-primary mb-3 font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <button type="button" onClick={() => openRecord('company', drillCoverage.id)} className="text-xs font-semibold text-gray-700 hover:text-brand-secondary block mb-0.5 text-left">{drillCoverage.name}</button>
              <p className="text-xs text-gray-400 mb-3">
                Avg health: {drillCoverage.avgHealth} · {drillCoverage.attendees.length} attendee{drillCoverage.attendees.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-1.5">
                {drillCoverage.attendees.map((a, idx) => {
                  const fullName = `${String(a.first_name)} ${String(a.last_name)}`;
                  const attendeeRels = relationships.filter(r =>
                    r.company_id === drillCoverage.id &&
                    (
                      r.contact_names.length === 0 ||
                      r.contact_names.some(cn => cn.toLowerCase() === fullName.toLowerCase())
                    )
                  );
                  return (
                    <AttendeeRelCard key={idx} attendee={a} rels={attendeeRels} />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 p-4 overflow-auto">
              {icpCompanies.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No ICP companies identified.</p>
              ) : (
                <div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mb-3">
                    {COVERAGE_TIERS.map(tier => (
                      <div key={tier} className="flex items-center gap-1">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: TIER_DATA.find(t => t.key === tier)?.hex ?? '#9ca3af' }}
                        />
                        <span className="text-xs text-gray-500">{COVERAGE_TIER_LABELS[tier]}</span>
                      </div>
                    ))}
                  </div>
                  {/* Grid */}
                  <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `4.5rem repeat(${COVERAGE_TIERS.length}, 1fr)` }}
                  >
                    {/* Column headers */}
                    <div />
                    {COVERAGE_TIERS.map(tier => (
                      <div key={tier} className="text-center text-xs text-gray-400 font-medium pb-1 px-1 truncate" title={COVERAGE_TIER_LABELS[tier]}>
                        {COVERAGE_TIER_LABELS[tier]}
                      </div>
                    ))}
                    {/* Data rows */}
                    {HEALTH_BANDS.map((band, bi) => (
                      <>
                        <div key={`label-${bi}`} className="flex items-start pt-1 text-xs text-gray-400 font-medium pr-1 leading-tight">
                          {band}
                        </div>
                        {COVERAGE_TIERS.map((tier, ti) => {
                          const tierHex = TIER_DATA.find(t => t.key === tier)?.hex ?? '#9ca3af';
                          const companies = coverageGrid[bi][ti];
                          return (
                            <div
                              key={`${bi}-${ti}`}
                              className="rounded-lg p-1 flex flex-wrap gap-1 items-start content-start"
                              style={{
                                minHeight: 52,
                                backgroundColor: companies.length > 0 ? hexAlpha(tierHex, 0.05) : '#f9fafb',
                              }}
                            >
                              {companies.map(co => (
                                <button
                                  key={co.id}
                                  onClick={() => setDrillCoverage(co)}
                                  title={`${co.name} (Health: ${co.avgHealth})`}
                                  className="rounded-full text-white flex items-center justify-center hover:scale-110 transition-transform flex-shrink-0 font-bold leading-none"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    fontSize: 9,
                                    backgroundColor: tierHex,
                                    opacity: 0.45 + 0.55 * (co.avgHealth / 100),
                                  }}
                                >
                                  {co.name.slice(0, 2).toUpperCase()}
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function LandscapeTab({
  data,
  targetMap,
  onToggleTarget,
  strategyAssessment,
  meetingAttendeeIds,
  conferenceId,
  byRep,
  icpCompanies,
  relationships,
}: {
  data: LandscapeData;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  strategyAssessment: StrategyAssessment | null;
  meetingAttendeeIds: Set<number>;
  conferenceId: number;
  byRep: ByRepEntry[];
  icpCompanies: IcpCompany[];
  relationships: RelationshipRow[];
}) {
  return (
    <div className="space-y-8">
      {/* Strategy Assessment (above existing charts) */}
      {strategyAssessment && <StrategyAssessmentSection sa={strategyAssessment} />}

      {/* 5-column layout: client | pipeline charts | relationship heatmap | competitors */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-stretch">
        {/* Col 1: Client Attendees */}
        <CompanyPanel
          title="Client Attendees"
          companies={data.clientCompanies}
          accentColor={data.clientColor}
          emptyText="No client companies attending"
        />

        {/* Col 2: Pipeline Charts */}
        <div className="md:col-span-1">
          <PipelineChartsPanel
            conferenceId={conferenceId}
            targetMap={targetMap}
            meetingAttendeeIds={meetingAttendeeIds}
          />
        </div>

        {/* Cols 3-4: Relationship Heatmap */}
        <div className="md:col-span-2 h-full">
          <RelationshipHeatmapPanel
            byRep={byRep}
            icpCompanies={icpCompanies}
            targetMap={targetMap}
            relationships={relationships}
          />
        </div>

        {/* Col 5: Competitors Attending */}
        <CompanyPanel
          title="Competitors Attending"
          companies={data.competitorCompanies}
          accentColor={data.competitorColor}
          emptyText="No competitor companies attending"
        />
      </div>
    </div>
  );
}
