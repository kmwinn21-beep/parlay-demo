'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import type { LandscapeData, TargetEntry, ClientCompanyEntry, PreConferenceStrategyAssessment } from '../PreConferenceReview';

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
      {/* Header row */}
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

      {/* Unit type pill row */}
      {co.wse != null && (
        <div className="px-3 pt-1.5 pb-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20">
            {unitTypeLabel}: {co.wse.toLocaleString()}
          </span>
        </div>
      )}

      {/* Expanded attendee list */}
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

export function LandscapeTab({
  data,
  targetMap,
  onToggleTarget,
  strategyAssessment,
}: {
  data: LandscapeData;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  strategyAssessment?: PreConferenceStrategyAssessment;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Pre-Conference Strategy Assessment</h3>
          <p className="text-sm text-gray-500">Recommended strategy and planning guidance based on this conference’s attendee and company mix.</p>
        </div>
        {strategyAssessment?.unavailable_reason ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <p className="font-semibold">Pre-conference strategy assessment is unavailable.</p>
            <p className="text-xs text-gray-500 mt-1">Configure ICP settings, budget/required pipeline, and target recommendations to generate strategy guidance.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Pre-Conference Strategy Fit Score</p>
                <p className="text-3xl font-bold text-brand-primary mt-1">{strategyAssessment?.strategy_fit_score ?? '—'} <span className="text-base">/100</span></p>
                <p className="text-sm text-gray-600">{strategyAssessment?.strategy_fit_interpretation ?? 'Unavailable'}</p>
                <div className="h-px bg-gray-200 my-3" />
                <div className="space-y-2">{strategyAssessment?.components?.map((c)=><div key={c.key} className="flex items-center justify-between text-xs"><span className="text-gray-600">{c.label} <span className="text-gray-400">({c.original_weight}% · eff {c.effective_weight.toFixed(1)}%)</span></span><span className="font-medium text-gray-700">{c.score ?? '—'} · {c.interpretation ?? 'Unavailable'}</span></div>)}</div>
              </div>
              <div className="lg:col-span-2 rounded-xl border p-4" style={{ borderColor: 'rgb(var(--brand-primary-rgb) / 0.35)', backgroundColor: 'rgb(var(--brand-primary-rgb) / 0.08)' }}>
                <p className="text-xs uppercase tracking-wide" style={{ color: 'rgb(var(--brand-primary-rgb))' }}>Recommended Strategy</p>
                <p className="text-lg font-semibold mt-1" style={{ color: 'rgb(var(--brand-primary-rgb))' }}>{strategyAssessment?.recommended_strategy?.label ?? 'Unavailable'}</p>
                <p className="text-xs text-gray-600 mt-3">Why this strategy</p>
                <ul className="mt-1 space-y-1">{(strategyAssessment?.recommended_strategy?.reasons ?? []).slice(0,5).map((r,i)=><li className="text-xs text-gray-700" key={i}>• {r}</li>)}</ul>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Secondary Strategy</p>
                <p className="text-sm font-semibold mt-1 text-gray-800">{strategyAssessment?.secondary_strategy?.label ?? 'Unavailable'}</p>
                <p className="text-xs text-gray-600 mt-3">Why this secondary strategy</p>
                <ul className="mt-1 space-y-1">{(strategyAssessment?.secondary_strategy?.reasons ?? []).slice(0,4).map((r,i)=><li className="text-xs text-gray-700" key={i}>• {r}</li>)}</ul>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
                <div className="flex items-center justify-between"><p className="font-semibold text-gray-700">Pipeline Reality</p><span title="Realistic pipeline is estimated from target companies, Target Priority tier, buyer access, relationship leverage, scheduled meetings, and available company pipeline influence value." className="text-gray-400 cursor-help">ⓘ</span></div>
                <p className="mt-1 text-gray-600">Realistic: {strategyAssessment?.pipeline_reality?.realistic_pipeline_goal != null ? `$${strategyAssessment.pipeline_reality.realistic_pipeline_goal.toLocaleString()}` : 'Unavailable'}</p>
                <p className="text-gray-600">Required: {strategyAssessment?.pipeline_reality?.required_pipeline_amount != null ? `$${strategyAssessment.pipeline_reality.required_pipeline_amount.toLocaleString()}` : 'Unavailable'}</p>
                <p className="text-gray-600">Coverage: {strategyAssessment?.pipeline_reality?.coverage_percent != null ? `${strategyAssessment.pipeline_reality.coverage_percent}%` : 'Unavailable'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
                <p className="font-semibold text-gray-700">Hosted Event Recommendation</p>
                <p className="mt-1 font-medium text-gray-800">{strategyAssessment?.hosted_event_recommendation?.recommendation ?? 'Unavailable'}</p>
                <p className="text-gray-600">Fit Score: {strategyAssessment?.hosted_event_recommendation?.score ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
                <p className="font-semibold text-gray-700">Sponsorship Recommendation</p>
                <p className="mt-1 font-medium text-gray-800">{strategyAssessment?.sponsorship_recommendation?.recommendation ?? 'Unavailable'}</p>
                <p className="text-gray-600">Fit Score: {strategyAssessment?.sponsorship_recommendation?.score ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
                <p className="font-semibold text-gray-700">Staffing Recommendation</p>
                <p className="mt-1 text-gray-600">Recommended: {strategyAssessment?.staffing_recommendation?.recommended_rep_count_min ?? '—'}-{strategyAssessment?.staffing_recommendation?.recommended_rep_count_max ?? '—'} internal attendees</p>
                <p className="text-gray-600">Current: {strategyAssessment?.staffing_recommendation?.current_internal_attendee_count ?? '—'}</p>
              </div>
            </div>

          </>
        )}
      </section>

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

        {/* Col 5: Client Attendees — absolute inside so expansion never affects row height */}
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
