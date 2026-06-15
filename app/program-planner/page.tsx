'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ProgramPlannerCostMatrix } from '@/components/ProgramPlannerCostMatrix';
import { ProgramPlannerAnalyticsPanel } from '@/components/ProgramPlannerAnalyticsPanel';
import { EffectivenessDrawer } from '@/components/EffectivenessDrawer';
import { ClosedWonDrawer } from '@/components/ClosedWonDrawer';
import { LineItemCostDrawer } from '@/components/LineItemCostDrawer';
import { ConferenceBudgetDrawer } from '@/components/ConferenceBudgetDrawer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BudgetLineItem {
  label: string;
  budgeted: number | null;
  actual: number | null;
}

interface ConferenceRow {
  conferenceId: number;
  name: string;
  startDate: string;
  endDate: string;
  seriesId: string | null;
  seriesName: string | null;
  ces: number | null;
  actualSpend: number | null;
  budgetTotal: number | null;
  pipelineInfluenced: number | null;
  budgetLineItems: BudgetLineItem[] | null;
  closedWon: number | null;
  headcount: number | null;
  decision: string | null;
  plannedBudget: number | null;
  stageOverride: string | null;
}

interface SeriesGroup {
  seriesId: string;
  seriesName: string;
  conferenceCount: number;
  totalActualSpend: number;
  totalPipeline: number;
  totalClosedWon: number;
  avgCES: number | null;
  conferences: ConferenceRow[];
}

interface SummaryData {
  year: number;
  conferencesAttended: number;
  totalActualSpend: number;
  totalBudget: number;
  budgetUtilizationPercent: number;
  avgCostPerConference: number;
  totalClosedWon: number;
  avgClosedWonPerConference: number;
  avgCES: number | null;
  conferencesScored: number;
}

interface ConferencesData {
  conferences: ConferenceRow[];
  series: SeriesGroup[];
  standalone: ConferenceRow[];
}

type GroupMode = 'series' | 'date' | 'ces';
type RankMetric = 'ces' | 'pipeline' | 'closedwon' | 'spend' | 'icp';
type DecisionValue = 'attend' | 'reduce' | 'cut' | 'evaluating' | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function fmtDate(dateStr: string): string {
  // "Mar 25" format from "2025-03-15"
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  } catch { return dateStr; }
}

function cesColor(score: number | null): string {
  if (score == null) return 'text-gray-400';
  if (score >= 75) return 'text-blue-600 font-semibold';
  if (score >= 60) return 'text-amber-600 font-semibold';
  return 'text-red-600 font-semibold';
}

function cesPillStyle(score: number | null): { bg: string; color: string; border: string } {
  if (score == null) return { bg: '#F3F4F6', color: '#9CA3AF', border: '#D1D5DB' };
  if (score >= 70) return { bg: '#DCFCE7', color: '#059669', border: '#6EE7B7' };
  if (score >= 50) return { bg: '#DBEAFE', color: '#1B76BC', border: '#93C5FD' };
  if (score >= 40) return { bg: '#FEF3C7', color: '#d97706', border: '#FCD34D' };
  if (score >= 25) return { bg: '#FFEDD5', color: '#f97316', border: '#FDBA74' };
  return { bg: '#FEE2E2', color: '#dc2626', border: '#FCA5A5' };
}

function actualCostPillStyle(actual: number | null, budget: number | null): { bg: string; color: string; border: string } {
  if (actual == null) return { bg: 'transparent', color: '#6B7280', border: 'transparent' };
  if (budget == null || budget === 0) return { bg: '#EFF6FF', color: '#1B76BC', border: '#BFDBFE' };
  const ratio = actual / budget;
  if (ratio <= 0.95) return { bg: '#DCFCE7', color: '#059669', border: '#6EE7B7' };
  if (ratio >= 1.05) return { bg: '#FEE2E2', color: '#dc2626', border: '#FCA5A5' };
  return { bg: '#EFF6FF', color: '#1B76BC', border: '#BFDBFE' };
}

