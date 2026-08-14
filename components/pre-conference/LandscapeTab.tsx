'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { TargetBtn } from './TargetBtn';
import { useRecordDrawer } from './RecordDrawerContext';
import type { LandscapeData, TargetEntry, ClientCompanyEntry, ByRepEntry, IcpCompany, RelationshipRow } from '../PreConferenceReview';
import type { StrategyAssessment } from '@/lib/strategyAssessment';
import { useAvgCostPerUnit } from '@/lib/useAvgCostPerUnit';
import { StrategyAlignmentDrawer } from '../StrategyAlignmentDrawer';
import { companyTierToConferenceTier } from '@/lib/targeting/targetRecommendationsView';
import { useTargetingCompilation } from '@/lib/targeting/targetingCompilationStore';
import type { TerritoryResponse } from '@/app/api/admin/territories/route';
import { getBadgeClass, getPreset, formatStatusLabel} from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import toast from 'react-hot-toast';

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

const STRATEGY_PILL_TONE_CLASSES: Record<'green' | 'gold' | 'red', string> = {
  green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  gold: 'bg-amber-50 text-amber-700 border border-amber-200',
  red: 'bg-red-50 text-red-700 border border-red-200',
};

function normalizeStrategyLabel(v: string | null | undefined): string | null {
  const t = (v ?? '').trim().toLowerCase();
  return t.length > 0 ? t : null;
}

