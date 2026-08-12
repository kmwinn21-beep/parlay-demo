'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecordDrawer } from './RecordDrawerContext';
import { useUser } from '@/components/UserContext';
import toast from 'react-hot-toast';
import { BUYER_ROLE_OPTIONS, type BuyerRoleKey } from '@/lib/titleNormalization';
import { formatValuePill, useAvgCostPerUnit } from '@/lib/useAvgCostPerUnit';
import {
  buildActionLabelMap,
  buildTargetBuckets,
  collectTitleReviewItems,
  companyTierToConferenceTier,
  countRecommendedActions,
  getTierKey,
  scoreOrNull,
  sortCompaniesByPriority,
  stableKey,
  summarizeTargetRecommendations,
  titleNeedsReview,
  type TargetingCompanyRecommendation,
} from '@/lib/targeting/targetRecommendationsView';
import {
  getCompilationSnapshot,
  startTargetRecommendationsCompilation,
  subscribeToCompilation,
  type CompilationSnapshot,
} from '@/lib/targeting/targetingCompilationStore';
import type { TargetEntry } from '../PreConferenceReview';
import { getConfig } from '@/lib/configCache';

type FilterState = {
  tier: string;
  action: string;
};

const TOP_COMPANY_LIMIT = 25;

function LoadingState({ completed, total }: { completed: number; total: number | null }) {
  const progressLabel = total ? `${Math.min(completed, total)} of ${total} companies compiled` : 'Preparing company batches';
  return (
    <div className="text-center py-16">
      <div className="w-10 h-10 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin mx-auto mb-3" />
      <p className="text-gray-500 text-sm font-medium">Generating target recommendations…</p>
      <p className="text-gray-400 text-xs mt-1">{progressLabel}</p>
      <p className="text-gray-400 text-xs mt-2">You can leave this tab while recommendations compile. We’ll notify you when they’re ready.</p>
    </div>
  );
}

function EmptyState({ reason }: { reason?: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6m4 6V7m4 10v-4M5 19h14" />
        </svg>
      </div>
      <p className="text-gray-500 text-sm font-medium">Target recommendations are not available yet.</p>
      <p className="text-gray-400 text-xs mt-1 max-w-md mx-auto">
        Configure ICP settings and make sure this conference has companies and attendees before generating target recommendations.
      </p>
      {reason && <p className="text-gray-400 text-xs mt-2 max-w-md mx-auto">{reason}</p>}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      </div>
      <p className="text-gray-700 text-sm font-semibold">Unable to load target recommendations.</p>
      <button onClick={onRetry} className="mt-3 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-brand-secondary hover:bg-blue-50 transition-colors">
        Try again
      </button>
    </div>
  );
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  return <span className="font-semibold text-brand-primary tabular-nums">{Math.round(value)}</span>;
}


function InfoTooltip({ label, title, body, details }: { label: string; title: string; body: string; details?: string[] }) {
  return (
    <span className="group relative inline-flex items-center gap-1 normal-case">
      <span>{label}</span>
      <span
        tabIndex={0}
        role="button"
        aria-label={`${title} details`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-bold text-gray-500 bg-white cursor-help"
      >i</span>
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-lg border border-gray-200 bg-white p-3 text-left normal-case shadow-lg group-hover:block group-focus-within:block">
        <p className="text-xs font-semibold text-brand-primary">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-600">{body}</p>
        {details && details.length > 0 && (
          <ul className="mt-2 space-y-1">
            {details.map((detail, index) => (
              <li key={`${detail}-${index}`} className="text-xs leading-relaxed text-gray-500 flex gap-1.5"><span>•</span><span>{detail}</span></li>
            ))}
          </ul>
        )}
      </span>
    </span>
  );
}

function ScoreValueTooltip({ value, title, reasons }: { value: number | null; title: string; reasons: string[] }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  if (reasons.length === 0) return <ScoreBadge value={value} />;
  return (
    <span className="group relative inline-block">
      <span className="font-semibold text-brand-primary tabular-nums cursor-help">{Math.round(value)}</span>
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg group-hover:block group-focus-within:block">
        <p className="text-xs font-semibold text-brand-primary">{title}: {Math.round(value)}</p>
        <p className="mt-1 text-xs font-semibold text-gray-500">Why:</p>
        <ul className="mt-1 space-y-1">
          {reasons.slice(0, 5).map((reason, index) => <li key={`${reason}-${index}`} className="text-xs text-gray-600 leading-relaxed">• {reason}</li>)}
        </ul>
      </span>
    </span>
  );
}
function Pill({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'green' | 'blue' | 'amber' | 'gray' | 'red' }) {
  const classes = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-brand-secondary border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }[tone];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${classes}`}>{children}</span>;
}

// Mobile-only accordion chevron for the sections below the KPI cards — desktop
// (sm+) never shows this button since content is always expanded there.
function MobileSectionToggle({ open }: { open: boolean }) {
  return (
    <span className="sm:hidden flex-shrink-0 text-gray-400" aria-hidden="true">
      <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </span>
  );
}

function tierTone(company: TargetingCompanyRecommendation): 'green' | 'blue' | 'amber' | 'gray' {
  const key = stableKey(company.target_priority_tier_key || company.target_priority_tier);
  if (key === 'must_target' || key === 'high_priority') return 'green';
  if (key === 'worth_engaging') return 'blue';
  if (key === 'monitor') return 'amber';
  return 'gray';
}

const TONE_FILL: Record<'green' | 'blue' | 'amber' | 'gray', string> = {
  green: '#059669',
  blue: 'rgb(var(--brand-secondary-rgb))',
  amber: '#d97706',
  gray: '#6b7280',
};

function repInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().substring(0, 2).toUpperCase();
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(156,163,175,${alpha})`; // gray fallback
  return `rgba(${r},${g},${b},${alpha})`;
}

