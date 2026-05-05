'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { BUYER_ROLE_OPTIONS, type BuyerRoleKey } from '@/lib/titleNormalization';
import { formatValuePill, useAvgCostPerUnit } from '@/lib/useAvgCostPerUnit';
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
const TARGETING_BATCH_SIZE = 25;

type CompilationStatus = 'idle' | 'compiling' | 'ready' | 'error';

type CompilationSnapshot = {
  status: CompilationStatus;
  data: TargetingApiResponse | null;
  error: string | null;
  completed: number;
  total: number | null;
};

const compilationStore = new Map<number, CompilationSnapshot>();
const compilationPromises = new Map<number, Promise<void>>();
const compilationListeners = new Map<number, Set<() => void>>();

function defaultSnapshot(): CompilationSnapshot {
  return { status: 'idle', data: null, error: null, completed: 0, total: null };
}

function getCompilationSnapshot(conferenceId: number): CompilationSnapshot {
  return compilationStore.get(conferenceId) ?? defaultSnapshot();
}

function setCompilationSnapshot(conferenceId: number, snapshot: CompilationSnapshot) {
  compilationStore.set(conferenceId, snapshot);
  compilationListeners.get(conferenceId)?.forEach(listener => listener());
}

function subscribeToCompilation(conferenceId: number, listener: () => void): () => void {
  const listeners = compilationListeners.get(conferenceId) ?? new Set<() => void>();
  listeners.add(listener);
  compilationListeners.set(conferenceId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) compilationListeners.delete(conferenceId);
  };
}

