'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  buildActionLabelMap,
  buildTargetBuckets,
  collectTitleReviewItems,
  countRecommendedActions,
  scoreOrNull,
  sortCompaniesByPriority,
  stableKey,
  summarizeTargetRecommendations,
  titleNeedsReview,
  type TargetingApiResponse,
  type TargetingCompanyRecommendation,
} from '@/lib/targeting/targetRecommendationsView';

type FilterState = {
  tier: string;
  action: string;
  confidence: string;
  hasBuyerAccess: boolean;
  hasRelationship: boolean;
  needsTitleReview: boolean;
};

const TOP_COMPANY_LIMIT = 25;

function LoadingState() {
  return (
    <div className="text-center py-16">
      <div className="w-10 h-10 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin mx-auto mb-3" />
      <p className="text-gray-500 text-sm font-medium">Generating target recommendations…</p>
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

function tierTone(company: TargetingCompanyRecommendation): 'green' | 'blue' | 'amber' | 'gray' {
  const key = stableKey(company.target_priority_tier_key || company.target_priority_tier);
  if (key === 'must_target' || key === 'high_priority') return 'green';
  if (key === 'worth_engaging') return 'blue';
  if (key === 'monitor') return 'amber';
  return 'gray';
}

function confidenceTone(confidence: string | null | undefined): 'green' | 'amber' | 'gray' {
  const key = stableKey(confidence);
  if (key === 'high') return 'green';
  if (key === 'medium') return 'amber';
  return 'gray';
}

function KpiCard({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 min-w-0">
      <div className="text-2xl font-bold text-brand-primary leading-tight">{value ?? '—'}</div>
      <div className="text-xs font-semibold text-gray-500 mt-1 truncate">{label}</div>
    </div>
  );
}

function CompanyDetails({ company }: { company: TargetingCompanyRecommendation }) {
  const reasons = (company.why_this_target ?? []).slice(0, 5);
  const confidenceReasons = (company.confidence_reasons ?? []).slice(0, 3);
  const attendees = (company.top_attendees ?? []).slice(0, 3);

  return (
    <div className="mt-2 grid gap-4 lg:grid-cols-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
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
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Top attendees</p>
        {attendees.length > 0 ? (
          <div className="space-y-1.5">
            {attendees.map(attendee => (
              <div key={attendee.attendee_id} className="text-xs text-gray-600 min-w-0">
                <Link href={`/attendees/${attendee.attendee_id}`} className="font-semibold text-gray-800 hover:text-brand-secondary transition-colors">
                  {attendee.attendee_name}
                </Link>
                <span>{attendee.title ? ` — ${attendee.title}` : ''}</span>
                {attendee.normalized_title && <span className="text-gray-400"> ({attendee.normalized_title})</span>}
                <div className="flex flex-wrap gap-1 mt-1">
                  <Pill tone="blue">Buyer Fit {Math.round(scoreOrNull(attendee.buyer_fit_score) ?? 0)}</Pill>
                  <Pill>{String(attendee.buyer_role_classification).replace(/_/g, ' ')}</Pill>
                  <Pill tone={confidenceTone(attendee.title_match_confidence)}>{attendee.title_match_confidence}</Pill>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-gray-400">No attendee details available.</p>}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Confidence</p>
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

function CompanyRow({ company }: { company: TargetingCompanyRecommendation }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="border-b border-gray-100 align-top hover:bg-gray-50/60">
        <td className="py-3 px-3 min-w-48">
          <button onClick={() => setExpanded(v => !v)} className="text-left font-semibold text-gray-900 hover:text-brand-secondary transition-colors">
            {company.company_name}
          </button>
          <p className="text-xs text-gray-400 mt-0.5">{expanded ? 'Hide details' : 'Show details'}</p>
        </td>
        <td className="py-3 px-3"><ScoreBadge value={scoreOrNull(company.target_priority_score)} /></td>
        <td className="py-3 px-3"><Pill tone={tierTone(company)}>{company.target_priority_tier || '—'}</Pill></td>
        <td className="py-3 px-3 min-w-44">
          <Pill tone="blue">{company.recommended_action_label || company.recommended_action?.recommended_action_label || '—'}</Pill>
          {company.recommended_action_reason && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{company.recommended_action_reason}</p>}
        </td>
        <td className="py-3 px-3"><ScoreBadge value={scoreOrNull(company.icp_fit_score)} /></td>
        <td className="py-3 px-3"><ScoreBadge value={scoreOrNull(company.buyer_access_score)} /></td>
        <td className="py-3 px-3"><ScoreBadge value={scoreOrNull(company.relationship_leverage_score)} /></td>
        <td className="py-3 px-3"><ScoreBadge value={scoreOrNull(company.conference_opportunity_score)} /></td>
        <td className="py-3 px-3"><Pill tone={confidenceTone(company.confidence_level)}>{company.confidence_level || '—'}</Pill></td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100">
          <td colSpan={9} className="px-3 pb-3 pt-0"><CompanyDetails company={company} /></td>
        </tr>
      )}
    </>
  );
}

export function TargetRecommendationsTab({ conferenceId }: { conferenceId: number }) {
  const [data, setData] = useState<TargetingApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ tier: 'all', action: 'all', confidence: 'all', hasBuyerAccess: false, hasRelationship: false, needsTitleReview: false });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/conferences/${conferenceId}/targeting`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load targeting recommendations');
        const json = await res.json() as TargetingApiResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [conferenceId]);

  const companies = useMemo(() => sortCompaniesByPriority(data?.companies ?? []), [data]);
  const actionLabelMap = useMemo(() => buildActionLabelMap(data?.scoring_config?.recommended_actions), [data]);
  const summary = useMemo(() => summarizeTargetRecommendations(companies), [companies]);
  const buckets = useMemo(() => buildTargetBuckets(companies), [companies]);
  const titleReviewItems = useMemo(() => collectTitleReviewItems(companies).slice(0, 12), [companies]);
  const actionCounts = useMemo(() => countRecommendedActions(companies, actionLabelMap), [companies, actionLabelMap]);

  const tiers = useMemo(() => Array.from(new Map(companies.map(company => [stableKey(company.target_priority_tier_key || company.target_priority_tier), company.target_priority_tier])).entries()).filter(([key]) => key), [companies]);
  const actions = useMemo(() => actionCounts.map(action => ({ key: action.key, label: action.label })), [actionCounts]);
  const confidences = useMemo(() => Array.from(new Set(companies.map(company => company.confidence_level).filter(Boolean))) as string[], [companies]);

  const filteredCompanies = useMemo(() => companies.filter(company => {
    if (filters.tier !== 'all' && stableKey(company.target_priority_tier_key || company.target_priority_tier) !== filters.tier) return false;
    const actionKey = company.recommended_action_key || company.recommended_action?.recommended_action_key;
    if (filters.action !== 'all' && actionKey !== filters.action) return false;
    if (filters.confidence !== 'all' && stableKey(company.confidence_level) !== filters.confidence) return false;
    if (filters.hasBuyerAccess && (scoreOrNull(company.buyer_access_score) ?? 0) < 75) return false;
    if (filters.hasRelationship && (scoreOrNull(company.relationship_leverage_score) ?? 0) < 50) return false;
    if (filters.needsTitleReview && !(company.top_attendees ?? []).some(titleNeedsReview)) return false;
    return true;
  }), [companies, filters]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={() => { setData(null); setLoading(true); setError(false); fetch(`/api/conferences/${conferenceId}/targeting`, { cache: 'no-store' }).then(async res => { if (!res.ok) throw new Error(); setData(await res.json() as TargetingApiResponse); }).catch(() => setError(true)).finally(() => setLoading(false)); }} />;
  if (!data || companies.length === 0) return <EmptyState reason={data?.unavailable_reason} />;

  const visibleCompanies = filteredCompanies.slice(0, TOP_COMPANY_LIMIT);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-brand-primary">Target Recommendations</h3>
        <p className="text-sm text-gray-500 mt-1">Which companies should we target at this conference, and why?</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Must Target" value={summary.mustTarget} />
        <KpiCard label="High Priority" value={summary.highPriority} />
        <KpiCard label="Worth Engaging" value={summary.worthEngaging} />
        <KpiCard label="Needs Title Review" value={summary.needsTitleReview} />
        <KpiCard label="Avg Target Priority" value={summary.avgTargetPriority} />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h4 className="font-bold text-brand-primary">Top Target Companies</h4>
            <p className="text-xs text-gray-500 mt-0.5">Companies ranked by Target Priority Score</p>
            {filteredCompanies.length > TOP_COMPANY_LIMIT && <p className="text-xs text-gray-400 mt-1">Showing top {TOP_COMPANY_LIMIT} of {filteredCompanies.length}</p>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <select value={filters.tier} onChange={e => setFilters(f => ({ ...f, tier: e.target.value }))} className="rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-gray-600">
              <option value="all">All tiers</option>
              {tiers.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} className="rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-gray-600">
              <option value="all">All actions</option>
              {actions.map(action => <option key={action.key} value={action.key}>{action.label}</option>)}
            </select>
            <select value={filters.confidence} onChange={e => setFilters(f => ({ ...f, confidence: e.target.value }))} className="rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-gray-600">
              <option value="all">All confidence</option>
              {confidences.map(confidence => <option key={confidence} value={stableKey(confidence)}>{confidence}</option>)}
            </select>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-gray-600">
              <input type="checkbox" checked={filters.hasBuyerAccess} onChange={e => setFilters(f => ({ ...f, hasBuyerAccess: e.target.checked }))} /> Buyer access
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-gray-600">
              <input type="checkbox" checked={filters.hasRelationship} onChange={e => setFilters(f => ({ ...f, hasRelationship: e.target.checked }))} /> Relationship
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-gray-600">
              <input type="checkbox" checked={filters.needsTitleReview} onChange={e => setFilters(f => ({ ...f, needsTitleReview: e.target.checked }))} /> Needs title review
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold py-2 px-3">Company</th>
                <th className="text-left font-semibold py-2 px-3">Score</th>
                <th className="text-left font-semibold py-2 px-3">Tier</th>
                <th className="text-left font-semibold py-2 px-3">Recommended Action</th>
                <th className="text-left font-semibold py-2 px-3">ICP</th>
                <th className="text-left font-semibold py-2 px-3">Buyer</th>
                <th className="text-left font-semibold py-2 px-3">Relationship</th>
                <th className="text-left font-semibold py-2 px-3">Opportunity</th>
                <th className="text-left font-semibold py-2 px-3">Confidence</th>
              </tr>
            </thead>
            <tbody>{visibleCompanies.map(company => <CompanyRow key={company.company_id} company={company} />)}</tbody>
          </table>
        </div>
        {visibleCompanies.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No companies match the selected filters.</p>}
      </section>

      <section>
        <h4 className="font-bold text-brand-primary mb-1">Target Buckets</h4>
        <p className="text-xs text-gray-500 mb-3">Practical planning segments based on backend scores.</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
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

      <section className="grid xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="font-bold text-brand-primary">Needs Title Review</h4>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">Review fuzzy, low-confidence, or unmatched titles to improve Buyer Access and Target Priority Scores.</p>
          {titleReviewItems.length > 0 ? (
            <div className="space-y-2">
              {titleReviewItems.map(attendee => (
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
                  <Link href={`/attendees/${attendee.attendee_id}`} className="text-xs font-semibold text-brand-secondary hover:text-brand-primary transition-colors whitespace-nowrap">Review Title</Link>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 py-6 text-center">All high-value attendee titles are classified.</p>}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="font-bold text-brand-primary">Recommended Actions</h4>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">Workload summary for activating this target list.</p>
          {actionCounts.length > 0 ? (
            <div className="space-y-2">
              {actionCounts.map(action => (
                <div key={action.key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
                  <span className="text-sm text-gray-700 truncate">{action.label}</span>
                  <Pill tone="blue">{action.count}</Pill>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 py-6 text-center">No recommended actions available.</p>}
        </div>
      </section>
    </div>
  );
}
