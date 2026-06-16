'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CalendarNotesPanel } from './CalendarNotesPanel';
import { DecisionTag } from './DecisionTag';
import { type CalendarConferenceRow } from '@/lib/calendarIntelligenceStore';

type DecisionKey = 'confirmed' | 'attend_but_reduce' | 'watching' | 'passed' | 'pending_approval';

interface UserOpinion {
  userId: number;
  displayName: string;
  email: string;
  note: string | null;
  updatedAt: string;
}

interface BoardConference {
  conferenceId: number;
  name: string;
  year: number;
  attendeeCount: number;
  noteCount: number;
  opinionsByDecision: Record<DecisionKey, UserOpinion[]>;
}

interface Props {
  onOpenDrawer?: (conferenceId: number) => void;
  refreshKey?: number;
  scoredRows?: CalendarConferenceRow[];
  selectedConferenceId: number | null;
  onSelectedConferenceChange: (id: number | null) => void;
  onConferencesLoaded?: (list: Array<{ conferenceId: number; name: string; year: number }>) => void;
}

const COLUMNS: { id: DecisionKey; label: string; headerCls: string; borderCls: string }[] = [
  { id: 'confirmed',         label: 'Attend',              headerCls: 'text-emerald-700 bg-emerald-50',         borderCls: 'border-emerald-200' },
  { id: 'attend_but_reduce', label: 'Attend (Reduced)',    headerCls: 'text-brand-primary bg-brand-primary/10', borderCls: 'border-brand-primary' },
  { id: 'watching',          label: 'On the Fence',        headerCls: 'text-amber-700 bg-amber-50',             borderCls: 'border-amber-200' },
  { id: 'passed',            label: "Don't Attend",        headerCls: 'text-red-700 bg-red-50',                 borderCls: 'border-red-200' },
  { id: 'pending_approval',  label: 'Actively Evaluating', headerCls: 'text-blue-700 bg-blue-50',               borderCls: 'border-blue-200' },
];

const DECISION_PILL: Record<DecisionKey, string> = {
  confirmed:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  attend_but_reduce: 'bg-brand-primary/10 text-brand-primary border-brand-primary/30',
  watching:          'bg-amber-50 text-amber-700 border-amber-200',
  passed:            'bg-red-50 text-red-700 border-red-200',
  pending_approval:  'bg-blue-50 text-blue-700 border-blue-200',
};

const DECISION_SHORT: Record<DecisionKey, string> = {
  confirmed:         'Attend',
  attend_but_reduce: 'Reduced',
  watching:          'On Fence',
  passed:            'Pass',
  pending_approval:  'Eval.',
};