function RepPill({ name, color, size = 7 }: { name: string; color: string; size?: 6 | 7 }) {
  const dim = size === 7 ? 'w-7 h-7' : 'w-6 h-6';
  return (
    <span
      title={name}
      className={`inline-flex items-center justify-center ${dim} rounded-full text-[10px] font-bold flex-shrink-0`}
      style={{ backgroundColor: hexAlpha(color, 0.12), color, border: `1px solid ${hexAlpha(color, 0.35)}` }}
    >
      {repInitials(name)}
    </span>
  );
}

function RepCell({ company }: { company: TargetingCompanyRecommendation }) {
  const repName = company.assigned_user_names?.[0];
  if (repName) {
    return <RepPill name={repName} color={company.assigned_user_colors?.[0] ?? '#6b7280'} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => toast('A rep has not been assigned to this company.', { icon: '⚠️' })}
        title="No rep assigned"
        aria-label="No rep assigned"
        className="text-amber-500 hover:text-amber-600 transition-colors flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" clipRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.518 11.598c.75 1.334-.213 2.98-1.742 2.98H3.48c-1.53 0-2.493-1.646-1.743-2.98L8.257 3.1zM11 14a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
        </svg>
      </button>
      {company.territory_name ? <Pill tone="gray">{repInitials(company.territory_name)}</Pill> : <span className="text-gray-400">—</span>}
    </span>
  );
}

function RankPill({ rank }: { rank: number }) {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold flex-shrink-0"
      style={{ backgroundColor: 'rgba(var(--brand-primary-rgb), 0.12)', color: 'rgb(var(--brand-primary-rgb))', border: '1px solid rgba(var(--brand-primary-rgb), 0.4)' }}
    >
      {rank}
    </span>
  );
}

function RepMultiSelect({ reps, selected, onChange }: { reps: string[]; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggleRep = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange(next);
  };

  const label = selected.size === 0 ? 'All reps' : selected.size === 1 ? Array.from(selected)[0] : `${selected.size} reps`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-gray-600 hover:border-gray-300 transition-colors"
      >
        <span className="max-w-[9rem] truncate">{label}</span>
        <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {selected.size > 0 && (
            <button type="button" onClick={() => onChange(new Set())}
              className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors border-b border-gray-50">
              Clear selection
            </button>
          )}
          {reps.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2">No reps assigned yet.</p>
          ) : reps.map(name => (
            <label key={name} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
              <input type="checkbox" checked={selected.has(name)} onChange={() => toggleRep(name)} />
              <span className="truncate">{name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function confidenceTone(confidence: string | null | undefined): 'green' | 'amber' | 'gray' {
  const key = stableKey(confidence);
  if (key === 'high') return 'green';
  if (key === 'medium') return 'amber';
  return 'gray';
}

type ConfigOptionRecord = { id: number; category: string; value: string };
type TitleRuleForm = { normalized_title: string; function_id: string; seniority_id: string; buyer_role: BuyerRoleKey; confidence: string; notes: string; apply_all_exact: boolean };

function formatPipelineCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString('en-US')}`;
}

type KpiPill = { text: string; className: string };

function KpiCard({ label, value, pill }: { label: string; value: number | string | null; pill?: KpiPill }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 min-w-0">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-2xl font-bold text-brand-primary leading-tight">{value ?? '—'}</div>
        {pill && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap flex-shrink-0 mt-0.5 ${pill.className}`}>
            {pill.text}
          </span>
        )}
      </div>
      <div className="text-xs font-semibold text-gray-500 truncate">{label}</div>
    </div>
  );
}