const TIER_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: string }> = {
  attend_invest_more:       { label: 'Invest more',       bg: '#EAF3DE', text: '#27500A', border: '#C0DD97', icon: 'ti-trending-up' },
  attend_maintain:          { label: 'Maintain',           bg: '#E6F1FB', text: '#0C447C', border: '#B5D4F4', icon: 'ti-minus' },
  attend_reconsider_format: { label: 'Reconsider',         bg: '#FAEEDA', text: '#633806', border: '#FAC775', icon: 'ti-refresh' },
  evaluate_before_committing: { label: 'Evaluate first',  bg: '#FAEEDA', text: '#633806', border: '#FAC775', icon: 'ti-help' },
  do_not_prioritize:        { label: 'Do not prioritize', bg: '#FCEBEB', text: '#791F1F', border: '#F7C1C1', icon: 'ti-ban' },
  remove_from_calendar:     { label: 'Remove',            bg: '#FCEBEB', text: '#791F1F', border: '#F7C1C1', icon: 'ti-trash' },
};

// ── Animated sliding toggle ───────────────────────────────────────────────────

function AnimatedToggle({
  options, value, onChange, activeBg, className = '',
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  activeBg: string | ((id: string) => string);
  className?: string;
}) {
  const n = options.length;
  const activeIdx = Math.max(0, options.findIndex(o => o.id === value));
  const pillBg = typeof activeBg === 'function' ? activeBg(value) : activeBg;
  return (
    <div className={`relative flex bg-white rounded-xl border border-gray-200 p-1 ${className}`}>
      <div
        className={`absolute top-1 bottom-1 rounded-lg pointer-events-none ${pillBg}`}
        style={{
          width: `calc((100% - 8px) / ${n})`,
          left: `calc(4px + ${activeIdx} * (100% - 8px) / ${n})`,
          transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1), background-color 0.2s ease',
        }}
      />
      {options.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`relative z-10 flex-1 text-center px-3 py-1.5 text-xs font-medium transition-colors duration-150 whitespace-nowrap ${
            opt.id === value ? 'text-white' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Tooltip pill ──────────────────────────────────────────────────────────────

function TooltipPill({ label, tooltip, className }: { label: string; tooltip: string; className: string }) {
  return (
    <span className={`relative group cursor-default inline-block ${className}`}>
      {label}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100]">
        {tooltip}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-800" />
      </span>
    </span>
  );
}

const DECISION_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  attend:     { label: 'Attend',     bg: 'bg-green-100',  text: 'text-green-700' },
  reduce:     { label: 'Reduce',     bg: 'bg-amber-100',  text: 'text-amber-700' },
  cut:        { label: 'Cut',        bg: 'bg-red-100',    text: 'text-red-700' },
  evaluating: { label: 'Evaluating', bg: 'bg-gray-100',   text: 'text-gray-600' },
  new:        { label: 'New',        bg: 'bg-purple-100', text: 'text-purple-700' },
};

// ── Decision Dropdown ─────────────────────────────────────────────────────────

function DecisionPill({
  confId, value, year, onUpdated,
}: { confId: number; value: string | null; year: number; onUpdated: (confId: number, decision: DecisionValue) => void }) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const openDropdown = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [open]);

  const select = async (decision: DecisionValue) => {
    setOpen(false);
    onUpdated(confId, decision);
    await fetch(`/api/program-planner/conferences/${confId}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, decision }),
    });
  };

  const cfg = value ? DECISION_CONFIG[value] : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={openDropdown}
        className={`px-2 py-0.5 rounded text-[12px] font-medium cursor-pointer ${
          cfg
            ? `${cfg.bg} ${cfg.text}`
            : 'bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500'
        }`}
      >
        {cfg ? cfg.label : '—'}
      </button>
      {open && dropdownPos && (
        <div
          ref={dropdownRef}
          className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[110px]"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
        >
          {(['attend', 'reduce', 'cut', 'evaluating'] as const).map(d => (
            <button
              key={d}
              onClick={() => select(d)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${DECISION_CONFIG[d].text}`}
            >
              {DECISION_CONFIG[d].label}
            </button>
          ))}
          <button
            onClick={() => select(null)}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex gap-4">
        {[0,1,2,3,4,5].map(i => <div key={i} className="flex-1 h-24 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-8 bg-gray-100 rounded w-1/3" />
      <div className="h-96 bg-gray-100 rounded-xl" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProgramPlannerPage() {
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  const [selectedYear, setSelectedYear] = useState(currentYear - 1);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [confsData, setConfsData] = useState<ConferencesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'program' | 'cost'>('program');
  const [groupMode, setGroupMode] = useState<GroupMode>('series');
  const [rankMetric, setRankMetric] = useState<RankMetric>('ces');
  const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(new Set());
  const [effectivenessDrawer, setEffectivenessDrawer] = useState<{ conferenceId: number; conferenceName: string } | null>(null);
  type CWTarget = { type: 'conference'; conferenceId: number; conferenceName: string } | { type: 'series'; seriesId: string; seriesName: string };
  const [closedWonDrawer, setClosedWonDrawer] = useState<CWTarget | null>(null);
  const [budgetDrawer, setBudgetDrawer] = useState<ConferenceRow | null>(null);

  // Calendar Intelligence scoring state
  const [calIntelScores, setCalIntelScores] = useState<Map<number, { score: number; tier: string; confidence: string }>>(new Map());
  const [calIntelProgress, setCalIntelProgress] = useState<{ completed: number; total: number } | null>(null);
  const [calIntelLoading, setCalIntelLoading] = useState(false);

  const fetchData = useCallback(async (year: number) => {
    setLoading(true);
    try {
      const [sumRes, confRes] = await Promise.all([
        fetch(`/api/program-planner/summary?year=${year}`, { cache: 'no-store' }),
        fetch(`/api/program-planner/conferences?year=${year}`, { cache: 'no-store' }),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (confRes.ok) setConfsData(await confRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(selectedYear); }, [selectedYear, fetchData]);

  useEffect(() => {
    if (!confsData || allConfs.length === 0 || calIntelLoading) return;
    setCalIntelLoading(true);
    setCalIntelProgress({ completed: 0, total: allConfs.length });
    setCalIntelScores(new Map());
    (async () => {
      try {
        const res = await fetch('/api/program-intelligence/calendar-intelligence', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json() as { conferences: Array<{ conferenceId: number; calendarRecommendationScore: number | null; recommendationTier: string; confidenceLevel: string }> };
          const scores = new Map<number, { score: number; tier: string; confidence: string }>();
          for (const conf of data.conferences ?? []) {
            scores.set(conf.conferenceId, {
              score: conf.calendarRecommendationScore ?? 0,
              tier: conf.recommendationTier ?? '',
              confidence: conf.confidenceLevel ?? '',
            });
          }
          setCalIntelScores(scores);
          setCalIntelProgress({ completed: allConfs.length, total: allConfs.length });
        }
      } catch { /* silently skip */ }
      setCalIntelLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confsData]);

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    setCollapsedSeries(new Set());
  };

  const handleDecisionUpdated = useCallback((confId: number, decision: DecisionValue) => {
    setConfsData(prev => {
      if (!prev) return prev;
      const updateConf = (c: ConferenceRow) => c.conferenceId === confId ? { ...c, decision } : c;
      return {
        conferences: prev.conferences.map(updateConf),
        series: prev.series.map(s => ({ ...s, conferences: s.conferences.map(updateConf) })),
        standalone: prev.standalone.map(updateConf),
      };
    });
  }, []);

  const toggleSeries = (seriesId: string) => {
    setCollapsedSeries(prev => {
      const next = new Set(prev);
      if (next.has(seriesId)) next.delete(seriesId); else next.add(seriesId);
      return next;
    });
  };

  const [activeConferenceIds, setActiveConferenceIds] = useState<number[]>([]);
  const [activeLineItems, setActiveLineItems] = useState<string[]>([]);
  const [selectedLineItem, setSelectedLineItem] = useState<string | null>(null);

  // All conferences flat for rankings and cost matrix
  const allConfs = confsData?.conferences ?? [];

  const flattenedConferences = useMemo(() => [
    ...(confsData?.series.flatMap(s => s.conferences) ?? []),
    ...(confsData?.standalone ?? []),
  ], [confsData]);

  // Rankings
  const ranked = [...allConfs].sort((a, b) => {
    if (rankMetric === 'ces') return (b.ces ?? -1) - (a.ces ?? -1);
    if (rankMetric === 'pipeline') return (b.pipelineInfluenced ?? 0) - (a.pipelineInfluenced ?? 0);
    if (rankMetric === 'closedwon') return (b.closedWon ?? 0) - (a.closedWon ?? 0);
    if (rankMetric === 'spend') return (b.actualSpend ?? 0) - (a.actualSpend ?? 0);
    return 0;
  });

  // Decision summary counts
  const decisionCounts = {
    attend: 0, reduce: 0, cut: 0, undecided: 0,
  };
  for (const c of allConfs) {
    if (c.decision === 'attend') decisionCounts.attend++;
    else if (c.decision === 'reduce') decisionCounts.reduce++;
    else if (c.decision === 'cut') decisionCounts.cut++;
    else decisionCounts.undecided++;
  }

  // Build rows for table based on groupMode
  type TableRow =
    | { type: 'series'; group: SeriesGroup; key: string }
    | { type: 'conference'; conf: ConferenceRow; rowIndex: number; key: string }
    | { type: 'standalone_header'; key: string };

  const buildRows = (): TableRow[] => {
    if (!confsData) return [];
    const rows: TableRow[] = [];

    if (groupMode === 'series') {
      for (const s of confsData.series) {
        rows.push({ type: 'series', group: s, key: `series-${s.seriesId}` });
        if (!collapsedSeries.has(s.seriesId)) {
          let rowIndex = 0;
          for (const c of s.conferences) {
            rows.push({ type: 'conference', conf: c, rowIndex: rowIndex++, key: `conf-${c.conferenceId}` });
          }
        }
      }
      if (confsData.standalone.length > 0) {
        rows.push({ type: 'standalone_header', key: 'standalone' });
        if (!collapsedSeries.has('__standalone__')) {
          let rowIndex = 0;
          for (const c of confsData.standalone) {
            rows.push({ type: 'conference', conf: c, rowIndex: rowIndex++, key: `conf-${c.conferenceId}` });
          }
        }
      }
    } else if (groupMode === 'date') {
      const sorted = [...allConfs].sort((a, b) => a.startDate.localeCompare(b.startDate));
      for (let i = 0; i < sorted.length; i++) {
        rows.push({ type: 'conference', conf: sorted[i], rowIndex: i, key: `conf-${sorted[i].conferenceId}` });
      }
    } else {
      // CES sort
      const sorted = [...allConfs].sort((a, b) => (b.ces ?? -1) - (a.ces ?? -1));
      for (let i = 0; i < sorted.length; i++) {
        rows.push({ type: 'conference', conf: sorted[i], rowIndex: i, key: `conf-${sorted[i].conferenceId}` });
      }
    }

    return rows;
  };

  const tableRows = buildRows();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-screen-2xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">Program planner</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review last year&apos;s program and plan next year&apos;s budget</p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">

        {/* Year selector */}
        <div className="flex items-center gap-2">
          {yearOptions.map(y => (
            <button
              key={y}
              onClick={() => handleYearChange(y)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                y === selectedYear
                  ? 'bg-brand-primary text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:border-brand-secondary hover:text-brand-primary'
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {loading ? <Skeleton /> : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Conferences attended */}
              <div className="card text-center">
                <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Conferences attended</p>
                <p className="text-3xl font-bold text-brand-primary">{summary?.conferencesAttended ?? 0}</p>
              </div>

              {/* Total actual spend */}
              <div className="card text-center">
                <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Total actual spend</p>
                <p className="text-2xl font-bold text-brand-primary">{fmtCurrency(summary?.totalActualSpend)}</p>
                {summary && summary.totalBudget > 0 && (
                  <>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-secondary rounded-full"
                        style={{ width: `${Math.min(summary.budgetUtilizationPercent, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{summary.budgetUtilizationPercent}% of {fmtCurrency(summary.totalBudget)} budget</p>
                  </>
                )}
              </div>

              {/* Avg cost */}
              <div className="card text-center">
                <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Avg cost per conference</p>
                <p className="text-2xl font-bold text-brand-primary">{fmtCurrency(summary?.avgCostPerConference)}</p>
              </div>

              {/* Total closed/won */}
              <div className="card text-center">
                <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Total closed/won</p>
                <p className="text-2xl font-bold text-green-600">{fmtCurrency(summary?.totalClosedWon)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Conference attributed</p>
              </div>

              {/* Avg closed/won */}
              <div className="card text-center">
                <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Avg closed/won per conf</p>
                <p className="text-2xl font-bold text-green-600">{fmtCurrency(summary?.avgClosedWonPerConference)}</p>
              </div>

              {/* Avg CES */}
              <div className="card text-center">
                <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Avg CES score</p>
                <p className={`text-3xl font-bold ${cesColor(summary?.avgCES ?? null)}`}>
                  {summary?.avgCES != null ? summary.avgCES : '—'}
                </p>
                {summary && summary.conferencesScored > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Across {summary.conferencesScored} scored</p>
                )}
              </div>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-2">
              <AnimatedToggle
                options={[{ id: 'program', label: 'Program' }, { id: 'cost', label: 'Cost' }]}
                value={view}
                onChange={v => setView(v as 'program' | 'cost')}
                activeBg={id => id === 'program' ? 'bg-brand-primary' : 'bg-brand-accent'}
                className="w-[160px]"
              />
            </div>

            {view === 'cost' ? (
              <div className="grid grid-cols-6 gap-3 items-start">
                <div className="col-span-4">
                  <ProgramPlannerCostMatrix
                    conferences={flattenedConferences}
                    year={selectedYear}
                    activeConferenceIds={activeConferenceIds}
                    onActiveConferenceIdsChange={setActiveConferenceIds}
                    activeLineItems={activeLineItems}
                    onActiveLineItemsChange={setActiveLineItems}
                    selectedLineItem={selectedLineItem}
                    onLineItemSelect={setSelectedLineItem}
                  />
                </div>
                <div className="col-span-2 space-y-3">
                  <ProgramPlannerAnalyticsPanel
                    conferences={flattenedConferences}
                    activeConferenceIds={activeConferenceIds}
                    activeLineItems={activeLineItems}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3 items-start">
                {/* Program table */}
                <div className="col-span-3 card p-0 overflow-hidden">
                  {/* Table header row */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-gray-800">FY{selectedYear} conference program</span>
                      {(calIntelLoading || (calIntelProgress && calIntelProgress.completed < calIntelProgress.total)) && (
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {[0, 1, 2].map(i => (
                              <span key={i} className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                            ))}
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden w-20">
                            <div
                              className="h-full bg-brand-secondary rounded-full transition-all duration-300"
                              style={{ width: `${calIntelProgress ? Math.round(calIntelProgress.completed / calIntelProgress.total * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-gray-400">
                            Scoring {calIntelProgress?.completed ?? 0} of {calIntelProgress?.total ?? 0}
                          </span>
                        </div>
                      )}
                    </div>
                    <AnimatedToggle
                      options={[
                        { id: 'series', label: 'Series' },
                        { id: 'date', label: 'Date' },
                        { id: 'ces', label: 'CES' },
                      ]}
                      value={groupMode}
                      onChange={v => setGroupMode(v as GroupMode)}
                      activeBg="bg-brand-primary"
                      className="w-[200px]"
                    />
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <colgroup>
                        <col style={{ minWidth: 160 }} />
                        <col style={{ width: 64 }} />
                        <col style={{ width: 50 }} />
                        <col style={{ width: 100 }} />
                        <col style={{ width: 46 }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 52 }} />
                        <col style={{ width: 90 }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-gray-100">
                          {['Conference', 'Dates', 'CES'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-[12px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left text-[12px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <i className="ti ti-calendar-stats text-[11px] text-purple-600" aria-hidden="true" />
                              <span>Cal. intel. tier</span>
                            </div>
                          </th>
                          <th className="px-3 py-2 text-left text-[12px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <i className="ti ti-calendar-stats text-[11px] text-purple-600" aria-hidden="true" />
                              <span>Score</span>
                            </div>
                          </th>
                          {['Actual cost', 'Pipeline inf.', 'Closed/won', 'Heads', 'Decision'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-[12px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.length === 0 && (
                          <tr>
                            <td colSpan={10} className="px-4 py-8 text-center text-gray-400 text-sm">
                              No conferences found for {selectedYear}
                            </td>
                          </tr>
                        )}

                        {tableRows.map(row => {
                          if (row.type === 'series') {
                            const s = row.group;
                            const collapsed = collapsedSeries.has(s.seriesId);
                            return (
                              <tr key={row.key} style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }} className="border-y border-gray-200">
                                <td colSpan={10} className="px-3 py-2">
                                  <div className="flex items-center justify-between">
                                    <button
                                      onClick={() => toggleSeries(s.seriesId)}
                                      className="flex items-center gap-2 text-left"
                                    >
                                      <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                      <span className="text-xs font-bold text-gray-700">{s.seriesName}</span>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                          {s.conferenceCount} {s.conferenceCount !== 1 ? 'confs' : 'conf'}
                                        </span>
                                        {s.totalActualSpend > 0 && (
                                          <TooltipPill
                                            label={`Cost: ${fmtCurrency(s.totalActualSpend)}`}
                                            tooltip="Total Actual Cost"
                                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200"
                                          />
                                        )}
                                        {s.totalPipeline > 0 && (
                                          <TooltipPill
                                            label={`PI: ${fmtCurrency(s.totalPipeline)}`}
                                            tooltip="Pipeline Influenced"
                                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200"
                                          />
                                        )}
                                        {s.totalClosedWon > 0 && (
                                          <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); setClosedWonDrawer({ type: 'series', seriesId: s.seriesId, seriesName: s.seriesName }); }}
                                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors cursor-pointer"
                                          >
                                            {`C/W: ${fmtCurrency(s.totalClosedWon)}`}
                                          </button>
                                        )}
                                      </div>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          if (row.type === 'standalone_header') {
                            return (
                              <tr key={row.key} style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }} className="border-y border-gray-200">
                                <td colSpan={10} className="px-3 py-2">
                                  <button
                                    onClick={() => toggleSeries('__standalone__')}
                                    className="flex items-center gap-2"
                                  >
                                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsedSeries.has('__standalone__') ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                    <span className="text-xs font-bold text-gray-500">Standalone</span>
                                    <span className="text-[12px] text-gray-400">{confsData?.standalone.length} conference{(confsData?.standalone.length ?? 0) !== 1 ? 's' : ''}</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          }

                          // Conference row
                          const c = row.conf;
                          const isOdd = row.rowIndex % 2 === 1;
                          return (
                            <tr
                              key={row.key}
                              style={isOdd ? { backgroundColor: 'var(--color-background-secondary, #F9FAFB)' } : {}}
                              className="hover:bg-blue-50/30 transition-colors"
                            >
                              <td className="px-3 py-2">
                                <button className="text-brand-secondary hover:text-brand-primary text-left font-medium truncate max-w-[155px]">
                                  {c.name}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(c.startDate)}</td>
                              <td className="px-3 py-2">
                                {c.ces != null ? (
                                  <button
                                    type="button"
                                    onClick={() => setEffectivenessDrawer({ conferenceId: c.conferenceId, conferenceName: c.name })}
                                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border transition-opacity hover:opacity-75 cursor-pointer"
                                    style={{ backgroundColor: cesPillStyle(c.ces).bg, color: cesPillStyle(c.ces).color, borderColor: cesPillStyle(c.ces).border }}
                                    title="View effectiveness"
                                  >
                                    {c.ces}
                                  </button>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-3 py-2">
                                {(() => {
                                  const ci = calIntelScores.get(c.conferenceId);
                                  if (!ci && calIntelLoading) {
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <div className="flex gap-0.5">
                                          {[0, 1, 2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-blue-200 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}
                                        </div>
                                        <span className="text-[10px] text-gray-400">Scoring...</span>
                                      </div>
                                    );
                                  }
                                  if (!ci) return <span className="text-gray-400">—</span>;
                                  const cfg = TIER_CONFIG[ci.tier];
                                  if (!cfg) return <span className="text-[11px] text-gray-500">{ci.tier}</span>;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => {/* Cal. Intel. drawer — placeholder, wired in next build */}}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap hover:opacity-80 transition-opacity cursor-pointer"
                                      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
                                      title={`Cal. Intel.: ${cfg.label}${ci.confidence ? ` (${ci.confidence} confidence)` : ''}`}
                                    >
                                      <i className={`ti ${cfg.icon} text-[9px]`} aria-hidden="true" />
                                      {cfg.label}
                                    </button>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-2">
                                {(() => {
                                  const ci = calIntelScores.get(c.conferenceId);
                                  if (!ci && calIntelLoading) {
                                    return (
                                      <div className="flex gap-0.5">
                                        {[0, 1, 2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-blue-200 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}
                                      </div>
                                    );
                                  }
                                  if (!ci) return <span className="text-gray-400">—</span>;
                                  const cfg = TIER_CONFIG[ci.tier];
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => {/* Cal. Intel. drawer — placeholder */}}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-medium border hover:opacity-80 transition-opacity cursor-pointer"
                                      style={{ background: cfg?.bg ?? '#F3F4F6', color: cfg?.text ?? '#6B7280', borderColor: cfg?.border ?? '#D1D5DB' }}
                                      title={`Cal. Intel. score: ${ci.score}`}
                                    >
                                      {Math.round(ci.score)}
                                    </button>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-2">
                                {c.actualSpend != null ? (
                                  <button
                                    type="button"
                                    onClick={() => setBudgetDrawer(c)}
                                    className="inline-block px-1.5 py-0.5 rounded text-[12px] font-semibold border tabular-nums cursor-pointer hover:opacity-80 transition-opacity"
                                    style={{ backgroundColor: actualCostPillStyle(c.actualSpend, c.budgetTotal).bg, color: actualCostPillStyle(c.actualSpend, c.budgetTotal).color, borderColor: actualCostPillStyle(c.actualSpend, c.budgetTotal).border }}
                                  >
                                    {fmtCurrency(c.actualSpend)}
                                  </button>
                                ) : <span className="text-gray-400 tabular-nums">—</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-700 tabular-nums">{fmtCurrency(c.pipelineInfluenced)}</td>
                              <td className="px-3 py-2">
                                {(c.closedWon ?? 0) > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setClosedWonDrawer({ type: 'conference', conferenceId: c.conferenceId, conferenceName: c.name })}
                                    className="inline-block px-1.5 py-0.5 rounded text-[12px] font-semibold border bg-green-50 text-green-700 border-green-200 tabular-nums hover:bg-green-100 transition-colors cursor-pointer"
                                  >
                                    {fmtCurrency(c.closedWon)}
                                  </button>
                                ) : <span className="text-gray-400 tabular-nums">—</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{c.headcount ?? '—'}</td>
                              <td className="px-3 py-2">
                                <DecisionPill
                                  confId={c.conferenceId}
                                  value={c.decision}
                                  year={selectedYear}
                                  onUpdated={handleDecisionUpdated}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Decision summary strip */}
                  {allConfs.length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-3">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs font-semibold text-green-700">{decisionCounts.attend}</span>
                        <span className="text-xs text-green-600">Attend</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs font-semibold text-amber-700">{decisionCounts.reduce}</span>
                        <span className="text-xs text-amber-600">Reduce</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-xs font-semibold text-red-700">{decisionCounts.cut}</span>
                        <span className="text-xs text-red-600">Cut</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-gray-400" />
                        <span className="text-xs font-semibold text-gray-600">{decisionCounts.undecided}</span>
                        <span className="text-xs text-gray-500">Undecided</span>
                      </div>
                      <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-gray-300">|</span>
                        <span className="text-[10px] text-gray-400">Cal. intel.:</span>
                        {[
                          { label: 'Invest more', color: '#27500A' },
                          { label: 'Maintain', color: '#0C447C' },
                          { label: 'Reconsider', color: '#633806' },
                          { label: 'Evaluate first', color: '#633806' },
                          { label: 'Do not prioritize', color: '#791F1F' },
                        ].map(t => (
                          <div key={t.label} className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                            <span className="text-[10px] text-gray-400">{t.label}</span>
                          </div>
                        ))}
                        <span className="text-[10px] text-gray-300 ml-2">|</span>
                        <span className="text-[11px] text-gray-400 italic">* Closed/Won figures are attributed totals.</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Rankings panel */}
                <div className="col-span-1 card p-0 overflow-hidden sticky top-6">
                  <div className="px-3 py-2.5 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-800 mb-2">Conference rankings</p>
                    <AnimatedToggle
                      options={[
                        { id: 'ces', label: 'CES' },
                        { id: 'pipeline', label: 'Pipeline' },
                        { id: 'closedwon', label: 'C/Won' },
                        { id: 'spend', label: 'Spend' },
                      ]}
                      value={rankMetric}
                      onChange={v => setRankMetric(v as RankMetric)}
                      activeBg="bg-brand-primary"
                      className="w-full"
                    />
                  </div>
                  <div className="divide-y divide-gray-50">
                    {ranked.slice(0, 8).map((c, i) => {
                      let metricVal: string;
                      if (rankMetric === 'ces') metricVal = c.ces != null ? String(c.ces) : '—';
                      else if (rankMetric === 'pipeline') metricVal = fmtCurrency(c.pipelineInfluenced);
                      else if (rankMetric === 'closedwon') metricVal = fmtCurrency(c.closedWon);
                      else metricVal = fmtCurrency(c.actualSpend);

                      let sub1 = '';
                      let sub2 = '';
                      if (rankMetric === 'ces') {
                        sub1 = fmtCurrency(c.actualSpend);
                        sub2 = fmtCurrency(c.pipelineInfluenced);
                      } else if (rankMetric === 'pipeline') {
                        sub1 = c.ces != null ? `CES ${c.ces}` : '';
                        sub2 = fmtCurrency(c.actualSpend);
                      } else {
                        sub1 = c.ces != null ? `CES ${c.ces}` : '';
                        sub2 = fmtCurrency(c.pipelineInfluenced);
                      }

                      return (
                        <div key={c.conferenceId} className="px-3 py-2 flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 w-4 flex-shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-gray-700 truncate">{c.name}</p>
                            <p className="text-[10px] text-gray-400">{[sub1, sub2].filter(Boolean).join(' · ')}</p>
                          </div>
                          {metricVal === '—' ? (
                            <span className="text-[12px] text-gray-400 flex-shrink-0">—</span>
                          ) : rankMetric === 'ces' && c.ces != null ? (
                            <button
                              type="button"
                              onClick={() => setEffectivenessDrawer({ conferenceId: c.conferenceId, conferenceName: c.name })}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold border flex-shrink-0 transition-opacity hover:opacity-75 cursor-pointer"
                              style={{ backgroundColor: cesPillStyle(c.ces).bg, color: cesPillStyle(c.ces).color, borderColor: cesPillStyle(c.ces).border }}
                              title="View effectiveness"
                            >
                              {metricVal}
                            </button>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border flex-shrink-0 bg-gray-50 text-gray-700 border-gray-200 tabular-nums">
                              {metricVal}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {allConfs.length > 8 && (
                    <div className="px-3 py-2 border-t border-gray-100">
                      <button className="text-[12px] text-brand-secondary hover:text-brand-primary w-full text-center">
                        View all {allConfs.length} conferences
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {effectivenessDrawer && (
      <EffectivenessDrawer
        conferenceId={effectivenessDrawer.conferenceId}
        conferenceName={effectivenessDrawer.conferenceName}
        onClose={() => setEffectivenessDrawer(null)}
      />
    )}
    {closedWonDrawer && (
      <ClosedWonDrawer
        target={closedWonDrawer}
        onClose={() => setClosedWonDrawer(null)}
      />
    )}
    {budgetDrawer && (
      <ConferenceBudgetDrawer
        conference={budgetDrawer}
        onClose={() => setBudgetDrawer(null)}
      />
    )}
    {selectedLineItem && (
      <LineItemCostDrawer
        conferences={flattenedConferences}
        activeConferenceIds={activeConferenceIds}
        activeLineItems={activeLineItems}
        selectedLineItem={selectedLineItem}
        year={selectedYear}
        onClose={() => setSelectedLineItem(null)}
      />
    )}
    </>
  );
}