function SelectedStrategyPill({ sa }: { sa: StrategyAssessment }) {
  if (!sa.selectedStrategy) return null;

  const selected = normalizeStrategyLabel(sa.selectedStrategy);
  const recommended = normalizeStrategyLabel(sa.recommendedStrategy);
  const secondary = normalizeStrategyLabel(sa.secondaryStrategy);

  const tone: 'green' | 'gold' | 'red' =
    selected && recommended && selected === recommended ? 'green'
    : selected && secondary && selected === secondary ? 'gold'
    : 'red';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap flex-shrink-0 ${STRATEGY_PILL_TONE_CLASSES[tone]}`}>
      {tone === 'red' ? (
        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ) : (
        <svg className="w-2 h-2 flex-shrink-0" viewBox="0 0 8 8" fill="currentColor">
          <circle cx="4" cy="4" r="4" />
        </svg>
      )}
      {sa.selectedStrategy}
    </span>
  );
}

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
        Pre-Conf. Strategy Score
      </div>
      <div className="flex items-end gap-1 mt-1">
        <div className="text-4xl font-bold" style={{ color }}>{sa.strategyFitScore}</div>
        <div className="text-sm text-gray-400 mb-0.5">/100</div>
      </div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-semibold" style={{ color }}>{sa.strategyFitInterpretation}</div>
        <SelectedStrategyPill sa={sa} />
      </div>

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

function ActionsPanel({
  sa,
  icpCompanies,
  territoryScope,
  territoryIds,
  onSelectRep,
  selectedRepName,
}: {
  sa: StrategyAssessment;
  icpCompanies: IcpCompany[];
  territoryScope: 'national' | 'regional' | null;
  territoryIds: number[];
  onSelectRep: (rep: RepChartEntry) => void;
  selectedRepName: string | null;
}) {
  const [showChart, setShowChart] = useState(false);

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
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Staffing</div>
        <StaffingPills icpCompanies={icpCompanies} territoryScope={territoryScope} territoryIds={territoryIds} onSelectRep={onSelectRep} selectedRepName={selectedRepName} />
      </div>
    </div>
  );
}

function StaffingPills({
  icpCompanies,
  territoryScope,
  territoryIds,
  onSelectRep,
  selectedRepName,
}: {
  icpCompanies: IcpCompany[];
  territoryScope: 'national' | 'regional' | null;
  territoryIds: number[];
  onSelectRep: (rep: RepChartEntry) => void;
  selectedRepName: string | null;
}) {
  const avgCostPerUnit = useAvgCostPerUnit();
  const [territories, setTerritories] = useState<TerritoryResponse[]>([]);
  const [territoriesLoaded, setTerritoriesLoaded] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const scrollRow = (dir: -1 | 1) => rowRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });

  useEffect(() => {
    fetch('/api/admin/territories')
      .then(r => r.ok ? r.json() : { territories: [] })
      .then((data: { territories?: TerritoryResponse[] }) => setTerritories(data.territories ?? []))
      .catch(() => setTerritories([]))
      .finally(() => setTerritoriesLoaded(true));
  }, []);

  // Rep display name -> color, resolved from whichever territory that rep belongs
  // to — the same colors configured in Admin > Sales Reps, so a rep's pill here
  // matches their color everywhere else in the app.
  const repColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of territories) {
      for (const u of t.assignedUsers) {
        if (!map.has(u.displayName)) map.set(u.displayName, t.color);
      }
    }
    return map;
  }, [territories]);

  // Same per-rep company grouping the Prospects by Assigned Rep chart uses, so
  // clicking a staffing pill can open that identical rep drill-down drawer.
  const repData = useMemo(() => computeRepData(icpCompanies), [icpCompanies]);
  const selectRepByName = (name: string, color: string) => {
    onSelectRep(repData.find(r => r.name === name) ?? { name, companies: [], count: 0, color });
  };

  if (territoryScope == null) {
    return <p className="text-xs text-gray-400">Set this conference&rsquo;s territory scope (National or Regional) in Conference Details to see staffing recommendations.</p>;
  }

  if (territoryScope === 'regional') {
    if (!territoriesLoaded) return <p className="text-xs text-gray-400">Loading reps…</p>;
    const selected = territories.filter(t => territoryIds.includes(t.id));
    const pills = selected.flatMap(t => t.assignedUsers.map(u => ({ key: `${t.id}-${u.userId}`, name: u.displayName, label: `${u.displayName} - ${t.name}`, color: t.color })));
    if (pills.length === 0) return <p className="text-xs text-gray-400">No reps assigned to this conference&rsquo;s territories yet.</p>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {pills.map(p => {
          const isDimmed = selectedRepName != null && selectedRepName !== p.name;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => selectRepByName(p.name, p.color)}
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap hover:brightness-95 transition-all duration-150"
              style={{
                backgroundColor: hexAlpha(p.color, 0.12),
                color: p.color,
                border: `1px solid ${hexAlpha(p.color, 0.3)}`,
                filter: isDimmed ? 'grayscale(1)' : undefined,
                opacity: isDimmed ? 0.4 : 1,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    );
  }

  // National — rank reps by total pipeline value (same $-mode total shown in
  // Prospects by Assigned Rep), descending.
  if (avgCostPerUnit <= 0) return <p className="text-xs text-gray-400">Set avg. cost per unit in Admin Settings to rank reps by pipeline.</p>;

  const totals = new Map<string, number>();
  for (const co of icpCompanies) {
    const rep = co.assigned_user_names?.[0];
    if (!rep) continue;
    totals.set(rep, (totals.get(rep) ?? 0) + (companyValue(co, avgCostPerUnit) ?? 0));
  }
  const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) return <p className="text-xs text-gray-400">No reps assigned to attending companies yet.</p>;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => scrollRow(-1)}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-700 transition-colors"
        aria-label="Scroll reps left"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div ref={rowRef} className="flex-1 min-w-0 flex flex-nowrap gap-2.5 overflow-x-auto scrollbar-hide">
        {ranked.map(([name, value]) => {
          const color = repColorMap.get(name) ?? '#6b7280';
          const isDimmed = selectedRepName != null && selectedRepName !== name;
          return (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => selectRepByName(name, color)}
              className="w-12 h-12 rounded-full flex flex-col items-center justify-center flex-shrink-0 hover:brightness-95 transition-all duration-150"
              style={{
                backgroundColor: hexAlpha(color, 0.12),
                border: `1.5px solid ${hexAlpha(color, 0.35)}`,
                filter: isDimmed ? 'grayscale(1)' : undefined,
                opacity: isDimmed ? 0.4 : 1,
              }}
            >
              <span className="text-xs font-bold leading-none" style={{ color }}>{repInitials(name)}</span>
              <span className="text-[9px] font-semibold leading-none mt-1" style={{ color }}>{abbreviateDollar(value)}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => scrollRow(1)}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-700 transition-colors"
        aria-label="Scroll reps right"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// ─── Strategy alignment bar ──────────────────────────────────────────────────────

const ALIGNMENT_PARTIAL_MESSAGE = "Your selected conference strategy partially aligns with Parlay's recommended conference strategy.";
const ALIGNMENT_MISALIGNED_MESSAGE = "Your selected conference strategy and Parlay's recommended conference strategies are misaligned.";

async function resolveStrategyOptionId(label: string): Promise<number | null> {
  const res = await fetch('/api/config?category=conference_strategy_type');
  if (!res.ok) return null;
  const opts = await res.json() as Array<{ id: number; value: string }>;
  return opts.find(o => o.value === label)?.id ?? null;
}

function StrategyAlignmentRow({
  sa,
  conferenceId,
  conferenceName,
  onStrategyUpdated,
}: {
  sa: StrategyAssessment;
  conferenceId: number;
  conferenceName: string;
  onStrategyUpdated: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [updatingTarget, setUpdatingTarget] = useState<'recommended' | 'secondary' | null>(null);

  const applyStrategyUpdate = async (targetStrategy: string, which: 'recommended' | 'secondary') => {
    setUpdatingTarget(which);
    try {
      const optionId = await resolveStrategyOptionId(targetStrategy);
      if (optionId == null) throw new Error('Strategy option not found');
      const confRes = await fetch(`/api/conferences/${conferenceId}`);
      if (!confRes.ok) throw new Error('Failed to load conference');
      const conf = await confRes.json();
      const putRes = await fetch(`/api/conferences/${conferenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...conf, conference_strategy_type_id: optionId }),
      });
      if (!putRes.ok) throw new Error('Failed to update conference');
      toast.success(`${conferenceName}'s strategy updated to ${targetStrategy}.`);
      setDrawerOpen(false);
      onStrategyUpdated();
    } catch {
      toast.error("Failed to update the conference's strategy.");
    } finally {
      setUpdatingTarget(null);
    }
  };

  const handleKeepAsIs = () => {
    setDrawerOpen(false);
    toast(`No changes were made to ${conferenceName}'s strategy`);
  };

  if (sa.strategyAlignment === 'aligned') return null;

  if (sa.strategyAlignment === 'unset') {
    return (
      <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-gray-50">
        <div className="flex items-center gap-2 flex-shrink-0">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Review Strategy Alignment</span>
        </div>
        <span className="text-xs text-gray-400">No strategy selected</span>
      </div>
    );
  }

  const alignment = sa.strategyAlignment as 'partial' | 'misaligned';
  const tone: 'amber' | 'red' = alignment === 'partial' ? 'amber' : 'red';
  const toneRowBg = tone === 'amber' ? 'bg-amber-50' : 'bg-red-50';
  const toneLabelText = tone === 'amber' ? 'text-amber-700' : 'text-red-700';
  const toneIcon = tone === 'amber' ? 'text-amber-500' : 'text-red-500';
  const toneButton = tone === 'amber'
    ? 'bg-amber-600 hover:bg-amber-700 text-white'
    : 'bg-red-600 hover:bg-red-700 text-white';
  const message = alignment === 'partial' ? ALIGNMENT_PARTIAL_MESSAGE : ALIGNMENT_MISALIGNED_MESSAGE;

  const drawerProps = {
    alignment,
    selectedStrategy: sa.selectedStrategy ?? '',
    recommendedStrategy: sa.recommendedStrategy,
    secondaryStrategy: sa.secondaryStrategy,
    alignmentMessage: sa.strategyAlignmentMessage,
    componentScores: {
      icpOpportunity: sa.icpOpportunityScore,
      targetAccountOpportunity: sa.targetAccountOpportunityScore,
      buyerAccess: sa.buyerAccessScore,
      relationshipLeverage: sa.relationshipLeverageScore,
      customerPresence: sa.customerPresenceScore,
      pipelinePotential: sa.pipelinePotentialScore,
      eventEconomicsFit: sa.eventEconomicsFitScore,
    },
    scoreWithSelected: sa.scoreWithSelectedStrategy,
    scoreWithRecommended: sa.scoreWithRecommendedStrategy,
    scoreWithSecondary: sa.scoreWithSecondaryStrategy,
    conferenceName,
    updatingTarget,
    onUpdateToRecommended: () => applyStrategyUpdate(sa.recommendedStrategy, 'recommended'),
    onUpdateToSecondary: sa.secondaryStrategy ? () => applyStrategyUpdate(sa.secondaryStrategy!, 'secondary') : undefined,
    onKeepAsIs: handleKeepAsIs,
    onClose: () => setDrawerOpen(false),
  };

  return (
    <div>
      <div className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl px-4 py-3 ${toneRowBg}`}>
        <div className="flex items-center justify-between gap-2 sm:justify-start sm:flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className={`w-4 h-4 flex-shrink-0 ${toneIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className={`text-xs font-bold uppercase tracking-wide whitespace-nowrap ${toneLabelText}`}>Review Strategy Alignment</span>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(o => !o)}
            className={`sm:hidden px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${toneButton}`}
          >
            Review Details
          </button>
        </div>
        <span className={`text-xs sm:flex-1 sm:min-w-0 ${toneLabelText}`}>{message}</span>
        <button
          type="button"
          onClick={() => setDrawerOpen(o => !o)}
          className={`hidden sm:block px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${toneButton}`}
        >
          Review Details
        </button>
      </div>

      {/* Desktop: in-flow accordion that pushes the rows below it down */}
      <div
        className="hidden sm:grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: drawerOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">
          <StrategyAlignmentDrawer {...drawerProps} />
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={`sm:hidden fixed inset-0 z-[65] bg-black/30 transition-opacity duration-300 ease-in-out ${drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setDrawerOpen(false)}
      />
      <div
        className={`sm:hidden fixed inset-x-0 bottom-0 z-[66] max-h-[85vh] overflow-y-auto rounded-t-2xl shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
      >
        <StrategyAlignmentDrawer {...drawerProps} />
      </div>
    </div>
  );
}