async function fetchTargetingBatch(conferenceId: number, offset: number): Promise<TargetingApiResponse> {
  const params = new URLSearchParams({ batch: '1', offset: String(offset), limit: String(TARGETING_BATCH_SIZE) });
  const res = await fetch(`/api/conferences/${conferenceId}/targeting?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load targeting recommendations');
  return res.json() as Promise<TargetingApiResponse>;
}

function startTargetRecommendationsCompilation(conferenceId: number, force = false): CompilationSnapshot {
  const current = getCompilationSnapshot(conferenceId);
  if (!force && (current.status === 'compiling' || current.status === 'ready' || compilationPromises.has(conferenceId))) return current;

  const initial: CompilationSnapshot = { status: 'compiling', data: null, error: null, completed: 0, total: null };
  setCompilationSnapshot(conferenceId, initial);

  const promise = (async () => {
    let offset = 0;
    let total: number | null = null;
    let unavailableReason: string | undefined;
    let scoringConfig: TargetingApiResponse['scoring_config'];
    const companies: NonNullable<TargetingApiResponse['companies']> = [];

    try {
      while (true) {
        const batch = await fetchTargetingBatch(conferenceId, offset);
        unavailableReason = batch.unavailable_reason ?? unavailableReason;
        scoringConfig = scoringConfig ?? batch.scoring_config;
        companies.push(...(batch.companies ?? []));

        const pagination = batch.pagination;
        total = pagination?.total_companies ?? companies.length;
        const completed = Math.min(total, pagination ? pagination.offset + pagination.returned : companies.length);
        setCompilationSnapshot(conferenceId, {
          status: 'compiling',
          data: { ...batch, companies: sortCompaniesByPriority(companies), scoring_config: scoringConfig },
          error: null,
          completed,
          total,
        });

        if (!pagination?.has_more || pagination.next_offset == null) break;
        offset = pagination.next_offset;
      }

      const readyData: TargetingApiResponse = {
        conference_id: conferenceId,
        generated_at: new Date().toISOString(),
        scoring_config: scoringConfig,
        companies: sortCompaniesByPriority(companies),
        pagination: total == null ? undefined : {
          offset: 0,
          limit: companies.length,
          total_companies: total,
          returned: companies.length,
          has_more: false,
          next_offset: null,
        },
        unavailable_reason: companies.length === 0 ? unavailableReason : undefined,
      };

      setCompilationSnapshot(conferenceId, { status: 'ready', data: readyData, error: null, completed: companies.length, total });
      toast.success('Target recommendations are ready.');
    } catch {
      setCompilationSnapshot(conferenceId, { status: 'error', data: null, error: 'Unable to load target recommendations.', completed: companies.length, total });
      toast.error('Unable to load target recommendations.');
    } finally {
      compilationPromises.delete(conferenceId);
    }
  })();

  compilationPromises.set(conferenceId, promise);
  return initial;
}

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

type ConfigOptionRecord = { id: number; category: string; value: string };
type TitleRuleForm = { normalized_title: string; function_id: string; seniority_id: string; buyer_role: BuyerRoleKey; confidence: string; notes: string; apply_all_exact: boolean };

function KpiCard({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 min-w-0">
      <div className="text-2xl font-bold text-brand-primary leading-tight">{value ?? '—'}</div>
      <div className="text-xs font-semibold text-gray-500 mt-1 truncate">{label}</div>
    </div>
  );
}

function CompanyDetails({ company, onReviewTitle }: { company: TargetingCompanyRecommendation; onReviewTitle: (attendee: NonNullable<TargetingCompanyRecommendation['top_attendees']>[number]) => void }) {
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
                {titleNeedsReview(attendee) && (
                  <button type="button" onClick={() => onReviewTitle(attendee)} className="ml-1 text-amber-600 hover:text-amber-700" title="Needs title review" aria-label="Needs title review">⚠️</button>
                )}
                {attendee.normalized_title && <span className="text-gray-400"> ({attendee.normalized_title})</span>}
                <div className="flex flex-wrap gap-1 mt-1">
                  <Pill tone="blue">Buyer Fit {Math.round(scoreOrNull(attendee.buyer_fit_score) ?? 0)}</Pill>
                  <Pill>{String(attendee.buyer_role_classification) === 'decision_maker' ? 'DM' : String(attendee.buyer_role_classification) === 'influencer' ? 'Inf.' : String(attendee.buyer_role_classification) === 'target_title' ? 'Target' : String(attendee.buyer_role_classification).replace(/_/g, ' ')}</Pill>
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

function CompanyRow({ company, onReviewTitle, avgCostPerUnit }: { company: TargetingCompanyRecommendation; onReviewTitle: (attendee: NonNullable<TargetingCompanyRecommendation['top_attendees']>[number]) => void; avgCostPerUnit: number }) {
  const [expanded, setExpanded] = useState(false);
  const companyValue = formatValuePill(company.wse, avgCostPerUnit);
  return (
    <>
      <tr className="border-b border-gray-100 align-top hover:bg-gray-50/60">
        <td className="py-3 px-3 min-w-48">
          <button onClick={() => setExpanded(v => !v)} className="text-left font-semibold text-gray-900 hover:text-brand-secondary transition-colors">
            {company.company_name}
          </button>
          <p className="text-xs text-gray-400 mt-0.5">{expanded ? 'Hide details' : 'Show details'}</p>
        </td>
        <td className="py-3 px-3">{companyValue ? <Pill tone="green">{companyValue}</Pill> : <span className="text-gray-400">—</span>}</td>
        <td className="py-3 px-3"><ScoreBadge value={scoreOrNull(company.target_priority_score)} /></td>
        <td className="py-3 px-3"><Pill tone={tierTone(company)}>{company.target_priority_tier || '—'}</Pill></td>
        <td className="py-3 px-3 min-w-44">
          <Pill tone="blue">{company.recommended_action_label || company.recommended_action?.recommended_action_label || '—'}</Pill>
          {company.recommended_action_reason && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{company.recommended_action_reason}</p>}
        </td>
        <td className="py-3 px-3"><ScoreValueTooltip value={scoreOrNull(company.icp_fit_score)} title="ICP Fit Score" reasons={[...(company.matched_icp_reasons ?? []), ...(company.failed_icp_reasons ?? []).map(r => `Gap: ${r}`)]} /></td>
        <td className="py-3 px-3"><ScoreValueTooltip value={scoreOrNull(company.buyer_access_score)} title="Buyer Access Score" reasons={(company.top_attendees ?? []).flatMap(a => a.why_this_attendee ?? []).slice(0, 5)} /></td>
        <td className="py-3 px-3"><ScoreValueTooltip value={scoreOrNull(company.relationship_leverage_score)} title="Relationship Leverage Score" reasons={company.relationship_reasons ?? []} /></td>
        <td className="py-3 px-3"><ScoreValueTooltip value={scoreOrNull(company.conference_opportunity_score)} title="Conference Opportunity Score" reasons={[...(company.opportunity_reasons ?? []), `Attendees: ${company.attendee_count ?? 0}`, `High-priority attendees: ${company.high_priority_attendee_count ?? 0}`, `Scheduled meetings: ${company.scheduled_meeting_count ?? 0}`]} /></td>
        <td className="py-3 px-3"><Pill tone={confidenceTone(company.confidence_level)}>{company.confidence_level || '—'}</Pill></td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100">
          <td colSpan={10} className="px-3 pb-3 pt-0"><CompanyDetails company={company} onReviewTitle={onReviewTitle} /></td>
        </tr>
      )}
    </>
  );
}

export function TargetRecommendationsTab({ conferenceId }: { conferenceId: number }) {
  const [snapshot, setSnapshot] = useState<CompilationSnapshot>(() => getCompilationSnapshot(conferenceId));
  const [filters, setFilters] = useState<FilterState>({ tier: 'all', action: 'all', confidence: 'all', hasBuyerAccess: false, hasRelationship: false, needsTitleReview: false });
  const [functionOptions, setFunctionOptions] = useState<ConfigOptionRecord[]>([]);
  const [seniorityOptions, setSeniorityOptions] = useState<ConfigOptionRecord[]>([]);
  const [titleReviewAttendee, setTitleReviewAttendee] = useState<NonNullable<TargetingCompanyRecommendation['top_attendees']>[number] | null>(null);
  const avgCostPerUnit = useAvgCostPerUnit();
  const [isSavingTitleRule, setIsSavingTitleRule] = useState(false);
  const [titleRuleForm, setTitleRuleForm] = useState<TitleRuleForm>({ normalized_title: '', function_id: '', seniority_id: '', buyer_role: 'target_title', confidence: 'high', notes: '', apply_all_exact: true });
  const [titleReviewListOpen, setTitleReviewListOpen] = useState(false);
  const [dismissedTitleReviewIds, setDismissedTitleReviewIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const unsubscribe = subscribeToCompilation(conferenceId, () => setSnapshot(getCompilationSnapshot(conferenceId)));
    setSnapshot(startTargetRecommendationsCompilation(conferenceId));
    return unsubscribe;
  }, [conferenceId]);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then((rows: ConfigOptionRecord[]) => {
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
        setDismissedTitleReviewIds(prev => new Set([...prev, titleReviewAttendee.attendee_id]));
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
      setDismissedTitleReviewIds(prev => new Set([...prev, currentId]));
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
  const buckets = useMemo(() => buildTargetBuckets(companies), [companies]);
  const titleReviewItems = useMemo(() => collectTitleReviewItems(companies).slice(0, 12), [companies]);
  const visibleTitleReviewItems = useMemo(
    () => titleReviewItems.filter(a => !dismissedTitleReviewIds.has(a.attendee_id)),
    [titleReviewItems, dismissedTitleReviewIds],
  );
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

  if ((snapshot.status === 'idle' || isCompiling) && !hasData) return <LoadingState completed={snapshot.completed} total={snapshot.total} />;
  if (snapshot.status === 'error' && !hasData) return <ErrorState onRetry={() => setSnapshot(startTargetRecommendationsCompilation(conferenceId, true))} />;
  if (snapshot.status === 'ready' && (!data || companies.length === 0)) return <EmptyState reason={data?.unavailable_reason} />;

  const visibleCompanies = filteredCompanies.slice(0, TOP_COMPANY_LIMIT);

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
                <th className="text-left font-semibold py-2 px-3">Confidence</th>
              </tr>
            </thead>
            <tbody>{visibleCompanies.map(company => <CompanyRow key={company.company_id} company={company} onReviewTitle={openTitleReviewModal} avgCostPerUnit={avgCostPerUnit} />)}</tbody>
          </table>
        </div>
        <div className="md:hidden p-3 space-y-3">
          {visibleCompanies.map(company => <MobileCompanyCard key={company.company_id} company={company} onReviewTitle={openTitleReviewModal} />)}
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

function MobileCompanyCard({ company, onReviewTitle }: { company: TargetingCompanyRecommendation; onReviewTitle: (attendee: NonNullable<TargetingCompanyRecommendation['top_attendees']>[number]) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <button type="button" onClick={() => setExpanded(v => !v)} className="w-full text-left">
        <p className="font-semibold text-gray-900">{company.company_name}</p>
        <p className="text-xs text-gray-500">Score {Math.round(scoreOrNull(company.target_priority_score) ?? 0)} · {company.target_priority_tier || '—'}</p>
      </button>
      {expanded && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
            <p>ICP: {Math.round(scoreOrNull(company.icp_fit_score) ?? 0)}</p>
            <p>Buyer: {Math.round(scoreOrNull(company.buyer_access_score) ?? 0)}</p>
            <p>Relationship: {Math.round(scoreOrNull(company.relationship_leverage_score) ?? 0)}</p>
            <p>Opportunity: {Math.round(scoreOrNull(company.conference_opportunity_score) ?? 0)}</p>
          </div>
          <CompanyDetails company={company} onReviewTitle={onReviewTitle} />
        </>
      )}
    </div>
  );
}