const TIER_INFO: Record<string, { label: string; cls: string }> = {
  attend_invest_more:         { label: 'Attend & Invest',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  attend_maintain:            { label: 'Attend & Maintain', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  attend_reconsider_format:   { label: 'Reconsider Format', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  evaluate_before_committing: { label: 'Evaluate First',    cls: 'bg-amber-50 text-amber-600 border-amber-100' },
  do_not_prioritize:          { label: 'Do Not Prioritize', cls: 'bg-red-50 text-red-600 border-red-100' },
  remove_from_calendar:       { label: 'Remove',            cls: 'bg-red-50 text-red-700 border-red-200' },
};

const TIER_LABELS: Record<string, string> = {
  attend_invest_more:         'Attend & Invest More',
  attend_maintain:            'Attend & Maintain',
  attend_reconsider_format:   'Reconsider Format',
  evaluate_before_committing: 'Evaluate First',
  do_not_prioritize:          'Do Not Prioritize',
  remove_from_calendar:       'Remove from Calendar',
};

const TIER_PILL: Record<string, string> = {
  attend_invest_more:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  attend_maintain:            'bg-emerald-50 text-emerald-600 border-emerald-100',
  attend_reconsider_format:   'bg-amber-50 text-amber-700 border-amber-200',
  evaluate_before_committing: 'bg-amber-50 text-amber-700 border-amber-200',
  remove_from_calendar:       'bg-red-50 text-red-700 border-red-200',
  do_not_prioritize:          'bg-red-50 text-red-600 border-red-100',
};

function tierInfo(tier: string) {
  return TIER_INFO[tier] ?? { label: tier.replace(/_/g, ' '), cls: 'bg-gray-50 text-gray-600 border-gray-200' };
}

function calScoreColor(score: number | null): string {
  if (score == null) return '#9ca3af';
  if (score >= 85) return '#059669';
  if (score >= 70) return '#0d9488';
  if (score >= 55) return '#d97706';
  if (score >= 40) return '#f97316';
  return '#dc2626';
}

function ScoreChip({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border bg-gray-50 text-gray-600 border-gray-100">
      <span className="text-gray-400">{label}</span>
      <span>{value != null ? Math.round(value) : '—'}</span>
    </span>
  );
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function buildComponentList(row: CalendarConferenceRow) {
  const cs = row.componentScores;
  const d = row.diagnostics ?? {};
  const te = d.targetingEngine;
  const cp = d.commercialPotential;
  const bud = d.budget;
  const W = { audienceFit: 30, targetOpportunity: 24, commercialPotential: 18, costJustification: 18, strategicValue: 10 };
  const projPipeline = Number(cp?.projected_pipeline ?? 0);
  const realPipeline = Number(cp?.realistic_pipeline ?? 0);
  const reqPipeline = Number(bud?.required_pipeline_amount ?? 0);
  const reqMultiple = Number(bud?.required_pipeline_multiple ?? 5);
  const teBench = te != null ? (te.isLargeConference ? { must: '15%', high: '30%', worth: '25%' } : { must: '10%', high: '20%', worth: '20%' }) : null;
  const teRate = te != null && te.totalScoredCompanies > 0 ? (te.actionableCount / te.totalScoredCompanies * 100).toFixed(0) + '%' : null;

  return [
    {
      key: 'Audience Fit', score: cs?.audienceFit ?? null, weight: W.audienceFit,
      bullets: [
        `${row.icpCompanies} ICP / ${row.totalCompanies} total (${row.icpDensityPct.toFixed(1)}% density)`,
        ...(te != null ? [`Avg buyer access: ${te.avgBuyerAccessScore.toFixed(0)}/100`] : []),
      ],
    },
    {
      key: 'Target Opportunity', score: cs?.targetOpportunity ?? null, weight: W.targetOpportunity,
      bullets: te != null ? [
        `${te.totalScoredCompanies} companies scored`,
        `Must Target: ${te.mustTargetCount} (bench ${teBench!.must})`,
        `High Priority: ${te.highPriorityCount} (bench ${teBench!.high})`,
        `Worth Engaging: ${te.worthEngagingCount} (bench ${teBench!.worth})`,
        `Actionable rate: ${teRate}`,
      ] : ['Target scoring not run.'],
    },
    {
      key: 'Commercial Potential', score: cs?.commercialPotential ?? null, weight: W.commercialPotential,
      bullets: cp != null ? [
        `Available pipeline: $${projPipeline.toLocaleString()}`,
        ...(realPipeline > 0 ? [`Realistic: $${realPipeline.toLocaleString()}`] : []),
        ...(reqPipeline > 0 ? [`Required: $${reqPipeline.toLocaleString()}`, `Coverage: ${((projPipeline / reqPipeline) * 100).toFixed(0)}%`] : ['No budget entered.']),
      ] : ['No pipeline data available.'],
    },
    {
      key: 'Cost Justification', score: cs?.costJustification ?? null, weight: W.costJustification,
      bullets: bud != null ? [
        `Required pipeline: $${reqPipeline.toLocaleString()}`,
        `Required ROI: ${reqMultiple}x`,
        ...(cp != null && reqPipeline > 0 ? [`Attainable: $${(realPipeline > 0 ? realPipeline : projPipeline).toLocaleString()} (${(((realPipeline > 0 ? realPipeline : projPipeline) / reqPipeline) * 100).toFixed(0)}%)`] : []),
      ] : ['Budget not entered.'],
    },
    {
      key: 'Strategic Value', score: cs?.strategicValue ?? null, weight: W.strategicValue,
      bullets: (() => {
        const sv = d.strategicValue;
        if (!sv) return ['Prospect company type not configured.'];
        return [
          `Avg relationship leverage: ${sv.base_score}/100 (${sv.total_scored} companies)`,
          `Internal relationships: ${sv.internal_rel_count}`,
          `Prior engagement: ${sv.prior_engagement_count}`,
          `Known prospects: ${sv.known_prospect_count}`,
          sv.has_competitor ? `Competitor presence: Yes (+${sv.competitor_bonus} pts)` : 'Competitor presence: No',
        ];
      })(),
    },
  ];
}

export function DecisionsBoard({
  onOpenDrawer,
  refreshKey,
  scoredRows,
  selectedConferenceId,
  onSelectedConferenceChange,
  onConferencesLoaded,
}: Props) {
  const [allConferences, setAllConferences] = useState<BoardConference[]>([]);
  const [filteredConference, setFilteredConference] = useState<BoardConference | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());
  const [showComponents, setShowComponents] = useState(true);
  const [componentsExiting, setComponentsExiting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const scoreMap = useMemo(() => {
    const map = new Map<number, CalendarConferenceRow>();
    for (const r of scoredRows ?? []) map.set(r.conferenceId, r);
    return map;
  }, [scoredRows]);

  const loadAll = useCallback(() => {
    setLoading(true);
    fetch('/api/calendar-intelligence/decisions/board')
      .then(r => r.ok ? r.json() : { conferences: [] })
      .then((data: { conferences: BoardConference[] }) => {
        const confs = data.conferences ?? [];
        setAllConferences(confs);
        onConferencesLoaded?.(confs.map(c => ({ conferenceId: c.conferenceId, name: c.name, year: c.year })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [onConferencesLoaded]);

  useEffect(() => { loadAll(); }, [loadAll, refreshKey]);

  useEffect(() => {
    if (selectedConferenceId == null) {
      setFilteredConference(null);
      setNotesDrawerOpen(false);
      setShowComponents(true);
      setComponentsExiting(false);
      setExpandedComponents(new Set());
      return;
    }
    setFilteredConference(null);
    setExpandedComponents(new Set());
    setShowComponents(true);
    setComponentsExiting(false);
    fetch(`/api/calendar-intelligence/decisions/board?conferenceId=${selectedConferenceId}`)
      .then(r => r.ok ? r.json() : { conferences: [] })
      .then((data: { conferences: BoardConference[] }) => setFilteredConference(data.conferences[0] ?? null))
      .catch(() => {});
  }, [selectedConferenceId]);

  function toggleCard(key: string) {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleComponent(key: string) {
    setExpandedComponents(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const COMPONENT_COUNT = 5;
  const ENTER_DURATION = 200;
  const ENTER_STAGGER = 60;
  const EXIT_DURATION = 150;
  const EXIT_STAGGER = 40;

  function toggleComponents() {
    if (showComponents) {
      setComponentsExiting(true);
      const totalMs = EXIT_DURATION + (COMPONENT_COUNT - 1) * EXIT_STAGGER + 50;
      setTimeout(() => {
        setShowComponents(false);
        setComponentsExiting(false);
      }, totalMs);
    } else {
      setShowComponents(true);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin" />
      </div>
    );
  }

  // ── Conference card (default view) ──────────────────────────────────────────
  function ConferenceCard({ conf, colId }: { conf: BoardConference; colId: DecisionKey }) {
    const sd = scoreMap.get(conf.conferenceId);
    const ti = sd ? tierInfo(sd.recommendationTier) : null;
    const colOpinions = conf.opinionsByDecision[colId];
    const cardKey = `${conf.conferenceId}-${colId}`;
    const isExpanded = expandedCards.has(cardKey);
    const hasComponentScores = sd?.componentScores != null;

    return (
      <div className="rounded-lg border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="p-3 space-y-2">
          {/* Top row: name (left) + rep opinions (right) */}
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p
                className={`font-semibold text-sm text-gray-900 leading-tight ${onOpenDrawer ? 'cursor-pointer hover:underline' : ''}`}
                onClick={() => onOpenDrawer?.(conf.conferenceId)}
              >{conf.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{conf.year} · {conf.attendeeCount} attendees</p>
            </div>
            {colOpinions.length > 0 && (
              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                {colOpinions.map(op => (
                  <div key={op.userId} className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500 flex-shrink-0">
                      {op.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[10px] text-gray-600 max-w-[64px] truncate">{op.displayName}</span>
                    <span className={`flex-shrink-0 px-1 py-px rounded text-[8px] font-semibold border ${DECISION_PILL[colId]}`}>
                      {DECISION_SHORT[colId]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Score + tier */}
          {sd && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl font-bold text-gray-900">
                {sd.calendarRecommendationScore != null ? Math.round(sd.calendarRecommendationScore) : '—'}
              </span>
              {ti && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${ti.cls} ${onOpenDrawer ? 'cursor-pointer' : ''}`}
                  onClick={() => onOpenDrawer?.(conf.conferenceId)}
                >
                  {ti.label}
                </span>
              )}
            </div>
          )}

          {/* Expand toggle + component chips */}
          {hasComponentScores && (
            <>
              <button
                onClick={() => toggleCard(cardKey)}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {isExpanded ? 'Hide scores' : 'Component scores'}
              </button>
              {isExpanded && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <ScoreChip label="Aud. Fit"   value={sd!.componentScores!.audienceFit} />
                  <ScoreChip label="Target Opp" value={sd!.componentScores!.targetOpportunity} />
                  <ScoreChip label="Cost Just."  value={sd!.componentScores!.costJustification} />
                  <ScoreChip label="Commercial"  value={sd!.componentScores!.commercialPotential} />
                  {sd!.componentScores!.strategicValue != null && (
                    <ScoreChip label="Strategic"  value={sd!.componentScores!.strategicValue} />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-3 py-2 border-t border-gray-50 flex justify-end">
          <button
            onClick={() => onSelectedConferenceChange(conf.conferenceId)}
            className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
          >
            View details →
          </button>
        </div>
      </div>
    );
  }

  // ── Stakeholder card (filtered view) ────────────────────────────────────────
  function StakeholderCard({ opinion, colId }: { opinion: UserOpinion; colId: DecisionKey }) {
    return (
      <div className="rounded-lg border border-gray-100 bg-white shadow-sm p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-500 flex-shrink-0">
            {opinion.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{opinion.displayName}</p>
            <p className="text-[10px] text-gray-400 truncate">{opinion.email}</p>
          </div>
          <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${DECISION_PILL[colId]}`}>
            {DECISION_SHORT[colId]}
          </span>
        </div>
        {opinion.note && (
          <p className="text-xs text-gray-600 italic pl-9">&ldquo;{opinion.note}&rdquo;</p>
        )}
        <p className="text-[10px] text-gray-400 pl-9">{timeAgo(opinion.updatedAt)}</p>
      </div>
    );
  }

  const selectedRow = selectedConferenceId != null ? scoreMap.get(selectedConferenceId) : null;
  const components = selectedRow ? buildComponentList(selectedRow) : [];
  const scoreColor = calScoreColor(selectedRow?.calendarRecommendationScore ?? null);
  const activeConference = selectedConferenceId != null ? filteredConference : null;

  return (
    <>
      <style>{`
        @keyframes slideInFromLeft  { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideOutToLeft   { from { opacity: 1; transform: translateX(0); }    to { opacity: 0; transform: translateX(-16px); } }
        @keyframes slideInFromRight { from { transform: translateX(100%); }              to { transform: translateX(0); } }
      `}</style>

      <div className="flex flex-col gap-4 relative">
        {/* ── Desktop: unified grid layout — score card and kanban share the same column widths ── */}
        <div className="hidden md:flex flex-col gap-3 h-[calc(100vh-320px)]">
          {/* Top row: score card (col-span-3) + My Decision (col-span-2) */}
          {selectedConferenceId != null && selectedRow && (() => {
            const score = selectedRow.calendarRecommendationScore;
            const color = scoreColor;
            const tierLabel = TIER_LABELS[selectedRow.recommendationTier] ?? selectedRow.recommendationTier;
            const tierCls = TIER_PILL[selectedRow.recommendationTier] ?? 'bg-gray-50 text-gray-600 border-gray-200';
            const noteCount = activeConference?.noteCount ?? 0;
            return (
              <>
                <div
                  className="flex-shrink-0 grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
                >
                  {/* Score card — spans 3 of 5 columns */}
                  <div
                    className="col-span-3 rounded-xl p-4"
                    style={{ backgroundColor: color + '15', borderLeft: `4px solid ${color}` }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">Calendar Score</p>
                        <div className="flex items-end gap-1.5">
                          <span className="text-4xl font-bold leading-tight" style={{ color }}>
                            {score != null ? Math.round(score) : '—'}
                          </span>
                          <span className="text-sm text-gray-400 mb-0.5">/100</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <button
                          onClick={() => setNotesDrawerOpen(true)}
                          className="text-xs font-semibold transition-colors hover:opacity-75"
                          style={{ color }}
                        >
                          {noteCount > 0 ? `Comments (${noteCount})` : 'Comments'}
                        </button>
                        <button
                          onClick={toggleComponents}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
                        >
                          {showComponents ? 'Hide Components' : 'Show Components'}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tierCls}`}>
                        {tierLabel}
                      </span>
                      <span className="text-[11px] text-gray-400">Confidence: {selectedRow.confidenceLevel}</span>
                      {selectedRow.availableComponentCount != null && (
                        <span className="text-[11px] text-gray-400">{selectedRow.availableComponentCount} of 5 · max {selectedRow.maxPossibleScore ?? '—'}/100</span>
                      )}
                    </div>
                  </div>

                  {/* My Decision — spans remaining 2 columns */}
                  <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-4 overflow-y-auto">
                    <DecisionTag
                      conferenceId={selectedConferenceId}
                      syncKey={activeConference?.conferenceId}
                      onDecisionChanged={() => {
                        fetch(`/api/calendar-intelligence/decisions/board?conferenceId=${selectedConferenceId}`)
                          .then(r => r.ok ? r.json() : { conferences: [] })
                          .then((data: { conferences: typeof filteredConference[] }) => setFilteredConference((data.conferences[0] as typeof filteredConference) ?? null))
                          .catch(() => {});
                      }}
                    />
                  </div>
                </div>

                {/* Component cards row — own 5-column grid, aligns exactly with kanban columns */}
                {showComponents && (
                  <div
                    className="flex-shrink-0 grid gap-3"
                    style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
                  >
                    {components.map((comp, i) => {
                      const enterDelay = `${i * ENTER_STAGGER}ms`;
                      const exitDelay = `${(COMPONENT_COUNT - 1 - i) * EXIT_STAGGER}ms`;
                      const anim = componentsExiting
                        ? `slideOutToLeft ${EXIT_DURATION}ms ease-in ${exitDelay} both`
                        : `slideInFromLeft ${ENTER_DURATION}ms ease-out ${enterDelay} both`;
                      const expanded = expandedComponents.has(comp.key);
                      const compColor = calScoreColor(comp.score);
                      return (
                        <div
                          key={comp.key}
                          className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                          style={{ animation: anim }}
                        >
                          <button className="w-full px-3 py-2.5 text-left" onClick={() => toggleComponent(comp.key)}>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <p className="text-[11px] font-semibold text-gray-800 leading-tight">{comp.key}</p>
                              <svg
                                className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                            <div className="flex items-end gap-1 mb-1.5">
                              <span className="text-xl font-bold" style={{ color: compColor }}>
                                {comp.score != null ? Math.round(comp.score) : '—'}
                              </span>
                              <span className="text-[10px] text-gray-400 mb-0.5">/100 · {comp.weight}%</span>
                            </div>
                            <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${comp.score ?? 0}%`, backgroundColor: compColor }} />
                            </div>
                          </button>
                          {expanded && (
                            <div className="px-3 pb-3 border-t border-gray-100 pt-2">
                              <ul className="space-y-1">
                                {comp.bullets.map((b, bi) => (
                                  <li key={bi} className="flex gap-1.5 text-[11px] text-gray-500 leading-snug">
                                    <span className="flex-shrink-0 w-1 h-1 rounded-full bg-gray-300 mt-1.5" />
                                    <span>{b}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* Kanban — same 5-column grid, flex-1 to fill remaining height */}
          <div
            className="flex-1 min-h-0 grid gap-3"
            style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
          >
            {COLUMNS.map(col => {
              const colCount = selectedConferenceId != null
                ? (filteredConference?.opinionsByDecision[col.id].length ?? 0)
                : allConferences.filter(c => c.opinionsByDecision[col.id].length > 0).length;

              return (
                <div
                  key={col.id}
                  className={`flex flex-col rounded-xl border ${col.borderCls} bg-white overflow-hidden`}
                >
                  <div className={`px-3 py-2.5 flex items-center justify-between border-b ${col.borderCls} ${col.headerCls}`}>
                    <span className="font-semibold text-xs">{col.label}</span>
                    <span className="text-xs font-bold opacity-60">{colCount}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {selectedConferenceId != null ? (
                      filteredConference == null ? (
                        <p className="text-xs text-gray-300 text-center py-6">Loading…</p>
                      ) : filteredConference.opinionsByDecision[col.id].length === 0 ? (
                        <p className="text-xs text-gray-300 text-center py-6">No opinions</p>
                      ) : (
                        filteredConference.opinionsByDecision[col.id].map(op => (
                          <StakeholderCard key={op.userId} opinion={op} colId={col.id} />
                        ))
                      )
                    ) : (
                      (() => {
                        const colConfs = allConferences.filter(c => c.opinionsByDecision[col.id].length > 0);
                        return colConfs.length === 0
                          ? <p className="text-xs text-gray-300 text-center py-6">No conferences</p>
                          : colConfs.map(conf => <ConferenceCard key={conf.conferenceId} conf={conf} colId={col.id} />);
                      })()
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile grouped list */}
        <div className="md:hidden space-y-4">
          {COLUMNS.map(col => {
            if (selectedConferenceId != null) {
              const opinions = filteredConference?.opinionsByDecision[col.id] ?? [];
              if (opinions.length === 0) return null;
              return (
                <div key={col.id}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-semibold ${col.headerCls}`}>{col.label}</span>
                    <span className="text-xs font-bold text-gray-400">{opinions.length}</span>
                  </div>
                  <div className="space-y-2">
                    {opinions.map(op => <StakeholderCard key={op.userId} opinion={op} colId={col.id} />)}
                  </div>
                </div>
              );
            }
            const colConfs = allConferences.filter(c => c.opinionsByDecision[col.id].length > 0);
            if (colConfs.length === 0) return null;
            return (
              <div key={col.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-semibold ${col.headerCls}`}>{col.label}</span>
                  <span className="text-xs font-bold text-gray-400">{colConfs.length}</span>
                </div>
                <div className="space-y-2">
                  {colConfs.map(conf => <ConferenceCard key={conf.conferenceId} conf={conf} colId={col.id} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notes drawer — portal, slides in from right */}
      {mounted && notesDrawerOpen && selectedConferenceId != null && createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setNotesDrawerOpen(false)} />
          <div
            className="relative flex flex-col h-full w-[360px] bg-white rounded-tl-xl shadow-xl overflow-hidden"
            style={{ animation: 'slideInFromRight 200ms ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            <CalendarNotesPanel
              conferenceId={selectedConferenceId}
              onClose={() => setNotesDrawerOpen(false)}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