// ─── Full section ──────────────────────────────────────────────────────────────

function StrategyAssessmentSection({
  sa,
  conferenceId,
  conferenceName,
  onStrategyUpdated,
  icpCompanies,
  territoryScope,
  territoryIds,
  onSelectRep,
  selectedRepName,
}: {
  sa: StrategyAssessment;
  conferenceId: number;
  conferenceName: string;
  onStrategyUpdated: () => void;
  icpCompanies: IcpCompany[];
  territoryScope: 'national' | 'regional' | null;
  territoryIds: number[];
  onSelectRep: (rep: RepChartEntry) => void;
  selectedRepName: string | null;
}) {
  return (
    <div className="pb-2 border-b border-gray-100 mb-6 space-y-4">
      {/* Strategy alignment bar — full width, above the score row */}
      <StrategyAlignmentRow sa={sa} conferenceId={conferenceId} conferenceName={conferenceName} onStrategyUpdated={onStrategyUpdated} />

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
          <ActionsPanel sa={sa} icpCompanies={icpCompanies} territoryScope={territoryScope} territoryIds={territoryIds} onSelectRep={onSelectRep} selectedRepName={selectedRepName} />
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

// Abbreviates a territory the same way the Program Planner Plan tab does:
// two words -> both initials, one word with an east/west suffix -> initial + E/W,
// otherwise the single initial.
function abbreviateTerritory(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const word = words[0];
  const lower = word.toLowerCase();
  if (lower.indexOf('east') > 0) return (word[0] + 'E').toUpperCase();
  if (lower.indexOf('west') > 0) return (word[0] + 'W').toUpperCase();
  return word[0].toUpperCase();
}

/**
 * Header row inside an expanded company card: a single line of pills carrying
 * the context a rep needs before reading the attendee list — assigned rep(s),
 * territory, company type, status and value. Shared by the Clients, Comp. and
 * Open Opps panels so all three read identically.
 */
function CompanyCardMetaRow({ co, accentColor }: { co: ClientCompanyEntry; accentColor: string }) {
  const colorMaps = useConfigColors();
  const avgCostPerUnit = useAvgCostPerUnit();
  const reps = co.assignedUserNames ?? [];
  const statuses = String(co.companyStatus ?? '')
    .split(',').map(v => v.trim()).filter(v => v && v !== 'Unknown');
  const value = co.wse != null && avgCostPerUnit > 0 ? co.wse * avgCostPerUnit : null;

  const hasAny = reps.length > 0 || co.territoryName || co.companyType || statuses.length > 0 || value != null;
  if (!hasAny) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1 px-3 py-1.5"
      style={{ borderTop: `1px solid ${hexAlpha(accentColor, 0.2)}`, backgroundColor: hexAlpha(accentColor, 0.04) }}
    >
      {/* Assigned rep — user icon + initials, matching the companies table */}
      {reps.map(name => (
        <span
          key={name}
          title={name}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${getPreset(colorMaps.user?.[name]).badgeClass}`}
        >
          <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {repInitials(name)}
        </span>
      ))}

      {/* Territory — abbreviated square chip, same treatment as the Plan tab */}
      {co.territoryName && (
        <span
          title={co.territoryName}
          className="inline-flex items-center justify-center rounded-md text-[10px] font-bold flex-shrink-0"
          style={{
            width: 22, height: 22,
            border: `1.5px solid ${co.territoryColor || '#185FA5'}`,
            backgroundColor: hexAlpha(co.territoryColor || '#185FA5', 0.15),
            color: co.territoryColor || '#185FA5',
          }}
        >
          {abbreviateTerritory(co.territoryName)}
        </span>
      )}

      {co.companyType && (
        <span className={`${getBadgeClass(co.companyType, colorMaps.company_type || {})} text-[10px]`}>{co.companyType}</span>
      )}

      {statuses.map(st => (
        <span key={st} className={`${getBadgeClass(st, colorMaps.status || {})} text-[10px]`}>{formatStatusLabel(st)}</span>
      ))}

      {value != null && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
          {abbreviateDollar(value)}
        </span>
      )}
    </div>
  );
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

      {expanded && <CompanyCardMetaRow co={co} accentColor={accentColor} />}

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
  headerContent,
  companies,
  accentColor,
  emptyText,
}: {
  title?: string;
  headerContent?: ReactNode;
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
          className="px-3 py-2.5 border-b flex-shrink-0"
          style={{
            backgroundColor: hexAlpha(color, 0.12),
            borderBottom: `1px solid ${hexAlpha(color, 0.3)}`,
          }}
        >
          {headerContent ?? (
            <div className="flex items-center justify-between">
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

function ToggleGroup({
  options,
  active,
  onChange,
  fullWidth,
  fullWidthMobile,
}: {
  options: { key: string; label: string; activeColor: string }[];
  active: string;
  onChange: (key: string) => void;
  fullWidth?: boolean;
  /** Full width only below the sm breakpoint, auto-width (right-alignable) at sm+ — for
   * toggles that live in a header row on desktop but need their own full-width row on mobile. */
  fullWidthMobile?: boolean;
}) {
  const containerWidth = fullWidth ? 'flex w-full' : fullWidthMobile ? 'flex w-full sm:inline-flex sm:w-auto' : 'inline-flex';
  const buttonWidth = fullWidth ? 'flex-1' : fullWidthMobile ? 'flex-1 sm:flex-none' : '';
  return (
    <div className={`${containerWidth} rounded-full border border-gray-200 bg-gray-100 p-0.5 gap-0.5`}>
      {options.map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${buttonWidth}`}
          style={active === opt.key ? { backgroundColor: opt.activeColor, color: '#fff' } : { color: '#6b7280' }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type ClientCompetitorMode = 'clients' | 'competitors' | 'openOpps';

function ClientCompetitorPanel({ data }: { data: LandscapeData }) {
  const [mode, setMode] = useState<ClientCompetitorMode>('clients');

  // Open Opps uses brand Primary #2, so it reads as its own lens rather than
  // borrowing the client (Primary #1) or competitor (red) accent.
  const openOppCompanies = data.openOppCompanies ?? [];
  const openOppColor = data.openOppColor || 'rgb(var(--brand-secondary-rgb))';

  const view: Record<ClientCompetitorMode, { companies: ClientCompanyEntry[]; color: string | null; empty: string }> = {
    clients:     { companies: data.clientCompanies, color: data.clientColor, empty: 'No client companies attending' },
    competitors: { companies: data.competitorCompanies, color: data.competitorColor, empty: 'No competitor companies attending' },
    openOpps:    { companies: openOppCompanies, color: openOppColor, empty: 'No open opportunities attending' },
  };
  const active = view[mode];

  const toggle = (
    <ToggleGroup
      fullWidth
      options={[
        { key: 'clients', label: `Clients (${data.clientCompanies.length})`, activeColor: 'rgb(var(--brand-primary-rgb))' },
        { key: 'competitors', label: `Comp. (${data.competitorCompanies.length})`, activeColor: '#dc2626' },
        { key: 'openOpps', label: `Open Opps (${openOppCompanies.length})`, activeColor: openOppColor },
      ]}
      active={mode}
      onChange={key => setMode(key as ClientCompetitorMode)}
    />
  );

  return (
    <CompanyPanel
      headerContent={toggle}
      companies={active.companies}
      accentColor={active.color}
      emptyText={active.empty}
    />
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

// Matches ConferenceTargetsTab's TIER_BAR_COLORS exactly, so the Targeted
// Pipeline charts here (Internal Relationships panel) look identical to the
// Conference Targets tab's own pipeline charts.
const TARGETED_PIPELINE_BAR_COLORS: Record<string, string> = {
  '1': '#dc2626',
  '2': 'rgb(var(--brand-primary-rgb, 30 58 95))',
  '3': 'rgb(var(--brand-highlight-rgb, 5 150 105))',
  'unassigned': '#9ca3af',
};

function PipelineChartsPanel({
  icpCompanies,
  onSelectRep,
  selectedRepName,
}: {
  icpCompanies: IcpCompany[];
  onSelectRep: (rep: RepChartEntry) => void;
  selectedRepName: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col h-full min-h-0">
      {/* Header bar — same light-gray toggle-header treatment as the
          Internal Relationships / Relationship Coverage panel, so this
          section's border lines up top-to-bottom with its row siblings. */}
      <div className="flex items-center px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider leading-tight">Prospects by Assigned Rep</p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col p-3 overflow-y-auto">
        <CompaniesByRepChart
          icpCompanies={icpCompanies}
          onSelectRep={onSelectRep}
          selectedRepName={selectedRepName}
        />
      </div>
    </div>
  );
}

// Same $125k / $1.2M abbreviation convention used for company value pills
// elsewhere (e.g. components/OutreachCompanyCard.tsx) — duplicated locally
// per this codebase's established precedent rather than a shared import.
function abbreviateDollar(value: number): string {
  if (value >= 1_000_000) return `$${(Math.floor(value / 100_000) / 10).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.floor(value / 1000)}k`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function companyValue(co: IcpCompany, avgCostPerUnit: number): number | null {
  if (co.wse == null || avgCostPerUnit <= 0) return null;
  return co.wse * avgCostPerUnit;
}

const REP_CHART_COLORS = ['#1B76BC', '#dc2626', '#059669', '#9333ea', '#ea580c', '#db2777', '#0891b2', '#ca8a04', '#4f46e5', '#6b7280'];

interface RepChartEntry {
  name: string;
  companies: IcpCompany[];
  count: number;
  color: string;
}

function computeRepData(icpCompanies: IcpCompany[]): RepChartEntry[] {
  const groups = new Map<string, IcpCompany[]>();
  for (const c of icpCompanies) {
    const rep = c.assigned_user_names?.[0] || 'Unassigned';
    if (!groups.has(rep)) groups.set(rep, []);
    groups.get(rep)!.push(c);
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, companies], i) => ({ name, companies, count: companies.length, color: REP_CHART_COLORS[i % REP_CHART_COLORS.length] }));
}

function CompaniesByRepChart({
  icpCompanies,
  onSelectRep,
  selectedRepName,
}: {
  icpCompanies: IcpCompany[];
  onSelectRep: (rep: RepChartEntry) => void;
  selectedRepName: string | null;
}) {
  const repData = useMemo(() => computeRepData(icpCompanies), [icpCompanies]);
  const avgCostPerUnit = useAvgCostPerUnit();
  const [valueMode, setValueMode] = useState<'%' | '$' | '#'>('%');
  // Seniority pills start hidden — the bars read more cleanly without them.
  const [showSeniority, setShowSeniority] = useState(false);

  const total = icpCompanies.length;

  const repValueNumber = (r: RepChartEntry): number => {
    if (valueMode === '#') return r.count;
    if (valueMode === '$') return r.companies.reduce((s, co) => s + (companyValue(co, avgCostPerUnit) ?? 0), 0);
    return total > 0 ? (r.count / total) * 100 : 0;
  };
  const repValueText = (r: RepChartEntry): string => {
    if (valueMode === '#') return `${r.count}`;
    if (valueMode === '$') return abbreviateDollar(repValueNumber(r));
    return `${Math.round(repValueNumber(r))}%`;
  };

  const sortedRepData = useMemo(
    () => [...repData].sort((a, b) => repValueNumber(b) - repValueNumber(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repData, valueMode, avgCostPerUnit, total]
  );
  const maxRepValue = Math.max(1, ...sortedRepData.map(r => repValueNumber(r)));

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Compact %/$/# toggle at every breakpoint. This panel is one column of
          five now, so the full "Percentage / Pipeline / Count" labels no longer
          fit — the layout matches what mobile already showed. */}
      <div className="flex-shrink-0">
        <ToggleGroup
          fullWidth
          options={[
            { key: '%', label: '%', activeColor: 'rgb(var(--brand-primary-rgb))' },
            { key: '$', label: '$', activeColor: 'rgb(var(--brand-primary-rgb))' },
            { key: '#', label: '#', activeColor: 'rgb(var(--brand-primary-rgb))' },
          ]}
          active={valueMode}
          onChange={key => setValueMode(key as '%' | '$' | '#')}
        />
      </div>
      <div className="flex-shrink-0 -mt-1">
        <button
          type="button"
          onClick={() => setShowSeniority(v => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-brand-secondary transition-colors"
        >
          {showSeniority ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
          {showSeniority ? 'Hide Seniority' : 'Show Seniority'}
        </button>
      </div>
      {total === 0 ? (
        <p className="text-xs text-gray-400">No ICP companies attending.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
          {sortedRepData.map(r => {
            const isDimmed = selectedRepName != null && selectedRepName !== r.name;
            const value = repValueNumber(r);
            const pct = Math.max(2, Math.round((value / maxRepValue) * 100));
            const valueText = repValueText(r);
            const showInside = pct >= 22;
            const seniorityCounts = new Map<string, number>();
            for (const co of r.companies) {
              for (const a of co.attendees) {
                const label = a.seniority || 'Other';
                seniorityCounts.set(label, (seniorityCounts.get(label) ?? 0) + 1);
              }
            }
            const seniorityEntries = Array.from(seniorityCounts.entries()).sort((a, b) => b[1] - a[1]);
            return (
              <div key={r.name} className="transition-all duration-150" style={{ filter: isDimmed ? 'grayscale(1)' : undefined, opacity: isDimmed ? 0.4 : 1 }}>
                <button
                  type="button"
                  onClick={() => onSelectRep(r)}
                  title={r.name}
                  className="w-full text-left group"
                >
                  {/* Rep name as an eyebrow above the bar, so the bar gets the
                      full column width rather than sharing it with a name
                      column that truncated at this width. */}
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 truncate mb-1">{r.name}</span>
                  <div className="h-6 relative">
                    <div
                      className="h-6 rounded-md flex items-center justify-end transition-all duration-300 ease-out group-hover:brightness-110"
                      style={{ width: `${pct}%`, backgroundColor: r.color, minWidth: 4 }}
                    >
                      {showInside && <span className="mr-1.5 text-[11px] font-semibold text-white whitespace-nowrap">{valueText}</span>}
                    </div>
                    {!showInside && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-600 whitespace-nowrap"
                        style={{ left: `calc(${pct}% + 6px)` }}
                      >
                        {valueText}
                      </span>
                    )}
                  </div>
                </button>
                {seniorityEntries.length > 0 && (
                  // Full-width so pills wrap several to a row. The old
                  // pl-[calc(7rem+0.5rem)] indent aligned them under the bar,
                  // but in a single-column panel it left too little room and
                  // forced one pill per row. Kept mounted and collapsed so the
                  // reveal animates rather than snapping in.
                  <div
                    className={`flex flex-wrap gap-1 overflow-hidden transition-all duration-200 ease-out ${
                      showSeniority ? 'mt-1 max-h-40 opacity-100' : 'mt-0 max-h-0 opacity-0'
                    }`}
                    aria-hidden={!showSeniority}
                  >
                    {seniorityEntries.map(([label, count]) => {
                      const color = SENIORITY_COLORS[label] ?? '#6b7280';
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => onSelectRep(r)}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border hover:brightness-95 transition-all duration-150 whitespace-nowrap"
                          style={{ color, borderColor: `${color}60`, backgroundColor: `${color}14` }}
                        >
                          {label} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SENIORITY_COLORS: Record<string, string> = {
  'C-Suite': '#7c3aed', 'VP/SVP': '#1B76BC', 'Director': '#059669', 'Manager': '#f59e0b', 'Other': '#6b7280',
};

function SeniorityPill({ seniority }: { seniority: string | null }) {
  if (!seniority) return null;
  const color = SENIORITY_COLORS[seniority] ?? '#6b7280';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color, borderColor: `${color}60`, backgroundColor: `${color}14` }}
    >
      {seniority}
    </span>
  );
}

function IcpCompanyCard({
  co,
  accentColor,
  dimmed,
  targetMap,
  onToggleTargetWithTier,
  tierKey,
  readOnly,
}: {
  co: IcpCompany;
  accentColor: string;
  dimmed?: boolean;
  targetMap: Map<number, TargetEntry>;
  onToggleTargetWithTier: (entry: Omit<TargetEntry, 'tier'>, tier: string) => Promise<void>;
  /** This company's target_priority_tier_key from the target recommendations
   * engine, if compiled yet — determines which kanban tier a newly-added
   * target lands in (falls back to Monitor when null/uncompiled). */
  tierKey: string | null;
  readOnly?: boolean;
}) {
  const openRecord = useRecordDrawer();
  const avgCostPerUnit = useAvgCostPerUnit();
  const [expanded, setExpanded] = useState(false);
  const value = companyValue(co, avgCostPerUnit);
  return (
    <div
      className="rounded-lg overflow-hidden bg-white transition-all duration-150"
      style={{
        border: `1px solid ${hexAlpha(accentColor, 0.3)}`,
        filter: dimmed ? 'grayscale(1)' : undefined,
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-left gap-2 transition-colors"
        style={{ backgroundColor: hexAlpha(accentColor, 0.07) }}
      >
        <span className="text-xs font-semibold text-gray-800 truncate flex-1 min-w-0">{co.name}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {value != null && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
              {abbreviateDollar(value)}
            </span>
          )}
          <span className="text-xs font-bold" style={{ color: accentColor }}>{co.attendees.length}</span>
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
          {co.attendees.map(a => {
            const isTarget = targetMap.has(a.id);
            return (
              <div key={a.id} className="px-3 py-1.5 bg-white flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); openRecord('attendee', a.id); }}
                    className="text-xs font-medium text-gray-800 hover:text-brand-secondary transition-colors block truncate text-left w-full"
                  >
                    {a.first_name} {a.last_name}
                  </button>
                  {a.title && <p className="text-xs text-gray-400 truncate">{a.title}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <TargetBtn
                    isTarget={isTarget}
                    disabled={readOnly}
                    onClick={e => {
                      e.stopPropagation();
                      void onToggleTargetWithTier({
                        attendeeId: a.id,
                        firstName: a.first_name,
                        lastName: a.last_name,
                        title: a.title,
                        seniority: a.seniority,
                        companyName: co.name,
                        companyId: co.id,
                        companyWse: co.wse,
                        assignedUserNames: co.assigned_user_names,
                      }, companyTierToConferenceTier(tierKey));
                    }}
                  />
                  {a.seniority && <SeniorityPill seniority={a.seniority} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeniorityDonut({
  entries,
  total,
  selected,
  onSelect,
}: {
  entries: [string, number][];
  total: number;
  selected: string | null;
  onSelect: (label: string | null) => void;
}) {
  const size = 120, stroke = 32, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let cumulative = 0;
  const toggle = (label: string) => onSelect(selected === label ? null : label);
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        {entries.map(([label, count]) => {
          const frac = total > 0 ? count / total : 0;
          const dash = frac * c;
          const offset = cumulative;
          cumulative += dash;
          const color = SENIORITY_COLORS[label] ?? '#6b7280';
          const isDimmed = selected != null && selected !== label;
          return (
            <circle
              key={label}
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              className="cursor-pointer transition-all duration-150"
              style={{ filter: isDimmed ? 'grayscale(1)' : undefined, opacity: isDimmed ? 0.35 : 1 }}
              onClick={() => toggle(label)}
            />
          );
        })}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {entries.map(([label, count]) => {
          const isDimmed = selected != null && selected !== label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(label)}
              className="flex items-center gap-1.5 text-xs transition-all duration-150"
              style={{ filter: isDimmed ? 'grayscale(1)' : undefined, opacity: isDimmed ? 0.4 : 1 }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SENIORITY_COLORS[label] ?? '#6b7280' }} />
              <span className={`text-gray-600 truncate ${selected === label ? 'font-semibold' : ''}`}>{label}</span>
              <span className="text-gray-400 flex-shrink-0">({count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RepDetailPanel({
  rep,
  totalIcp,
  onClose,
  conferenceId,
  conferenceName,
  conferenceStartDate,
  targetMap,
  onToggleTargetWithTier,
  readOnly,
}: {
  rep: RepChartEntry;
  totalIcp: number;
  onClose: () => void;
  conferenceId: number;
  conferenceName: string;
  conferenceStartDate: string | null;
  targetMap: Map<number, TargetEntry>;
  onToggleTargetWithTier: (entry: Omit<TargetEntry, 'tier'>, tier: string) => Promise<void>;
  readOnly?: boolean;
}) {
  // Matches the Conference Details page header's own name+year construction
  // (app/conferences/[id]/page.tsx) so this reads the same way everywhere.
  const conferenceLabel = `${conferenceName}${conferenceStartDate ? ` - ${new Date(conferenceStartDate).getUTCFullYear()}` : ''}`;
  const pct = totalIcp > 0 ? Math.round((rep.count / totalIcp) * 100) : 0;
  const avgCostPerUnit = useAvgCostPerUnit();
  const targetingCompilation = useTargetingCompilation(conferenceId);
  const companyTierMap = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const c of targetingCompilation.data?.companies ?? []) {
      map.set(c.company_id, c.target_priority_tier_key || c.target_priority_tier || null);
    }
    return map;
  }, [targetingCompilation.data]);
  const [selectedSeniority, setSelectedSeniority] = useState<string | null>(null);
  // Desktop-only visibility toggle — mobile always shows the donut regardless
  // of this (see the className on the wrapper below), since mobile's drawer
  // already defaults to showing it and has no equivalent space pressure.
  const [seniorityVisibleDesktop, setSeniorityVisibleDesktop] = useState(true);

  const seniorityBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const co of rep.companies) {
      for (const a of co.attendees) {
        const label = a.seniority || 'Other';
        counts.set(label, (counts.get(label) ?? 0) + 1);
        total++;
      }
    }
    return { total, entries: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]) as [string, number][] };
  }, [rep.companies]);

  const totalValue = useMemo(
    () => rep.companies.reduce((s, co) => s + (companyValue(co, avgCostPerUnit) ?? 0), 0),
    [rep.companies, avgCostPerUnit]
  );

  return (
    <div className="drawer-mobile-responsive fixed inset-x-0 bottom-0 top-[var(--pcr-header-h,0px)] rounded-t-2xl sm:inset-x-auto sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[480px] sm:rounded-tl-2xl sm:rounded-bl-2xl sm:rounded-tr-none z-[60] flex flex-col border border-gray-200 bg-white shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0"
            style={{ backgroundColor: hexAlpha(rep.color, 0.12), color: rep.color, border: `1px solid ${hexAlpha(rep.color, 0.3)}` }}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: rep.color }} />
            <span className="truncate">{rep.name}</span>
          </span>
          <span className="text-xs text-gray-500 truncate">Prospects Attending {conferenceLabel}</span>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2 p-3 flex-shrink-0">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-center">
          <p className="text-lg font-bold text-gray-800">{rep.count}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Companies</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-center">
          <p className="text-lg font-bold text-gray-800">{pct}%</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">of ICP Total</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-center">
          <p className="text-lg font-bold text-gray-800">{totalValue > 0 ? abbreviateDollar(totalValue) : '—'}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Company Value</p>
        </div>
      </div>

      {/* Seniority donut — always visible on mobile; hideable on desktop */}
      <div className="hidden sm:flex items-center justify-between px-3 pt-1 flex-shrink-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Seniority Breakdown</p>
        <button
          type="button"
          onClick={() => setSeniorityVisibleDesktop(v => !v)}
          className="text-[10px] font-semibold text-brand-secondary hover:text-brand-primary transition-colors"
        >
          {seniorityVisibleDesktop ? 'Hide' : 'Show'}
        </button>
      </div>
      <div className={`px-3 pb-3 flex justify-center flex-shrink-0 ${seniorityVisibleDesktop ? 'sm:flex' : 'sm:hidden'}`}>
        {seniorityBreakdown.total === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No attendees to show</p>
        ) : (
          <SeniorityDonut
            entries={seniorityBreakdown.entries}
            total={seniorityBreakdown.total}
            selected={selectedSeniority}
            onSelect={setSelectedSeniority}
          />
        )}
      </div>

      {/* Company cards — dimmed when they have no attendee at the selected seniority */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
        {rep.companies.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No companies assigned</p>
        ) : (
          rep.companies.map(co => {
            const dimmed = selectedSeniority != null && !co.attendees.some(a => (a.seniority || 'Other') === selectedSeniority);
            return (
              <IcpCompanyCard
                key={co.id}
                co={co}
                accentColor={rep.color}
                dimmed={dimmed}
                targetMap={targetMap}
                onToggleTargetWithTier={onToggleTargetWithTier}
                tierKey={companyTierMap.get(co.id) ?? null}
                readOnly={readOnly}
              />
            );
          })
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
  meetingAttendeeIds,
  conferenceId,
}: {
  byRep: ByRepEntry[];
  icpCompanies: IcpCompany[];
  targetMap: Map<number, TargetEntry>;
  relationships: RelationshipRow[];
  meetingAttendeeIds: Set<number>;
  conferenceId: number;
}) {
  const [view, setView] = useState<'internal' | 'coverage' | 'pipeline'>('internal');
  const [drillInternal, setDrillInternal] = useState<DrillInternalState | null>(null);
  const openRecord = useRecordDrawer();
  const [drillCoverage, setDrillCoverage] = useState<IcpCompany | null>(null);

  // ── Targeted Pipeline (moved here from the old Pipeline section of the
  // Prospects by Assigned Rep panel) ─────────────────────────────────────────
  const avgCostPerUnit = useAvgCostPerUnit();
  const [meetingsConvPct, setMeetingsConvPct] = useState(60);
  const [requiredPipeline, setRequiredPipeline] = useState<number | null>(null);
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
  const hasPipelineValues = avgCostPerUnit > 0 && companyBestTier.size > 0;
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

  const handleToggle = (next: 'internal' | 'coverage' | 'pipeline') => {
    setView(next);
    setDrillInternal(null);
    setDrillCoverage(null);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col h-full min-h-[420px]">
      {/* Toggle header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0 flex-wrap">
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
        <button
          onClick={() => handleToggle('pipeline')}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${view === 'pipeline' ? 'bg-brand-primary text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Targeted Pipeline
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

        {/* ── Targeted Pipeline view ── */}
        {view === 'pipeline' && (
          <div className="absolute inset-0 p-4 overflow-y-auto space-y-4">
            {/* Targeted Pipeline Value chart — same format as Conference Targets tab, minus the conversion input */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Targeted Pipeline Value</p>
              {requiredPipeline != null && (
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500 font-medium">Required Pipeline</span>
                    <span className="text-xs text-gray-400">${requiredPipeline.toLocaleString('en-US')}</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-3 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min((coverageRatio ?? 0) * 100, 100)}%`,
                        backgroundColor: (coverageRatio ?? 0) >= 1 ? '#059669' : (coverageRatio ?? 0) >= 0.6 ? '#f59e0b' : '#dc2626',
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs text-gray-400">
                      Projected at {conversionPct}%:{' '}
                      <span className="font-medium text-gray-600">${convertedValue.toLocaleString('en-US')}</span>
                    </span>
                    {coverageRatio != null && (
                      <span className={`text-xs font-medium ${(coverageRatio ?? 0) >= 1 ? 'text-emerald-600' : (coverageRatio ?? 0) >= 0.6 ? 'text-amber-600' : 'text-red-500'}`}>
                        ({Math.round((coverageRatio ?? 0) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              )}
              {hasPipelineValues ? (
                <div className="space-y-2">
                  {TIER_DATA.map(tier => {
                    const val = tierValueSum[tier.key] ?? 0;
                    return (
                      <div key={tier.key} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 w-28 flex-shrink-0 truncate">{tier.label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: val > 0 ? `${Math.round((val / maxTierValue) * 100)}%` : '0%',
                              backgroundColor: TARGETED_PIPELINE_BAR_COLORS[tier.key] ?? '#9ca3af',
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0">
                          {val > 0 ? '$' + val.toLocaleString('en-US') : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Set avg. cost per unit in Admin Settings to see values.</p>
              )}
            </div>

            {/* Targeted Pipeline Value of Scheduled Meetings chart */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Targeted Pipeline Value of Scheduled Meetings</p>
              {requiredPipeline != null && (
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500 font-medium">Required Pipeline</span>
                    <span className="text-xs text-gray-400">${requiredPipeline.toLocaleString('en-US')}</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-3 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min((meetingsCoverageRatio ?? 0) * 100, 100)}%`,
                        backgroundColor: (meetingsCoverageRatio ?? 0) >= 1 ? '#059669' : (meetingsCoverageRatio ?? 0) >= 0.6 ? '#f59e0b' : '#dc2626',
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs text-gray-400">
                      Projected at {meetingsConvPct}%:{' '}
                      <span className="font-medium text-gray-600">${convertedMeetingValue.toLocaleString('en-US')}</span>
                    </span>
                    {meetingsCoverageRatio != null && (
                      <span className={`text-xs font-medium ${(meetingsCoverageRatio ?? 0) >= 1 ? 'text-emerald-600' : (meetingsCoverageRatio ?? 0) >= 0.6 ? 'text-amber-600' : 'text-red-500'}`}>
                        ({Math.round((meetingsCoverageRatio ?? 0) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              )}
              {hasMeetingValues ? (
                <div className="space-y-2">
                  {TIER_DATA.map(tier => {
                    const val = meetingTierValueSum[tier.key] ?? 0;
                    return (
                      <div key={tier.key} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 w-28 flex-shrink-0 truncate">{tier.label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: val > 0 ? `${Math.round((val / maxMeetingTierValue) * 100)}%` : '0%',
                              backgroundColor: TARGETED_PIPELINE_BAR_COLORS[tier.key] ?? '#9ca3af',
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0">
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
                      : 'No target companies with scheduled meetings.'
                    : 'Set avg. cost per unit in Admin Settings to see values.'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function LandscapeTab({
  data,
  targetMap,
  onToggleTargetWithTier,
  strategyAssessment,
  meetingAttendeeIds,
  conferenceId,
  conferenceName,
  conferenceStartDate,
  byRep,
  icpCompanies,
  relationships,
  territoryScope,
  territoryIds,
  onStrategyUpdated,
  readOnly,
}: {
  data: LandscapeData;
  targetMap: Map<number, TargetEntry>;
  onToggleTargetWithTier: (entry: Omit<TargetEntry, 'tier'>, tier: string) => Promise<void>;
  strategyAssessment: StrategyAssessment | null;
  meetingAttendeeIds: Set<number>;
  conferenceId: number;
  conferenceName: string;
  conferenceStartDate: string | null;
  byRep: ByRepEntry[];
  icpCompanies: IcpCompany[];
  relationships: RelationshipRow[];
  territoryScope: 'national' | 'regional' | null;
  territoryIds: number[];
  onStrategyUpdated: () => void;
  readOnly?: boolean;
}) {
  const [selectedRep, setSelectedRep] = useState<RepChartEntry | null>(null);

  return (
    <div className="space-y-8">
      {/* Strategy Assessment (above existing charts) */}
      {strategyAssessment && (
        <StrategyAssessmentSection
          sa={strategyAssessment}
          conferenceId={conferenceId}
          conferenceName={conferenceName}
          onStrategyUpdated={onStrategyUpdated}
          icpCompanies={icpCompanies}
          territoryScope={territoryScope}
          territoryIds={territoryIds}
          onSelectRep={setSelectedRep}
          selectedRepName={selectedRep?.name ?? null}
        />
      )}

      {/* 5-column layout: client/competitors | pipeline charts | relationship heatmap */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-stretch">
        {/* Cols 1-2: Clients / Competitors / Open Opps (toggle) */}
        <div className="md:col-span-2 h-full">
          <ClientCompetitorPanel data={data} />
        </div>

        {/* Col 3: Prospects by Assigned Rep */}
        <div className="md:col-span-1 h-full">
          <PipelineChartsPanel
            icpCompanies={icpCompanies}
            onSelectRep={setSelectedRep}
            selectedRepName={selectedRep?.name ?? null}
          />
        </div>

        {/* Cols 4-5: Relationship Heatmap (Companies by Rep detail slides in on top) */}
        <div className="relative md:col-span-2 h-full">
          <RelationshipHeatmapPanel
            byRep={byRep}
            icpCompanies={icpCompanies}
            targetMap={targetMap}
            relationships={relationships}
            meetingAttendeeIds={meetingAttendeeIds}
            conferenceId={conferenceId}
          />
          {selectedRep && (
            <>
              {/* Backdrop — full drawer now slides in from the screen's right
                  edge on desktop too, so it gets a backdrop at every breakpoint. */}
              <div
                className="fixed inset-0 z-[55] bg-black/30"
                onClick={() => setSelectedRep(null)}
              />
              <RepDetailPanel
                rep={selectedRep}
                totalIcp={icpCompanies.length}
                onClose={() => setSelectedRep(null)}
                conferenceId={conferenceId}
                conferenceName={conferenceName}
                conferenceStartDate={conferenceStartDate}
                targetMap={targetMap}
                onToggleTargetWithTier={onToggleTargetWithTier}
                readOnly={readOnly}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
