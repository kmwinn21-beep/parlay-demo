'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import type { LandscapeData, TargetEntry, ClientCompanyEntry } from '../PreConferenceReview';
import type { StrategyAssessment } from '@/lib/strategyAssessment';

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
      className="rounded-xl p-4 flex flex-col"
      style={{ backgroundColor: color + '15', borderLeft: `4px solid ${color}` }}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
        Pre-Conference Strategy Fit Score
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
      className="rounded-xl p-4 flex flex-col"
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
        className="text-lg font-bold leading-tight"
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
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col">
      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
        Secondary Strategy
      </div>
      {sa.secondaryStrategy ? (
        <>
          <div className="text-lg font-bold text-brand-secondary leading-tight">
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

// ─── Pipeline Reality card ─────────────────────────────────────────────────────

function PipelineRealityCard({ sa }: { sa: StrategyAssessment }) {
  const [showChart, setShowChart] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 relative flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Pipeline Reality</div>
        <button
          onClick={() => setShowChart(v => !v)}
          className="flex-shrink-0 text-gray-400 hover:text-brand-secondary transition-colors"
          title="View pipeline bar chart"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {showChart ? (
        <div className="flex-1">
          <PipelineBarChart realistic={sa.realisticPipelineGoal} required={sa.requiredPipeline} />
        </div>
      ) : (
        <div className="flex-1 space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-gray-500">Realistic Goal</span>
            <span className="text-sm font-bold text-brand-secondary">{fmtDollars(sa.realisticPipelineGoal)}</span>
          </div>
          {sa.requiredPipeline != null && (
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-500">Required Pipeline</span>
              <span className="text-sm font-semibold text-gray-600">{fmtDollars(sa.requiredPipeline)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-gray-500">Coverage</span>
            <span className="text-sm font-semibold text-gray-700">{sa.pipelineCoverageRate.toFixed(1)}%</span>
          </div>
          {sa.requiredPipeline != null && sa.realisticPipelineGoal < sa.requiredPipeline && (
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-1.5 bg-brand-secondary rounded-full"
                style={{ width: `${sa.pipelineCoverageRate}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Hosted Event card ─────────────────────────────────────────────────────────

function FitScorePill({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ color, backgroundColor: color + '18' }}
    >
      {score}
    </span>
  );
}

function HostedEventCard({ sa }: { sa: StrategyAssessment }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Hosted Event</div>
        <FitScorePill score={sa.hostedEventFitScore} />
      </div>
      <div className="text-sm font-semibold text-gray-900 leading-snug flex-1">
        {sa.hostedEventRecommendation}
      </div>
      <div className="mt-3">
        <div className="text-xs text-gray-400 mb-1">Fit Score</div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-1.5 rounded-full"
            style={{ width: `${sa.hostedEventFitScore}%`, backgroundColor: scoreColor(sa.hostedEventFitScore) }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Sponsorship card ──────────────────────────────────────────────────────────

function SponsorshipCard({ sa }: { sa: StrategyAssessment }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Sponsorship</div>
        <FitScorePill score={sa.sponsorshipFitScore} />
      </div>
      <div className="text-sm font-semibold text-gray-900 leading-snug flex-1">
        {sa.sponsorshipRecommendation}
      </div>
      <div className="mt-3">
        <div className="text-xs text-gray-400 mb-1">Fit Score</div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-1.5 rounded-full"
            style={{ width: `${sa.sponsorshipFitScore}%`, backgroundColor: scoreColor(sa.sponsorshipFitScore) }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Staffing card ─────────────────────────────────────────────────────────────

function StaffingCard({ sa }: { sa: StrategyAssessment }) {
  const isCovered = sa.currentRepCount >= sa.recommendedRepMin;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col">
      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Staffing</div>
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-semibold text-gray-900">
          {sa.recommendedRepMin}–{sa.recommendedRepMax} reps recommended
        </div>
        {isCovered ? (
          <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        )}
      </div>
      <div className="text-xs text-gray-500">
        Current: {sa.currentRepCount} rep{sa.currentRepCount !== 1 ? 's' : ''} attending
      </div>
      {!isCovered && (
        <div className="mt-2 text-xs text-amber-600 font-medium">
          Coverage gap: add {sa.recommendedRepMin - sa.currentRepCount}–{sa.recommendedRepMax - sa.currentRepCount} more rep{sa.recommendedRepMax - sa.currentRepCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// ─── Full section ──────────────────────────────────────────────────────────────

function StrategyAssessmentSection({ sa }: { sa: StrategyAssessment }) {
  return (
    <div className="space-y-4 pb-2 border-b border-gray-100 mb-6">
      {/* Row A: Scorecard + Strategy cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StrategyFitScoreCard sa={sa} />
        <PrimaryStrategyCard sa={sa} />
        <SecondaryStrategyCard sa={sa} />
      </div>

      {/* Row B: Action cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PipelineRealityCard sa={sa} />
        <HostedEventCard sa={sa} />
        <SponsorshipCard sa={sa} />
        <StaffingCard sa={sa} />
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

function ClientCompanyCard({ co, unitTypeLabel }: { co: ClientCompanyEntry; unitTypeLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left gap-2"
      >
        <span className="text-xs font-semibold text-gray-800 truncate flex-1">{co.companyName}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-bold text-brand-primary">{co.attendeeCount}</span>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {co.wse != null && (
        <div className="px-3 pt-1.5 pb-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20">
            {unitTypeLabel}: {co.wse.toLocaleString()}
          </span>
        </div>
      )}

      {expanded && co.attendees.length > 0 && (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {co.attendees.map(a => (
            <div key={a.id} className="px-3 py-1.5">
              <Link
                href={`/attendees/${a.id}`}
                className="text-xs font-medium text-gray-800 hover:text-brand-secondary transition-colors block truncate"
                onClick={e => e.stopPropagation()}
              >
                {a.firstName} {a.lastName}
              </Link>
              {a.title && <p className="text-xs text-gray-400 truncate">{a.title}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function LandscapeTab({
  data,
  targetMap,
  onToggleTarget,
  strategyAssessment,
}: {
  data: LandscapeData;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  strategyAssessment: StrategyAssessment | null;
}) {
  return (
    <div className="space-y-8">
      {/* Strategy Assessment (above existing charts) */}
      {strategyAssessment && <StrategyAssessmentSection sa={strategyAssessment} />}

      {/* 5-column layout: stat cards | charts (×3) | client attendees */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-stretch">
        {/* Col 1: stacked stat cards */}
        <div className="flex flex-col gap-3">
          {[
            { label: 'Total Attendees', value: data.totalAttendees },
            { label: 'Companies', value: data.totalCompanies },
            { label: 'ICP Companies', value: data.icpCount },
          ].map((s) => (
            <div key={s.label} className="flex-1 bg-gray-50 rounded-xl p-4 text-center border border-gray-100 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold text-brand-primary">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Cols 2-4: stacked charts */}
        <div className="md:col-span-3 flex flex-col gap-6 justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Company Type Breakdown</h3>
            <BarChart items={data.companyTypeBreakdown} total={data.totalAttendees} colorClass="bg-brand-secondary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Seniority Breakdown</h3>
            <BarChart items={data.seniorityBreakdown} total={data.totalAttendees} colorClass="bg-brand-highlight" />
          </div>
        </div>

        {/* Col 5: Client Attendees */}
        <div className="relative min-h-[200px]">
          <div className="absolute inset-0 flex flex-col border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">Client Attendees</h3>
              {data.clientCompanies.length > 0 && (
                <span className="text-xs font-semibold text-gray-400">{data.clientCompanies.length}</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
              {data.clientCompanies.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No client companies attending</p>
              ) : (
                data.clientCompanies.map(co => (
                  <ClientCompanyCard key={co.companyId} co={co} unitTypeLabel={data.unitTypeLabel} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