function AddTargetPill({ isTarget, onClick }: { isTarget: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); if (!isTarget) onClick(); }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
        isTarget
          ? 'bg-red-50 text-red-600 border-red-200 cursor-default'
          : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
      }`}
    >
      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
      </svg>
      {isTarget ? 'Target Added' : 'Add Target'}
    </button>
  );
}

function CompanyDetails({
  company,
  onReviewTitle,
  targetMap,
  onAddTargetWithTier,
}: {
  company: TargetingCompanyRecommendation;
  onReviewTitle: (attendee: NonNullable<TargetingCompanyRecommendation['top_attendees']>[number]) => void;
  targetMap: Map<number, TargetEntry>;
  onAddTargetWithTier: (entry: Omit<TargetEntry, 'tier'>, tier: string) => Promise<void>;
}) {
  const reasons = [
    ...(company.recommended_action_reason ? [company.recommended_action_reason] : []),
    ...(company.why_this_target ?? []),
  ].slice(0, 5);
  const openRecord = useRecordDrawer();
  const confidenceReasons = (company.confidence_reasons ?? []).slice(0, 3);
  const attendees = (company.top_attendees ?? []).slice(0, 3);
  const conferenceTier = companyTierToConferenceTier(company.target_priority_tier_key || company.target_priority_tier);

  return (
    <div className="mt-2 grid gap-4 lg:grid-cols-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Top attendees</p>
        {attendees.length > 0 ? (
          <div className="space-y-1.5">
            {attendees.map(attendee => {
              const isTarget = targetMap.has(attendee.attendee_id);
              const nameParts = attendee.attendee_name.split(' ');
              const entry: Omit<TargetEntry, 'tier'> = {
                attendeeId: attendee.attendee_id,
                firstName: nameParts[0] ?? '',
                lastName: nameParts.slice(1).join(' ') || '',
                title: attendee.title ?? null,
                seniority: attendee.seniority_label ?? null,
                companyName: company.company_name,
                companyId: company.company_id,
                companyWse: company.wse ?? null,
                assignedUserNames: [],
              };
              return (
                <div key={attendee.attendee_id} className="text-xs text-gray-600 min-w-0">
                  <button type="button" onClick={() => openRecord('attendee', attendee.attendee_id)} className="font-semibold text-gray-800 hover:text-brand-secondary transition-colors text-left">
                    {attendee.attendee_name}
                  </button>
                  <span>{attendee.title ? ` — ${attendee.title}` : ''}</span>
                  {titleNeedsReview(attendee) && (
                    <button type="button" onClick={() => onReviewTitle(attendee)} className="ml-1 text-amber-600 hover:text-amber-700" title="Needs title review" aria-label="Needs title review">⚠️</button>
                  )}
                  {attendee.normalized_title && <span className="text-gray-400"> ({attendee.normalized_title})</span>}
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Pill tone="blue">Buyer Fit {Math.round(scoreOrNull(attendee.buyer_fit_score) ?? 0)}</Pill>
                    <Pill>{String(attendee.buyer_role_classification) === 'decision_maker' ? 'DM' : String(attendee.buyer_role_classification) === 'influencer' ? 'Inf.' : String(attendee.buyer_role_classification) === 'target_title' ? 'Target' : String(attendee.buyer_role_classification).replace(/_/g, ' ')}</Pill>
                    <Pill tone={confidenceTone(attendee.title_match_confidence)}>{attendee.title_match_confidence}</Pill>
                    <AddTargetPill isTarget={isTarget} onClick={() => void onAddTargetWithTier(entry, conferenceTier)} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="text-xs text-gray-400">No attendee details available.</p>}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Why this target</p>
        {reasons.length > 0 ? (
          <ul className="space-y-1">
            {reasons.map((reason, index) => (
              <li key={`${reason}-${index}`} className="text-xs text-gray-600 flex gap-1.5 items-start">
                <span className="text-brand-secondary mt-0.5">·</span><span>{reason}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-gray-400">No reasons available.</p>}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Confidence</p>
          <Pill tone={confidenceTone(company.confidence_level)}>{company.confidence_level || '—'}</Pill>
        </div>
        {confidenceReasons.length > 0 ? (
          <ul className="space-y-1">
            {confidenceReasons.map((reason, index) => (
              <li key={`${reason}-${index}`} className="text-xs text-gray-600 flex gap-1.5 items-start">
                <span className="text-brand-secondary mt-0.5">·</span><span>{reason}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-gray-400">No confidence notes available.</p>}
      </div>
    </div>
  );
}

function CompanyRow({ company, rank, onReviewTitle, avgCostPerUnit, targetMap, onAddTargetWithTier }: { company: TargetingCompanyRecommendation; rank: number; onReviewTitle: (attendee: NonNullable<TargetingCompanyRecommendation['top_attendees']>[number]) => void; avgCostPerUnit: number; targetMap: Map<number, TargetEntry>; onAddTargetWithTier: (entry: Omit<TargetEntry, 'tier'>, tier: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const companyValue = formatValuePill(company.wse, avgCostPerUnit);
  return (
    <>
      <tr className="border-b border-gray-100 align-top hover:bg-gray-50/60">
        <td className="py-3 px-3 min-w-48">
          <div className="flex items-start gap-2">
            <RankPill rank={rank} />
            <div>
              <button onClick={() => setExpanded(v => !v)} className="text-left font-semibold text-gray-900 hover:text-brand-secondary transition-colors">
                {company.company_name}
              </button>
              <p className="text-xs text-gray-400 mt-0.5">{expanded ? 'Hide details' : 'Show details'}</p>
            </div>
          </div>
        </td>
        <td className="py-3 px-3">{companyValue ? <Pill tone="green">{companyValue}</Pill> : <span className="text-gray-400">—</span>}</td>
        <td className="py-3 px-3"><ScoreBadge value={scoreOrNull(company.target_priority_score)} /></td>
        <td className="py-3 px-3"><Pill tone={tierTone(company)}>{company.target_priority_tier || '—'}</Pill></td>
        <td className="py-3 px-3 min-w-44">
          <Pill tone="blue">{company.recommended_action_label || company.recommended_action?.recommended_action_label || '—'}</Pill>
        </td>
        <td className="py-3 px-3"><ScoreValueTooltip value={scoreOrNull(company.icp_fit_score)} title="ICP Fit Score" reasons={[...(company.matched_icp_reasons ?? []), ...(company.failed_icp_reasons ?? []).map(r => `Gap: ${r}`)]} /></td>
        <td className="py-3 px-3"><ScoreValueTooltip value={scoreOrNull(company.buyer_access_score)} title="Buyer Access Score" reasons={(company.top_attendees ?? []).flatMap(a => a.why_this_attendee ?? []).slice(0, 5)} /></td>
        <td className="py-3 px-3"><ScoreValueTooltip value={scoreOrNull(company.relationship_leverage_score)} title="Relationship Leverage Score" reasons={company.relationship_reasons ?? []} /></td>
        <td className="py-3 px-3"><ScoreValueTooltip value={scoreOrNull(company.conference_opportunity_score)} title="Conference Opportunity Score" reasons={[...(company.opportunity_reasons ?? []), `Attendees: ${company.attendee_count ?? 0}`, `High-priority attendees: ${company.high_priority_attendee_count ?? 0}`, `Scheduled meetings: ${company.scheduled_meeting_count ?? 0}`]} /></td>
        <td className="py-3 px-3"><RepCell company={company} /></td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100">
          <td colSpan={10} className="px-3 pb-3 pt-0"><CompanyDetails company={company} onReviewTitle={onReviewTitle} targetMap={targetMap} onAddTargetWithTier={onAddTargetWithTier} /></td>
        </tr>
      )}
    </>
  );
}

function ActionRow({
  action,
  companies,
  targetMap,
  onAddTargetWithTier,
}: {
  action: { key: string; label: string; count: number };
  companies: TargetingCompanyRecommendation[];
  targetMap: Map<number, TargetEntry>;
  onAddTargetWithTier: (entry: Omit<TargetEntry, 'tier'>, tier: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm text-gray-700 truncate">{action.label}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Pill tone="blue">{action.count}</Pill>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 space-y-3 bg-gray-50/50">
          {companies.length === 0 && (
            <p className="text-xs text-gray-400">No companies in this action group.</p>
          )}
          {companies.map(company => {
            const conferenceTier = companyTierToConferenceTier(company.target_priority_tier_key || company.target_priority_tier);
            const attendees = (company.top_attendees ?? []).slice(0, 3);
            return (
              <div key={company.company_id}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-800">{company.company_name}</span>
                  <Pill tone={tierTone(company)}>{company.target_priority_tier || '—'}</Pill>
                </div>
                <div className="space-y-1 pl-2 border-l border-gray-200">
                  {attendees.map(attendee => {
                    const isTarget = targetMap.has(attendee.attendee_id);
                    const nameParts = attendee.attendee_name.split(' ');
                    const entry: Omit<TargetEntry, 'tier'> = {
                      attendeeId: attendee.attendee_id,
                      firstName: nameParts[0] ?? '',
                      lastName: nameParts.slice(1).join(' ') || '',
                      title: attendee.title ?? null,
                      seniority: attendee.seniority_label ?? null,
                      companyName: company.company_name,
                      companyId: company.company_id,
                      companyWse: company.wse ?? null,
                      assignedUserNames: [],
                    };
                    return (
                      <div key={attendee.attendee_id} className="flex items-center gap-2 text-xs py-0.5">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-gray-800">{attendee.attendee_name}</span>
                          {attendee.title && <span className="text-gray-500"> — {attendee.title}</span>}
                        </span>
                        <AddTargetPill isTarget={isTarget} onClick={() => void onAddTargetWithTier(entry, conferenceTier)} />
                      </div>
                    );
                  })}
                  {attendees.length === 0 && (
                    <p className="text-xs text-gray-400 py-0.5">No attendee details available.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TargetRecommendationsTab({ conferenceId, targetMap = new Map(), onAddTargetWithTier = async () => {} }: { conferenceId: number; targetMap?: Map<number, TargetEntry>; onAddTargetWithTier?: (entry: Omit<TargetEntry, 'tier'>, tier: string) => Promise<void> }) {
  const { user: currentUser } = useUser();
  const [snapshot, setSnapshot] = useState<CompilationSnapshot>(() => getCompilationSnapshot(conferenceId));
  const [filters, setFilters] = useState<FilterState>({ tier: 'all', action: 'all' });
  const [selectedReps, setSelectedReps] = useState<Set<string>>(new Set());
  const [myAccountsOnly, setMyAccountsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [functionOptions, setFunctionOptions] = useState<ConfigOptionRecord[]>([]);
  const [seniorityOptions, setSeniorityOptions] = useState<ConfigOptionRecord[]>([]);
  const [titleReviewAttendee, setTitleReviewAttendee] = useState<NonNullable<TargetingCompanyRecommendation['top_attendees']>[number] | null>(null);
  const avgCostPerUnit = useAvgCostPerUnit();
  const [isSavingTitleRule, setIsSavingTitleRule] = useState(false);
  const [titleRuleForm, setTitleRuleForm] = useState<TitleRuleForm>({ normalized_title: '', function_id: '', seniority_id: '', buyer_role: 'target_title', confidence: 'high', notes: '', apply_all_exact: true });
  const [titleReviewListOpen, setTitleReviewListOpen] = useState(false);
  const [dismissedTitleReviewIds, setDismissedTitleReviewIds] = useState<Set<number>>(new Set());
  // Mobile-only accordion state for the sections below the KPI cards — desktop
  // (sm and up) always shows content regardless of these, via the `sm:block`
  // override on each section's content wrapper.
  const [topCompaniesOpenMobile, setTopCompaniesOpenMobile] = useState(false);
  const [bucketsOpenMobile, setBucketsOpenMobile] = useState(false);
  const [titleReviewOpenMobile, setTitleReviewOpenMobile] = useState(false);
  const [actionsOpenMobile, setActionsOpenMobile] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToCompilation(conferenceId, () => setSnapshot(getCompilationSnapshot(conferenceId)));
    setSnapshot(startTargetRecommendationsCompilation(conferenceId));
    return unsubscribe;
  }, [conferenceId]);

  useEffect(() => {
    getConfig()
      .then((data: unknown) => {
        const rows = data as ConfigOptionRecord[];
        setFunctionOptions(rows.filter(row => row.category === 'function'));
        setSeniorityOptions(rows.filter(row => row.category === 'seniority'));
      })
      .catch(() => {
        setFunctionOptions([]);
        setSeniorityOptions([]);
      });
  }, []);

  const openTitleReviewModal = (attendee: NonNullable<TargetingCompanyRecommendation['top_attendees']>[number]) => {
    setTitleReviewAttendee(attendee);
    setTitleRuleForm({
      normalized_title: attendee.normalized_title || attendee.title || '',
      function_id: attendee.function_id ? String(attendee.function_id) : '',
      seniority_id: attendee.seniority_id ? String(attendee.seniority_id) : '',
      buyer_role: (attendee.buyer_role_classification || 'target_title') as BuyerRoleKey,
      confidence: attendee.title_match_confidence || 'high',
      notes: '',
      apply_all_exact: true,
    });
  };

  const closeTitleModal = () => {
    setTitleReviewAttendee(null);
    setTitleReviewListOpen(false);
  };

  const postTitleRule = async (attendee: NonNullable<typeof titleReviewAttendee>) => {
    const res = await fetch('/api/title-normalization-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_title: attendee.title,
        normalized_title: titleRuleForm.normalized_title,
        function_id: Number(titleRuleForm.function_id),
        seniority_id: Number(titleRuleForm.seniority_id),
        buyer_role: titleRuleForm.buyer_role,
        confidence: titleRuleForm.confidence,
        notes: titleRuleForm.notes,
        apply_all_exact: titleRuleForm.apply_all_exact,
      }),
    });
    if (!res.ok) throw new Error('Failed to save title classification');
  };

  const saveTitleClassification = async () => {
    if (!titleReviewAttendee?.title) return;
    setIsSavingTitleRule(true);
    try {
      await postTitleRule(titleReviewAttendee);
      if (titleReviewListOpen) {
        setDismissedTitleReviewIds(prev => { const next = new Set(prev); next.add(titleReviewAttendee.attendee_id); return next; });
      }
      closeTitleModal();
      toast.success('Title classification saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save title classification');
    } finally {
      setIsSavingTitleRule(false);
    }
  };

  const saveTitleClassificationAndNext = async () => {
    if (!titleReviewAttendee?.title) return;
    const currentId = titleReviewAttendee.attendee_id;
    const remaining = visibleTitleReviewItems.filter(a => a.attendee_id !== currentId);
    setIsSavingTitleRule(true);
    try {
      await postTitleRule(titleReviewAttendee);
      setDismissedTitleReviewIds(prev => { const next = new Set(prev); next.add(currentId); return next; });
      if (remaining.length > 0) {
        openTitleReviewModal(remaining[0]);
      } else {
        closeTitleModal();
      }
      toast.success('Title classification saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save title classification');
    } finally {
      setIsSavingTitleRule(false);
    }
  };

  const data = snapshot.data;
  const isCompiling = snapshot.status === 'compiling';
  const hasData = Boolean(data?.companies?.length);

  const companies = useMemo(() => sortCompaniesByPriority(data?.companies ?? []), [data]);
  const actionLabelMap = useMemo(() => buildActionLabelMap(data?.scoring_config?.recommended_actions), [data]);
  const summary = useMemo(() => summarizeTargetRecommendations(companies), [companies]);

  const pipelineSums = useMemo(() => {
    const sumWse = (filter: (c: TargetingCompanyRecommendation) => boolean) =>
      companies.filter(filter).reduce((acc, c) => acc + (c.wse ?? 0), 0);
    return {
      mustTarget: sumWse(c => getTierKey(c) === 'must_target') * avgCostPerUnit,
      highPriority: sumWse(c => getTierKey(c) === 'high_priority') * avgCostPerUnit,
      worthEngaging: sumWse(c => getTierKey(c) === 'worth_engaging') * avgCostPerUnit,
    };
  }, [companies, avgCostPerUnit]);

  const buckets = useMemo(() => buildTargetBuckets(companies), [companies]);
  const titleReviewItems = useMemo(() => collectTitleReviewItems(companies).slice(0, 12), [companies]);
  const visibleTitleReviewItems = useMemo(
    () => titleReviewItems.filter(a => !dismissedTitleReviewIds.has(a.attendee_id)),
    [titleReviewItems, dismissedTitleReviewIds],
  );
  const actionCounts = useMemo(() => countRecommendedActions(companies, actionLabelMap), [companies, actionLabelMap]);

  const companiesByAction = useMemo(() => {
    const map = new Map<string, TargetingCompanyRecommendation[]>();
    for (const company of companies) {
      const key = company.recommended_action_key
        ?? company.recommended_action?.recommended_action_key
        ?? stableKey(company.recommended_action_label ?? company.recommended_action?.recommended_action_label ?? '');
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(company);
      map.set(key, list);
    }
    return map;
  }, [companies]);

  const tiers = useMemo(() => Array.from(new Map(companies.map(company => [stableKey(company.target_priority_tier_key || company.target_priority_tier), company.target_priority_tier])).entries()).filter(([key]) => key), [companies]);
  const actions = useMemo(() => actionCounts.map(action => ({ key: action.key, label: action.label })), [actionCounts]);
  const repNames = useMemo(() => Array.from(new Set(companies.flatMap(company => company.assigned_user_names ?? []))).sort((a, b) => a.localeCompare(b)), [companies]);

  const filteredCompanies = useMemo(() => companies.filter(company => {
    if (filters.tier !== 'all' && stableKey(company.target_priority_tier_key || company.target_priority_tier) !== filters.tier) return false;
    const actionKey = company.recommended_action_key || company.recommended_action?.recommended_action_key;
    if (filters.action !== 'all' && actionKey !== filters.action) return false;
    const companyReps = company.assigned_user_names ?? [];
    if (selectedReps.size > 0 && !companyReps.some(name => selectedReps.has(name))) return false;
    if (myAccountsOnly && !(currentUser?.repName && companyReps.includes(currentUser.repName))) return false;
    return true;
  }), [companies, filters, selectedReps, myAccountsOnly, currentUser]);

  // Filters changing can shrink the result set below the current page —
  // snap back to page 0 rather than showing an empty page.
  useEffect(() => { setPage(0); }, [filters, selectedReps, myAccountsOnly]);

  if ((snapshot.status === 'idle' || isCompiling) && !hasData) return <LoadingState completed={snapshot.completed} total={snapshot.total} />;
  if (snapshot.status === 'error' && !hasData) return <ErrorState onRetry={() => setSnapshot(startTargetRecommendationsCompilation(conferenceId, true))} />;
  if (snapshot.status === 'ready' && (!data || companies.length === 0)) return <EmptyState reason={data?.unavailable_reason} />;

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / TOP_COMPANY_LIMIT));
  const pageStart = page * TOP_COMPANY_LIMIT;
  const visibleCompanies = filteredCompanies.slice(pageStart, pageStart + TOP_COMPANY_LIMIT);

  const refreshRecommendations = () => {
    setSnapshot(startTargetRecommendationsCompilation(conferenceId, true));
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-brand-primary">Target Recommendations</h3>
            <p className="text-sm text-gray-500 mt-1">Which companies should we target at this conference, and why?</p>
          </div>
          <button
            type="button"
            onClick={refreshRecommendations}
            disabled={isCompiling}
            className="self-start rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-brand-secondary transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh Recommendations
          </button>
        </div>
        {isCompiling && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-brand-secondary">
            <p className="font-semibold">Compiling target recommendations in batches…</p>
            <p className="text-xs text-brand-secondary/80 mt-0.5">
              {snapshot.total ? `${Math.min(snapshot.completed, snapshot.total)} of ${snapshot.total} companies compiled.` : 'Preparing company batches.'} You can leave this tab and we’ll notify you when recommendations are ready.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Must Target" value={summary.mustTarget}
          pill={avgCostPerUnit > 0 && pipelineSums.mustTarget > 0 ? { text: `Opp: ${formatPipelineCompact(pipelineSums.mustTarget)}`, className: 'bg-red-50 text-red-600 border-red-200' } : undefined}
        />
        <KpiCard label="High Priority" value={summary.highPriority}
          pill={avgCostPerUnit > 0 && pipelineSums.highPriority > 0 ? { text: `Opp: ${formatPipelineCompact(pipelineSums.highPriority)}`, className: 'bg-brand-primary/10 text-brand-primary border-brand-primary/30' } : undefined}
        />
        <KpiCard label="Worth Engaging" value={summary.worthEngaging}
          pill={avgCostPerUnit > 0 && pipelineSums.worthEngaging > 0 ? { text: `Opp: ${formatPipelineCompact(pipelineSums.worthEngaging)}`, className: 'bg-brand-highlight/10 text-brand-highlight border-brand-highlight/30' } : undefined}
        />
        <KpiCard label="Needs Title Review" value={summary.needsTitleReview} />
        <KpiCard label="Avg Target Priority" value={summary.avgTargetPriority} />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <button
            type="button"
            onClick={() => setTopCompaniesOpenMobile(v => !v)}
            className="w-full flex items-start justify-between gap-3 text-left sm:pointer-events-none lg:w-auto"
          >
            <div>
              <h4 className="font-bold text-brand-primary">Top Target Companies</h4>
              <p className="text-xs text-gray-500 mt-0.5">Companies ranked by Target Priority Score</p>
            </div>
            <MobileSectionToggle open={topCompaniesOpenMobile} />
          </button>
          <div className={`${topCompaniesOpenMobile ? 'flex' : 'hidden'} sm:flex flex-wrap items-center gap-2 text-xs`}>
            <select value={filters.tier} onChange={e => setFilters(f => ({ ...f, tier: e.target.value }))} className="rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-gray-600">
              <option value="all">All tiers</option>
              {tiers.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} className="rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-gray-600">
              <option value="all">All actions</option>
              {actions.map(action => <option key={action.key} value={action.key}>{action.label}</option>)}
            </select>
            <RepMultiSelect reps={repNames} selected={selectedReps} onChange={setSelectedReps} />
            {currentUser?.repName && (
              <button
                type="button"
                onClick={() => setMyAccountsOnly(v => !v)}
                className={`rounded-lg border px-2 py-1.5 font-semibold transition-colors ${
                  myAccountsOnly
                    ? 'border-brand-secondary bg-brand-secondary/10 text-brand-secondary'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                My Accounts
              </button>
            )}
          </div>
        </div>
        <div className={topCompaniesOpenMobile ? 'block' : 'hidden sm:block'}>
        {filteredCompanies.length > 0 && (
          <div className="flex items-center justify-end gap-2 px-4 pt-3 text-xs text-gray-500">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="p-1 rounded text-gray-400 hover:text-brand-secondary disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="tabular-nums">{pageStart + 1}–{Math.min(pageStart + TOP_COMPANY_LIMIT, filteredCompanies.length)} of {filteredCompanies.length}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="p-1 rounded text-gray-400 hover:text-brand-secondary disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold py-2 px-3">Company</th>
                <th className="text-left font-semibold py-2 px-3">Value</th>
                <th className="text-left font-semibold py-2 px-3">Score</th>
                <th className="text-left font-semibold py-2 px-3">Tier</th>
                <th className="text-left font-semibold py-2 px-3">Recommended Action</th>
                <th className="text-left font-semibold py-2 px-3"><InfoTooltip label="ICP" title="ICP Fit Score" body="Measures how closely the company matches the ICP settings configured in Admin Settings." details={["Company type fit, units requirement, and service/product fit.", "ICP parameter match with exclusion logic from What We Are Not.", "Formula: Firmographic Fit + Service/Product Fit + ICP Parameter Fit + Exclusion Penalty."]} /></th>
                <th className="text-left font-semibold py-2 px-3"><InfoTooltip label="Buyer" title="Buyer Access Score" body="Measures whether the right people from this company are attending the conference." details={["Decision maker and influencer title matches.", "Seniority/function priority and product-function mapping.", "Uses human-in-the-loop title normalization when available."]} /></th>
                <th className="text-left font-semibold py-2 px-3"><InfoTooltip label="Relationship" title="Relationship Leverage Score" body="Measures how much existing relationship context the team has with this company." details={["Internal relationships and assigned rep/account owner.", "Prior meetings, touchpoints, and prior conference overlap.", "Client/known prospect status plus recent notes/activity."]} /></th>
                <th className="text-left font-semibold py-2 px-3"><InfoTooltip label="Opportunity" title="Conference Opportunity Score" body="Measures how strong the opportunity is at this specific conference." details={["Number of attendees and high-priority attendees present.", "Scheduled meetings and hosted/social event opportunity.", "Net-new or expansion opportunity signals."]} /></th>
                <th className="text-left font-semibold py-2 px-3">Rep</th>
              </tr>
            </thead>
            <tbody>{visibleCompanies.map((company, i) => <CompanyRow key={company.company_id} company={company} rank={pageStart + i + 1} onReviewTitle={openTitleReviewModal} avgCostPerUnit={avgCostPerUnit} targetMap={targetMap} onAddTargetWithTier={onAddTargetWithTier} />)}</tbody>
          </table>
        </div>
        <div className="md:hidden p-3 space-y-3">
          {visibleCompanies.map((company, i) => <MobileCompanyCard key={company.company_id} company={company} rank={pageStart + i + 1} onReviewTitle={openTitleReviewModal} targetMap={targetMap} onAddTargetWithTier={onAddTargetWithTier} />)}
        </div>
        {visibleCompanies.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No companies match the selected filters.</p>}
        </div>
      </section>

      <section>
        <button
          type="button"
          onClick={() => setBucketsOpenMobile(v => !v)}
          className="w-full flex items-start justify-between gap-3 text-left mb-1 sm:pointer-events-none"
        >
          <h4 className="font-bold text-brand-primary">Target Buckets</h4>
          <MobileSectionToggle open={bucketsOpenMobile} />
        </button>
        <p className="text-xs text-gray-500 mb-3">Practical planning segments based on backend scores.</p>
        <div className={`${bucketsOpenMobile ? 'grid' : 'hidden'} sm:grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`}>
          {buckets.map(bucket => (
            <div key={bucket.key} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{bucket.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{bucket.description}</p>
                </div>
                <Pill tone={bucket.companies.length ? 'blue' : 'gray'}>{bucket.companies.length}</Pill>
              </div>
              <div className="mt-3 space-y-1">
                {bucket.companies.slice(0, 3).map(company => <p key={company.company_id} className="text-xs text-gray-600 truncate">{company.company_name}</p>)}
                {bucket.companies.length === 0 && <p className="text-xs text-gray-400">No companies in this bucket.</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
          <button
            type="button"
            onClick={() => setTitleReviewOpenMobile(v => !v)}
            className="w-full flex items-start justify-between gap-3 text-left sm:pointer-events-none"
          >
            <h4 className="font-bold text-brand-primary">Needs Title Review</h4>
            <MobileSectionToggle open={titleReviewOpenMobile} />
          </button>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">Review fuzzy, low-confidence, or unmatched titles to improve Buyer Access and Target Priority Scores.</p>
          <div className={titleReviewOpenMobile ? 'block' : 'hidden sm:block'}>
          {visibleTitleReviewItems.length > 0 ? (
            <div className="space-y-2">
              {visibleTitleReviewItems.map(attendee => (
                <div key={attendee.attendee_id} className="rounded-lg border border-gray-100 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{attendee.attendee_name}</p>
                    <p className="text-xs text-gray-500 truncate">{attendee.company_name}{attendee.title ? ` · ${attendee.title}` : ''}</p>
                    {attendee.normalized_title && <p className="text-xs text-gray-400 truncate">Suggested: {attendee.normalized_title}</p>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Pill tone="amber">{attendee.title_match_type}</Pill>
                      <Pill tone={confidenceTone(attendee.title_match_confidence)}>{attendee.title_match_confidence}</Pill>
                    </div>
                  </div>
                  <button
                    onClick={() => { setTitleReviewListOpen(true); openTitleReviewModal(attendee); }}
                    className="text-xs font-semibold text-brand-secondary hover:text-brand-primary transition-colors whitespace-nowrap"
                  >
                    Review Title
                  </button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 py-6 text-center">All high-value attendee titles are classified.</p>}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
          <button
            type="button"
            onClick={() => setActionsOpenMobile(v => !v)}
            className="w-full flex items-start justify-between gap-3 text-left sm:pointer-events-none"
          >
            <h4 className="font-bold text-brand-primary">Recommended Actions</h4>
            <MobileSectionToggle open={actionsOpenMobile} />
          </button>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">Workload summary for activating this target list.</p>
          <div className={actionsOpenMobile ? 'block' : 'hidden sm:block'}>
          {actionCounts.length > 0 ? (
            <div className="space-y-1.5">
              {actionCounts.map(action => (
                <ActionRow
                  key={action.key}
                  action={action}
                  companies={companiesByAction.get(action.key) ?? []}
                  targetMap={targetMap}
                  onAddTargetWithTier={onAddTargetWithTier}
                />
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 py-6 text-center">No recommended actions available.</p>}
          </div>
        </div>
      </section>

      {titleReviewAttendee?.title && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-brand-primary font-serif">Classify Attendee Title</h2>
                <p className="mt-1 text-xs text-gray-500">Classify this attendee title and optionally apply it to others with the same exact title.</p>
              </div>
              <button onClick={closeTitleModal} className="text-gray-400 hover:text-gray-600" aria-label="Close title classification modal">×</button>
            </div>
            <div className="space-y-4 px-5 py-4 overflow-y-auto">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p><span className="font-medium text-gray-700">Attendee:</span> {titleReviewAttendee.attendee_name}</p>
                <p><span className="font-medium text-gray-700">Original Title:</span> {titleReviewAttendee.title}</p>
              </div>
              <input value={titleRuleForm.normalized_title} onChange={e => setTitleRuleForm(p => ({ ...p, normalized_title: e.target.value }))} className="input-field" placeholder="Normalized Title" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <select value={titleRuleForm.function_id} onChange={e => setTitleRuleForm(p => ({ ...p, function_id: e.target.value }))} className="input-field"><option value="">Function</option>{functionOptions.map(option => <option key={option.id} value={option.id}>{option.value}</option>)}</select>
                <select value={titleRuleForm.seniority_id} onChange={e => setTitleRuleForm(p => ({ ...p, seniority_id: e.target.value }))} className="input-field"><option value="">Seniority</option>{seniorityOptions.map(option => <option key={option.id} value={option.id}>{option.value}</option>)}</select>
              </div>
              <select value={titleRuleForm.buyer_role} onChange={e => setTitleRuleForm(p => ({ ...p, buyer_role: e.target.value as BuyerRoleKey }))} className="input-field">{BUYER_ROLE_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
              <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={titleRuleForm.apply_all_exact}
                  onChange={e => setTitleRuleForm(p => ({ ...p, apply_all_exact: e.target.checked }))}
                />
                <span>Apply to all attendees with this exact title.</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button onClick={closeTitleModal} className="btn-secondary">Cancel</button>
              {titleReviewListOpen && visibleTitleReviewItems.filter(a => a.attendee_id !== titleReviewAttendee?.attendee_id).length > 0 && (
                <button
                  onClick={saveTitleClassificationAndNext}
                  disabled={isSavingTitleRule || !titleRuleForm.normalized_title || !titleRuleForm.function_id || !titleRuleForm.seniority_id}
                  className="btn-secondary"
                >
                  {isSavingTitleRule ? 'Saving…' : 'Save & Next'}
                </button>
              )}
              <button onClick={saveTitleClassification} disabled={isSavingTitleRule || !titleRuleForm.normalized_title || !titleRuleForm.function_id || !titleRuleForm.seniority_id} className="btn-primary">{isSavingTitleRule ? 'Saving…' : 'Save Classification'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileCompanyCard({ company, rank, onReviewTitle, targetMap, onAddTargetWithTier }: { company: TargetingCompanyRecommendation; rank: number; onReviewTitle: (attendee: NonNullable<TargetingCompanyRecommendation['top_attendees']>[number]) => void; targetMap: Map<number, TargetEntry>; onAddTargetWithTier: (entry: Omit<TargetEntry, 'tier'>, tier: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <button type="button" onClick={() => setExpanded(v => !v)} className="w-full text-left">
        <div className="flex items-center gap-2">
          <RankPill rank={rank} />
          <p className="font-semibold text-gray-900">{company.company_name}</p>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: TONE_FILL[tierTone(company)] }}
          >
            {Math.round(scoreOrNull(company.target_priority_score) ?? 0)}
          </span>
          <Pill tone={tierTone(company)}>{company.target_priority_tier || '—'}</Pill>
          {company.assigned_user_names?.[0] && (
            <RepPill name={company.assigned_user_names[0]} color={company.assigned_user_colors?.[0] ?? '#6b7280'} size={6} />
          )}
        </div>
      </button>
      {expanded && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
            <p>ICP: {Math.round(scoreOrNull(company.icp_fit_score) ?? 0)}</p>
            <p>Buyer: {Math.round(scoreOrNull(company.buyer_access_score) ?? 0)}</p>
            <p>Relationship: {Math.round(scoreOrNull(company.relationship_leverage_score) ?? 0)}</p>
            <p>Opportunity: {Math.round(scoreOrNull(company.conference_opportunity_score) ?? 0)}</p>
          </div>
          <CompanyDetails company={company} onReviewTitle={onReviewTitle} targetMap={targetMap} onAddTargetWithTier={onAddTargetWithTier} />
        </>
      )}
    </div>
  );
}
