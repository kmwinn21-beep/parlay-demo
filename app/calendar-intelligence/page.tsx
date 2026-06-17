'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/components/UserContext';
import { useOnboarding } from '@/lib/OnboardingContext';
import { evaluateBudgetCompleteness } from '@/lib/budgetCompleteness';
import { BudgetVsActualModal } from '@/components/BudgetVsActualModal';
import { PathToTier } from '@/components/calendar-intelligence/PathToTier';
import { ExecutionComparison } from '@/components/calendar-intelligence/ExecutionComparison';
import { DecisionsBoard } from '@/components/calendar-intelligence/DecisionsBoard';
import { CalendarNotesPanel } from '@/components/calendar-intelligence/CalendarNotesPanel';
import { DecisionTag } from '@/components/calendar-intelligence/DecisionTag';
import {
  type CalendarConferenceRow,
  type CalendarStore,
  getCalendarStore,
  setCalendarStore,
  subscribeCalendarStore,
  startCalendarScoring,
  refreshConferenceScore,
} from '@/lib/calendarIntelligenceStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type CITab = 'scoring' | 'decisions';

// ── Helpers ───────────────────────────────────────────────────────────────────

function calendarScoreColor(score: number | null): string {
  if (score == null) return '#9ca3af';
  if (score >= 85) return '#059669';
  if (score >= 70) return '#0d9488';
  if (score >= 55) return '#d97706';
  if (score >= 40) return '#f97316';
  return '#dc2626';
}

const CALENDAR_TIER_INFO: Record<string, { label: string; classes: string }> = {
  attend_invest_more:       { label: 'Attend & Invest',      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  attend_maintain:          { label: 'Attend & Maintain',    classes: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  attend_reconsider_format: { label: 'Reconsider Format',    classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  evaluate_before_committing:{ label: 'Evaluate First',      classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  remove_from_calendar:     { label: 'Remove from Calendar', classes: 'bg-red-50 text-red-700 border-red-200' },
  do_not_prioritize:        { label: 'Do Not Prioritize',    classes: 'bg-red-50 text-red-600 border-red-100' },
};

function calendarTierInfo(tier: string): { label: string; classes: string } {
  return CALENDAR_TIER_INFO[tier] ?? { label: tierLabel(tier), classes: 'bg-gray-50 text-gray-600 border-gray-200' };
}

function confidencePillClasses(level: string): string {
  if (level === 'high') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (level === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function icpDensityPillClasses(pct: number): string {
  if (pct >= 30) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (pct >= 15) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function tierLabel(tier: string): string {
  return tier.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

// ── Budget Status Cell ────────────────────────────────────────────────────────

function BudgetStatusCell({ row, onOpenModal }: { row: CalendarConferenceRow; onOpenModal: () => void }) {
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (pillRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  if (row.conferenceType === 'historical') return <span className="text-gray-300 text-xs">—</span>;

  const bud = row.diagnostics?.budget;
  const status = evaluateBudgetCompleteness({
    lineItems: bud?.line_items as Array<{ budget?: string | number | null; actual?: string | number | null }> | null,
    returnOnCost: bud?.return_on_cost,
    requiredPipelineAmount: bud?.required_pipeline_amount,
  });

  if (status.status === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
        Complete
      </span>
    );
  }

  const isPartial = status.status === 'partial';
  const pillCls = isPartial
    ? 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200'
    : 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200';

  function handleToggle() {
    if (!open && pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect();
      const panelW = 280;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelW - 8));
      const above = rect.top > 300;
      setPanelPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, above });
    }
    setOpen(v => !v);
  }

  return (
    <div className="relative inline-block">
      <button ref={pillRef} type="button" onClick={handleToggle} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors ${pillCls}`}>
        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86A1 1 0 0 0 3.58 20h16.84a1 1 0 0 0 .87-1.5L13.71 3.86a1 1 0 0 0-1.42 0z"/></svg>
        {isPartial ? 'Partial' : 'No Budget'}
      </button>
      {open && panelPos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: panelPos.above ? panelPos.top : panelPos.top, left: panelPos.left, width: 280, zIndex: 10000, transform: panelPos.above ? 'translateY(-100%)' : 'translateY(0)' }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl p-4 text-left"
        >
          <p className="text-sm font-semibold text-gray-900 mb-1">{isPartial ? 'Budget data incomplete' : 'No budget data entered'}</p>
          {isPartial
            ? <p className="text-xs text-gray-500 mb-3">Missing budget fields are limiting the accuracy of your Cost Justification and Commercial Potential scores.</p>
            : <p className="text-xs text-gray-500 mb-3">Without budget data, Parlay cannot calculate Cost Justification or Commercial Potential scores. These two components represent 36% of the Calendar Recommendation Score.</p>
          }
          <div className="space-y-1 mb-3">
            {status.missingFields.map(f => (
              <div key={f} className="flex items-center gap-1.5 text-xs text-red-600">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                {f}
              </div>
            ))}
            {status.presentFields.map(f => (
              <div key={f} className="flex items-center gap-1.5 text-xs text-green-600">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                {f}
              </div>
            ))}
          </div>
          {isPartial
            ? <button type="button" onClick={() => { setOpen(false); onOpenModal(); }} className="text-xs text-brand-secondary hover:underline font-medium">Add budget data →</button>
            : <button type="button" onClick={() => { setOpen(false); onOpenModal(); }} className="btn-primary text-xs w-full">Add Budget Data</button>
          }
        </div>
      )}
    </div>
  );
}

// ── Your Input Cell ───────────────────────────────────────────────────────────

type InputDecision = 'confirmed' | 'attend_but_reduce' | 'watching' | 'passed' | 'pending_approval';

const CI_DECISION_CONFIG: Record<InputDecision, { label: string; bg: string; text: string; border: string }> = {
  confirmed:         { label: 'Attend',           bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  attend_but_reduce: { label: 'Attend (Reduced)', bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200' },
  watching:          { label: 'On the Fence',     bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200' },
  passed:            { label: "Don't Attend",     bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200' },
  pending_approval:  { label: 'Evaluating',       bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200' },
};

function InputDropdown({
  dropdownRef,
  pos,
  onSelect,
  current,
}: {
  dropdownRef: React.RefObject<HTMLDivElement>;
  pos: { top: number; left: number };
  onSelect: (d: InputDecision | null) => void;
  current: string | null;
}) {
  return createPortal(
    <div
      ref={dropdownRef}
      className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
    >
      {(Object.entries(CI_DECISION_CONFIG) as [InputDecision, typeof CI_DECISION_CONFIG[InputDecision]][]).map(([key, cfg]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${cfg.text} ${current === key ? 'font-semibold' : ''}`}
        >
          {cfg.label}
        </button>
      ))}
      <button
        onClick={() => onSelect(null)}
        className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100"
      >
        Clear
      </button>
    </div>,
    document.body
  );
}

function YourInputCell({
  conferenceId,
  decision,
  hasPendingRequest,
  canEdit,
  onChanged,
}: {
  conferenceId: number;
  decision: string | null;
  hasPendingRequest: boolean;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
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

  const openDropdown = () => {
    if (!canEdit || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  };

  const select = async (d: InputDecision | null) => {
    setOpen(false);
    if (d === null) {
      await fetch('/api/calendar-intelligence/decisions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferenceId, level: 'user' }),
      }).catch(() => {});
    } else {
      await fetch('/api/calendar-intelligence/decisions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferenceId, decision: d, level: 'user' }),
      }).catch(() => {});
    }
    onChanged();
  };

  const cfg = decision ? CI_DECISION_CONFIG[decision as InputDecision] : null;

  if (hasPendingRequest && !decision) {
    return (
      <>
        <button
          ref={buttonRef}
          onClick={openDropdown}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border bg-red-50 text-red-700 border-red-200 ${canEdit ? 'cursor-pointer hover:bg-red-100' : 'cursor-default'}`}
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86A1 1 0 003.58 20h16.84a1 1 0 00.87-1.5L13.71 3.86a1 1 0 00-1.42 0z"/>
          </svg>
          INPUT REQUESTED
        </button>
        {open && dropdownPos && (
          <InputDropdown dropdownRef={dropdownRef} pos={dropdownPos} onSelect={select} current={null} />
        )}
      </>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={openDropdown}
        className={`px-2 py-0.5 rounded text-[12px] font-medium border ${
          cfg
            ? `${cfg.bg} ${cfg.text} ${cfg.border} ${canEdit ? 'cursor-pointer' : 'cursor-default'}`
            : `bg-gray-50 text-gray-400 border-dashed border-gray-300 ${canEdit ? 'hover:border-gray-400 hover:text-gray-500 cursor-pointer' : 'cursor-default'}`
        }`}
      >
        {cfg ? cfg.label : '—'}
      </button>
      {open && dropdownPos && (
        <InputDropdown dropdownRef={dropdownRef} pos={dropdownPos} onSelect={select} current={decision} />
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CalendarIntelligencePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { onboardingTrack, onboardingProgress, markStepComplete } = useOnboarding();

  const initialTab = (searchParams.get('tab') as CITab | null) ?? 'scoring';
  const [activeTab, setActiveTab] = useState<CITab>(initialTab);

  // Scoring tab state
  const [calendarState, setCalendarStateLocal] = useState<CalendarStore>(getCalendarStore);
  const [calendarSort, setCalendarSort] = useState<keyof CalendarConferenceRow | 'score'>('score');
  const [calendarRecommendationFilter, setCalendarRecommendationFilter] = useState('all');
  const [calendarTypeFilter, setCalendarTypeFilter] = useState<'all' | 'historical' | 'active'>('all');
  const [calendarConfidenceFilter, setCalendarConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [calendarBudgetFilter, setCalendarBudgetFilter] = useState<'all' | 'complete' | 'partial' | 'missing' | 'needs_attention'>('all');
  const [calendarFiltersOpen, setCalendarFiltersOpen] = useState(false);
  const [budgetModalConf, setBudgetModalConf] = useState<{ id: number; name: string } | null>(null);
  const [selectedCalendarRow, setSelectedCalendarRow] = useState<CalendarConferenceRow | null>(null);

  // CES availability — used to show/hide Execution Comparison button
  const [cesConferenceIds, setCesConferenceIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    fetch('/api/calendar-intelligence/ces')
      .then(r => r.ok ? r.json() : { ces: {} })
      .then((data: { ces: Record<number, unknown> }) => setCesConferenceIds(new Set(Object.keys(data.ces ?? {}).map(Number))))
      .catch(() => {});
  }, []);

  // Drawer tool state
  const [pathToTierOpen, setPathToTierOpen] = useState(false);
  const [executionComparisonOpen, setExecutionComparisonOpen] = useState(false);

  // Decision sync — incremented when a decision changes in either panel or the decision column
  const [decisionSyncKey, setDecisionSyncKey] = useState(0);
  const bumpDecisionSync = useCallback(() => setDecisionSyncKey(k => k + 1), []);

  // Board refresh
  const [boardRefreshKey, setBoardRefreshKey] = useState(0);

  // Input Board: conference list (loaded from board API via callback) + selected conference
  const [boardConferences, setBoardConferences] = useState<Array<{ conferenceId: number; name: string; year: number }>>([]);
  const [selectedBoardConferenceId, setSelectedBoardConferenceId] = useState<number | null>(null);

  // Logged-in user's input decisions + pending input requests across all conferences
  const [myInputStatus, setMyInputStatus] = useState<{
    decisions: Record<number, string>;
    pendingConferenceIds: number[];
  } | null>(null);

  const reloadMyInputStatus = useCallback(() => {
    fetch('/api/calendar-intelligence/my-input-status')
      .then(r => r.ok ? r.json() : null)
      .then((data: { decisions: Record<number, string>; pendingConferenceIds: number[] } | null) => {
        if (data) setMyInputStatus(data);
      })
      .catch(() => {});
  }, []);

  const drawerExpanded = pathToTierOpen || executionComparisonOpen;
  const canUseTools = user?.capabilities?.use_calendar_tools ?? false;

  // Subscribe to module-level store
  useEffect(() => {
    setCalendarStateLocal(getCalendarStore());
    return subscribeCalendarStore(() => setCalendarStateLocal(getCalendarStore()));
  }, []);

  // Trigger scoring on mount
  useEffect(() => {
    if (getCalendarStore().status === 'idle') startCalendarScoring();
  }, []);

  // Load user's input status (decisions + pending requests); refresh on decision sync
  useEffect(() => {
    reloadMyInputStatus();
  }, [reloadMyInputStatus, decisionSyncKey]);

  // Onboarding tracking
  useEffect(() => {
    if (onboardingTrack !== 'track_b' || !onboardingProgress) return;
    if (!onboardingProgress.completed_steps.includes('calendar_intel_visited')) {
      markStepComplete('calendar_intel_visited');
    }
  }, [onboardingTrack, onboardingProgress, markStepComplete]);

  useEffect(() => {
    const load = () => {
      fetch('/api/calendar-intelligence/my-input-status')
        .then(r => r.ok ? r.json() : null)
        .then((data: { decisions: Record<number, string>; pendingConferenceIds: number[] } | null) => {
          if (data) setMyInputStatus(data);
        })
        .catch(() => {});
    };
    load();
  }, [decisionSyncKey]);

  const calendarRows = calendarState.rows;
  const calendarLoading = calendarState.status === 'loading_basic';
  const calendarScoringProgress = calendarState.scoringProgress;
  const calendarIsScoring = calendarState.status === 'scoring';
  const calendarFullyScored = calendarState.fullyScored;

  // Keep drawer in sync when a scored row updates
  useEffect(() => {
    if (!selectedCalendarRow) return;
    const updated = calendarRows.find(r => r.conferenceId === selectedCalendarRow.conferenceId);
    if (updated && updated !== selectedCalendarRow) setSelectedCalendarRow(updated);
  }, [calendarRows, selectedCalendarRow]);

  const calendarRowsFiltered = useMemo(() => {
    let rows = [...calendarRows];
    if (calendarRecommendationFilter !== 'all') {
      const m: Record<string, string[]> = {
        attend_invest: ['attend_invest_more'],
        attend_maintain: ['attend_maintain'],
        reconsider: ['attend_reconsider_format'],
        evaluate: ['evaluate_before_committing'],
        cut_avoid: ['remove_from_calendar', 'do_not_prioritize'],
      };
      rows = rows.filter(r => m[calendarRecommendationFilter]?.includes(r.recommendationTier));
    }
    if (calendarTypeFilter !== 'all') rows = rows.filter(r => r.conferenceType === calendarTypeFilter);
    if (calendarConfidenceFilter !== 'all') rows = rows.filter(r => r.confidenceLevel === calendarConfidenceFilter);
    if (calendarBudgetFilter !== 'all') {
      rows = rows.filter(r => {
        if (r.conferenceType === 'historical') return false;
        const bud = r.diagnostics?.budget;
        const s = evaluateBudgetCompleteness({
          lineItems: bud?.line_items as Array<{ budget?: string | number | null; actual?: string | number | null }> | null,
          returnOnCost: bud?.return_on_cost,
          requiredPipelineAmount: bud?.required_pipeline_amount,
        });
        if (calendarBudgetFilter === 'needs_attention') return s.status === 'partial' || s.status === 'missing';
        return s.status === calendarBudgetFilter;
      });
    }
    rows.sort((a, b) => {
      if (calendarSort === 'score') return (b.calendarRecommendationScore ?? -1) - (a.calendarRecommendationScore ?? -1);
      const av = a[calendarSort as keyof CalendarConferenceRow] as unknown;
      const bv = b[calendarSort as keyof CalendarConferenceRow] as unknown;
      if (typeof av === 'number' && typeof bv === 'number') return bv - av;
      return String(av ?? '').localeCompare(String(bv ?? ''));
    });
    return rows;
  }, [calendarRows, calendarRecommendationFilter, calendarTypeFilter, calendarConfidenceFilter, calendarBudgetFilter, calendarSort]);

  const closeDrawer = useCallback(() => {
    setSelectedCalendarRow(null);
    setPathToTierOpen(false);
    setExecutionComparisonOpen(false);
    setBoardRefreshKey(k => k + 1);
  }, []);

  // Capability gate — must be after all hooks
  if (user && !user.capabilities?.view_calendar_intelligence) {
    router.replace('/');
    return null;
  }

  // ── Scrollable overlay panel with chevron indicators ──────────────────────
  function OverlayPanel({ children, className }: { children: React.ReactNode; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [canUp, setCanUp] = useState(false);
    const [canDown, setCanDown] = useState(false);

    const updateArrows = useCallback(() => {
      const el = ref.current;
      if (!el) return;
      setCanUp(el.scrollTop > 4);
      setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    }, []);

    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      el.addEventListener('scroll', updateArrows, { passive: true });
      const ro = new ResizeObserver(updateArrows);
      ro.observe(el);
      updateArrows();
      return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect(); };
    }, [updateArrows]);

    return (
      <div className={`relative flex flex-col bg-white rounded-xl shadow-sm overflow-hidden ${className ?? ''}`}>
        {canUp && (
          <button
            onClick={() => ref.current?.scrollBy({ top: -(ref.current.clientHeight), behavior: 'smooth' })}
            className="absolute top-2 left-1/2 -translate-x-1/2 z-20 p-1.5 rounded-full bg-white/90 text-gray-400 hover:text-gray-600 shadow-sm transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/></svg>
          </button>
        )}
        <div ref={ref} className="flex-1 overflow-y-auto hide-scrollbar">
          {children}
        </div>
        {canDown && (
          <button
            onClick={() => ref.current?.scrollBy({ top: ref.current.clientHeight, behavior: 'smooth' })}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 p-1.5 rounded-full bg-white/90 text-gray-400 hover:text-gray-600 shadow-sm transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
          </button>
        )}
      </div>
    );
  }

  // ── Fourth column: Recommendation + Decision ───────────────────────────────
  function DecisionColumn({ row, syncKey, onDecisionChanged, isAdmin }: { row: CalendarConferenceRow; syncKey: number; onDecisionChanged: () => void; isAdmin: boolean }) {
    const tierInfo = calendarTierInfo(row.recommendationTier);
    const investmentLabel = row.recommendationTier === 'attend_invest_more' ? 'Increase Investment'
      : row.recommendationTier === 'attend_maintain' ? 'Maintain Investment'
      : row.recommendationTier === 'attend_reconsider_format' ? 'Reduce Sponsorship'
      : row.recommendationTier === 'evaluate_before_committing' ? 'Attend Only'
      : 'Do Not Attend';

    return (
      <div className="w-[460px] flex-shrink-0 self-start bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 space-y-6">
          {/* Calendar Recommendation section */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">Calendar Recommendation</p>
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border ${tierInfo.classes}`}>{tierInfo.label}</span>
            <p className="text-sm text-gray-700 mt-3">{row.conferenceName} scored {row.calendarRecommendationScore ?? 'N/A'}/100 with ICP density of {row.icpDensityPct.toFixed(1)}%.</p>
            <p className="text-sm mt-2 text-gray-700"><span className="font-semibold">Investment:</span> {investmentLabel}</p>
            <p className="text-sm mt-1 text-gray-700"><span className="font-semibold">Confidence:</span> {row.confidenceLevel}</p>
          </div>

          {/* My Decision section */}
          <div className="pt-5 border-t">
            <DecisionTag conferenceId={row.conferenceId} syncKey={syncKey} onDecisionChanged={onDecisionChanged} />
          </div>
        </div>
      </div>
    );
  }

  // ── Score drawer left panel content ─────────────────────────────────────────
  function ScoreDrawerContent({ row }: { row: CalendarConferenceRow }) {
    const scoreColor = calendarScoreColor(row.calendarRecommendationScore);
    const tierInfo = calendarTierInfo(row.recommendationTier);

    const d = row.diagnostics ?? {};
    const cs = row.componentScores;
    const te = d.targetingEngine;
    const cp = d.commercialPotential;
    const projectedPipeline = Number(cp?.projected_pipeline ?? 0);
    const realisticPipeline = Number(cp?.realistic_pipeline ?? 0);
    const bud = d.budget;
    const reqPipeline = Number(bud?.required_pipeline_amount ?? 0);
    const reqMultiple = Number(bud?.required_pipeline_multiple ?? 5);
    const teBenchmarks = te != null ? (te.isLargeConference ? { must: '15%', high: '30%', worth: '25%' } : { must: '10%', high: '20%', worth: '20%' }) : null;
    const teActionableRate = te != null && te.totalScoredCompanies > 0 ? (te.actionableCount / te.totalScoredCompanies * 100).toFixed(0) + '%' : null;
    const W = { audienceFit: 30, targetOpportunity: 24, commercialPotential: 18, costJustification: 18, strategicValue: 10 };

    const components = [
      { key: 'Audience Fit', score: cs?.audienceFit ?? null, weight: W.audienceFit, bullets: [`${row.icpCompanies} ICP companies out of ${row.totalCompanies} total (${row.icpDensityPct.toFixed(1)}% density — benchmark 15%)`, ...(te != null ? [`Avg buyer access score: ${te.avgBuyerAccessScore.toFixed(0)}/100`] : [])] },
      { key: 'Target Opportunity', score: cs?.targetOpportunity ?? null, weight: W.targetOpportunity, unavailable: te == null ? 'Prospect company type not configured.' : undefined, bullets: te != null ? [`${te.totalScoredCompanies} companies scored`, `Must Target: ${te.mustTargetCount} (benchmark ${teBenchmarks!.must})`, `High Priority: ${te.highPriorityCount} (benchmark ${teBenchmarks!.high})`, `Worth Engaging: ${te.worthEngagingCount} (benchmark ${teBenchmarks!.worth})`, `Actionable rate: ${teActionableRate}`] : ['Target scoring not run.', 'Ensure the prospect company type is configured.'] },
      { key: 'Commercial Potential', score: cs?.commercialPotential ?? null, weight: W.commercialPotential, unavailable: cp == null ? 'Commercial inputs unavailable.' : undefined, bullets: cp != null ? [
        `Available pipeline: $${projectedPipeline.toLocaleString()}`,
        ...(realisticPipeline > 0 ? [`Realistic pipeline: $${realisticPipeline.toLocaleString()}`] : []),
        ...(reqPipeline > 0 ? [
          `Required: $${reqPipeline.toLocaleString()}`,
          `Total Coverage: ${((projectedPipeline / reqPipeline) * 100).toFixed(0)}%`,
          ...(realisticPipeline > 0 ? [`Realistic Coverage: ${((realisticPipeline / reqPipeline) * 100).toFixed(0)}%`] : []),
        ] : ['No budget entered.']),
      ] : ['No target WSE or avg cost data available.'] },
      { key: 'Cost Justification', score: cs?.costJustification ?? null, weight: W.costJustification, unavailable: bud == null ? 'No budget data available.' : undefined, bullets: bud != null ? [
        `Required pipeline: $${reqPipeline.toLocaleString()}`,
        `Required ROI multiple: ${reqMultiple}x`,
        ...(cp != null && reqPipeline > 0 ? [`Attainable Pipeline: $${realisticPipeline > 0 ? realisticPipeline.toLocaleString() : projectedPipeline.toLocaleString()} (${(((realisticPipeline > 0 ? realisticPipeline : projectedPipeline) / reqPipeline) * 100).toFixed(0)}%)`] : []),
      ] : ['Budget not entered.', 'Add budget in conference settings. This would add up to 18 points to your score.'] },
      { key: 'Strategic Value', score: cs?.strategicValue ?? null, weight: W.strategicValue, unavailable: te == null ? 'Prospect company type not configured.' : undefined, bullets: (() => {
        const sv = d.strategicValue;
        if (!sv) return ['Prospect company type not configured.', 'This would add up to 10 points to your score.'];
        return [
          `Avg relationship leverage: ${sv.base_score}/100 (across ${sv.total_scored} prospect companies)`,
          `Companies with internal relationships: ${sv.internal_rel_count}`,
          `Companies with prior engagement: ${sv.prior_engagement_count}`,
          `Known prospects attending: ${sv.known_prospect_count}`,
          sv.client_count > 0 ? `Clients attending: ${sv.client_count} ↩ retention/expansion signal` : `Clients attending: 0`,
          sv.has_competitor ? `Competitor presence: Yes (+${sv.competitor_bonus} pts applied)` : 'Competitor presence: No',
        ];
      })() },
    ];

    return (
      <div className="p-5">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{row.conferenceName} · {row.conferenceYear}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{row.conferenceType === 'historical' ? 'Historical' : 'Active'} · Data age: {row.dataAge.toFixed(1)} years</p>
          </div>
          <button onClick={closeDrawer} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Score card */}
        <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: scoreColor + '15', borderLeft: `4px solid ${scoreColor}` }}>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Calendar Score</p>
          <div className="flex items-end gap-1">
            <span className="text-4xl font-bold leading-tight" style={{ color: scoreColor }}>{row.calendarRecommendationScore ?? '—'}</span>
            {row.calendarRecommendationScore != null && <span className="text-sm font-normal text-gray-400 mb-0.5">/100</span>}
          </div>
          <p className="text-xs font-semibold mt-1" style={{ color: scoreColor }}>{tierInfo.label}</p>
          <p className="text-xs text-gray-400 mt-1">Based on {row.availableComponentCount ?? '?'} of 5 components · max possible {row.maxPossibleScore ?? '—'}/100</p>
          {/* Budget summary inside score card */}
          {(() => {
            const budRaw = row.diagnostics?.budget;
            if (!budRaw) {
              return (
                <div className="mt-2 pt-2 border-t border-current/10 flex items-center justify-between">
                  <span className="text-xs text-gray-400">No budget data</span>
                  <button type="button" onClick={() => setBudgetModalConf({ id: row.conferenceId, name: row.conferenceName })} className="text-xs font-medium underline" style={{ color: scoreColor }}>Add Budget →</button>
                </div>
              );
            }
            let items: Array<{ budget?: string | number | null; actual?: string | number | null }> = [];
            if (typeof budRaw.line_items === 'string') {
              try { items = JSON.parse(budRaw.line_items); } catch { items = []; }
            } else if (Array.isArray(budRaw.line_items)) {
              items = budRaw.line_items as Array<{ budget?: string | number | null; actual?: string | number | null }>;
            }
            const totalBudget = items.reduce((s, i) => s + (Number(i?.budget) || 0), 0);
            const totalActual = items.reduce((s, i) => s + (Number(i?.actual) || 0), 0);
            const hasSpend = totalBudget > 0 || totalActual > 0;
            if (!hasSpend) {
              return (
                <div className="mt-2 pt-2 border-t border-current/10 flex items-center justify-between">
                  <span className="text-xs text-gray-400">No budget data</span>
                  <button type="button" onClick={() => setBudgetModalConf({ id: row.conferenceId, name: row.conferenceName })} className="text-xs font-medium underline" style={{ color: scoreColor }}>Add Budget →</button>
                </div>
              );
            }
            const variance = totalBudget - totalActual;
            const varStr = variance === 0 ? 'on budget' : variance > 0 ? `$${Math.abs(variance).toLocaleString()} under` : `$${Math.abs(variance).toLocaleString()} over`;
            return (
              <div className="mt-2 pt-2 border-t border-current/10">
                <p className="text-xs text-gray-500">
                  ${totalBudget.toLocaleString()} budgeted · ${totalActual.toLocaleString()} actual · <span className={variance < 0 ? 'text-red-500' : 'text-gray-600'}>{varStr}</span>
                </p>
              </div>
            );
          })()}
        </div>

        {/* Tool buttons — only shown if user has use_calendar_tools capability */}
        {canUseTools && (
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => { setPathToTierOpen(v => !v); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${pathToTierOpen ? 'bg-brand-secondary text-white border-brand-secondary' : 'border-gray-200 text-gray-600 hover:border-brand-secondary hover:text-brand-secondary'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
              Gap Analysis
            </button>
            {cesConferenceIds.has(row.conferenceId) && (
              <button
                onClick={() => { setExecutionComparisonOpen(v => !v); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${executionComparisonOpen ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600 hover:border-teal-600 hover:text-teal-600'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Execution Comparison
              </button>
            )}
          </div>
        )}

        {/* Score breakdown */}
        <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Score Breakdown</h4>
        <div className="space-y-3">
          {components.map((c) => (
            <div key={c.key} className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className={`font-semibold text-sm ${c.score == null ? 'text-gray-400' : 'text-gray-800'}`}>{c.key}</p>
                <p className="text-xs text-gray-500">{c.score == null ? '—' : Math.round(c.score)}/100 · {c.weight}%{c.score == null ? ' — not scored' : ''}</p>
              </div>
              <div className="mt-2 h-1.5 rounded bg-gray-100 overflow-hidden">
                <div className="h-full rounded" style={{ width: `${c.score ?? 0}%`, backgroundColor: calendarScoreColor(c.score) }} />
              </div>
              {c.score == null && c.unavailable && <p className="text-xs text-gray-400 mt-1.5">{c.unavailable}</p>}
              <ul className="list-disc pl-4 mt-2 text-xs text-gray-500 space-y-0.5">{c.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          ))}
        </div>

        {/* Recommendation */}
        <div className="mt-5 pt-5 border-t">
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Calendar Recommendation</h4>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border ${tierInfo.classes}`}>{tierInfo.label}</span>
          <p className="text-sm text-gray-700 mt-3">{row.conferenceName} scored {row.calendarRecommendationScore ?? 'N/A'}/100 with ICP density of {row.icpDensityPct.toFixed(1)}%.</p>
          <p className="text-sm mt-2"><span className="font-semibold">Investment Recommendation:</span> {row.recommendationTier === 'attend_invest_more' ? 'Increase Investment' : row.recommendationTier === 'attend_maintain' ? 'Maintain Investment' : row.recommendationTier === 'attend_reconsider_format' ? 'Reduce Sponsorship' : row.recommendationTier === 'evaluate_before_committing' ? 'Attend Only' : 'Do Not Attend'}</p>
          <p className="text-sm mt-1"><span className="font-semibold">Confidence:</span> {row.confidenceLevel}</p>
        </div>

        {/* Decision Tag */}
        <div className="mt-5 pt-5 border-t">
          <DecisionTag
            conferenceId={row.conferenceId}
            syncKey={decisionSyncKey}
            onDecisionChanged={bumpDecisionSync}
            disabled={
              !(user?.capabilities?.record_input_without_invitation) &&
              !(myInputStatus?.pendingConferenceIds.includes(row.conferenceId))
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 font-serif">Calendar Intelligence</h1>
        <p className="text-gray-500 text-sm mt-1">Data-driven conference prioritization and portfolio decisions.</p>
      </div>

      {/* Tab bar row — includes Input Board conference selector inline */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 w-full md:w-fit">
          {([
            { id: 'scoring' as CITab, label: 'Scoring Table', mobileLabel: 'Scoring' },
            { id: 'decisions' as CITab, label: 'Input Board', mobileLabel: 'Input' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-brand-secondary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="md:hidden">{tab.mobileLabel}</span>
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Conference selector — only shown on Input Board tab */}
        {activeTab === 'decisions' && calendarRows.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={selectedBoardConferenceId ?? ''}
              onChange={e => setSelectedBoardConferenceId(e.target.value ? Number(e.target.value) : null)}
              className="border border-gray-200 rounded-xl px-3 h-10 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-secondary/30"
            >
              <option value="">All conferences</option>
              {calendarRows.map(c => (
                <option key={c.conferenceId} value={c.conferenceId}>{c.conferenceName} ({c.conferenceYear})</option>
              ))}
            </select>
            {selectedBoardConferenceId != null && (
              <button
                onClick={() => setSelectedBoardConferenceId(null)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
              >
                ✕ Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Tab: Scoring Table ─────────────────────────────────────────────── */}
      {activeTab === 'scoring' && (
        <div className="space-y-4">
          {calendarLoading && calendarRows.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-10 h-10 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">Loading conference data…</p>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              {(() => {
                const needsBudgetCount = calendarRows.filter(r => {
                  if (r.conferenceType === 'historical') return false;
                  const bud = r.diagnostics?.budget;
                  const s = evaluateBudgetCompleteness({ lineItems: bud?.line_items as Array<{ budget?: string | number | null; actual?: string | number | null }> | null, returnOnCost: bud?.return_on_cost, requiredPipelineAmount: bud?.required_pipeline_amount });
                  return s.status === 'partial' || s.status === 'missing';
                }).length;
                const budgetCardActive = calendarBudgetFilter === 'needs_attention';
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
                    <div className="card border-l-4 border-brand-secondary py-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Conferences Scored</p><p className="text-3xl font-bold text-brand-primary">{calendarRows.length}</p></div>
                    <div className="card border-l-4 border-green-500 py-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Attend &amp; Invest</p><p className="text-3xl font-bold text-brand-primary">{calendarRows.filter(r => r.recommendationTier === 'attend_invest_more').length}</p></div>
                    <div className="card border-l-4 border-emerald-500 py-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Attend &amp; Maintain</p><p className="text-3xl font-bold text-brand-primary">{calendarRows.filter(r => r.recommendationTier === 'attend_maintain').length}</p></div>
                    <div className="card border-l-4 border-amber-500 py-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reconsider or Evaluate</p><p className="text-3xl font-bold text-brand-primary">{calendarRows.filter(r => ['attend_reconsider_format', 'evaluate_before_committing'].includes(r.recommendationTier)).length}</p></div>
                    <div className="card border-l-4 border-red-500 py-4"><p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cut or Avoid</p><p className="text-3xl font-bold text-brand-primary">{calendarRows.filter(r => ['remove_from_calendar', 'do_not_prioritize'].includes(r.recommendationTier)).length}</p></div>
                    <button type="button" onClick={() => setCalendarBudgetFilter(budgetCardActive ? 'all' : 'needs_attention')} className={`card border-l-4 border-amber-400 py-4 text-left w-full transition-colors ${budgetCardActive ? 'bg-amber-50 ring-1 ring-amber-300' : 'hover:bg-amber-50/50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Need Budget Data</p>
                        <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86A1 1 0 0 0 3.58 20h16.84a1 1 0 0 0 .87-1.5L13.71 3.86a1 1 0 0 0-1.42 0z"/></svg>
                      </div>
                      <p className="text-3xl font-bold text-brand-primary">{needsBudgetCount}</p>
                      {budgetCardActive && <p className="text-[10px] text-amber-600 mt-1 font-medium">Filter active — click to clear</p>}
                    </button>
                  </div>
                );
              })()}

              {/* Scoring progress */}
              {calendarScoringProgress !== null && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 border-2 border-blue-400/40 border-t-blue-500 animate-spin rounded-full flex-shrink-0" />
                    <span className="text-sm font-medium text-blue-700">Scoring conferences with Target Recommendations engine…</span>
                    <span className="ml-auto text-sm text-blue-600 tabular-nums">{calendarScoringProgress.completed} of {calendarScoringProgress.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${(calendarScoringProgress.completed / calendarScoringProgress.total) * 100}%` }} />
                  </div>
                  <p className="text-xs text-blue-500 mt-1.5">Scores for Target Opportunity and Strategic Value are populating as each conference is processed.</p>
                </div>
              )}

              {/* Filters + table */}
              <div className="card">
                {(() => {
                  const activeFilterCount = [calendarRecommendationFilter !== 'all', calendarTypeFilter !== 'all', calendarConfidenceFilter !== 'all', calendarBudgetFilter !== 'all'].filter(Boolean).length;
                  return (
                    <>
                      <div className="flex items-center mb-3">
                        <button type="button" onClick={() => setCalendarFiltersOpen(o => !o)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${activeFilterCount > 0 ? 'border-brand-secondary text-brand-secondary bg-blue-50' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                          Filters
                          {activeFilterCount > 0 && <span className="bg-brand-secondary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">{activeFilterCount}</span>}
                          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${calendarFiltersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                      {/* Mobile filter bottom sheet */}
                      {calendarFiltersOpen && (
                        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setCalendarFiltersOpen(false)}>
                          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="font-semibold text-gray-900">Filters</h3>
                              <button onClick={() => setCalendarFiltersOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                              </button>
                            </div>
                            <div className="space-y-3">
                              <select className="input-field text-sm py-2 w-full" value={calendarRecommendationFilter} onChange={(e) => setCalendarRecommendationFilter(e.target.value)}><option value="all">All Recommendations</option><option value="attend_invest">Attend &amp; Invest</option><option value="attend_maintain">Attend &amp; Maintain</option><option value="reconsider">Reconsider Format</option><option value="evaluate">Evaluate</option><option value="cut_avoid">Cut/Avoid</option></select>
                              <select className="input-field text-sm py-2 w-full" value={calendarTypeFilter} onChange={(e) => setCalendarTypeFilter(e.target.value as 'all' | 'historical' | 'active')}><option value="all">All Types</option><option value="historical">Historical</option><option value="active">Active</option></select>
                              <select className="input-field text-sm py-2 w-full" value={calendarConfidenceFilter} onChange={(e) => setCalendarConfidenceFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}><option value="all">All Confidence</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
                              <select className="input-field text-sm py-2 w-full" value={calendarBudgetFilter} onChange={(e) => setCalendarBudgetFilter(e.target.value as typeof calendarBudgetFilter)}><option value="all">All Budget Status</option><option value="complete">Complete</option><option value="partial">Partial</option><option value="missing">No Budget</option><option value="needs_attention">Needs Attention</option></select>
                            </div>
                            <button onClick={() => setCalendarFiltersOpen(false)} className="btn-primary w-full mt-4 text-sm">Apply Filters</button>
                          </div>
                        </div>
                      )}
                      {/* Desktop inline filters */}
                      {calendarFiltersOpen && (
                        <div className="hidden md:flex flex-wrap gap-2 mb-3">
                          <select className="input-field text-sm py-1.5" value={calendarRecommendationFilter} onChange={(e) => setCalendarRecommendationFilter(e.target.value)}><option value="all">All Recommendations</option><option value="attend_invest">Attend &amp; Invest</option><option value="attend_maintain">Attend &amp; Maintain</option><option value="reconsider">Reconsider Format</option><option value="evaluate">Evaluate</option><option value="cut_avoid">Cut/Avoid</option></select>
                          <select className="input-field text-sm py-1.5" value={calendarTypeFilter} onChange={(e) => setCalendarTypeFilter(e.target.value as 'all' | 'historical' | 'active')}><option value="all">All Types</option><option value="historical">Historical</option><option value="active">Active</option></select>
                          <select className="input-field text-sm py-1.5" value={calendarConfidenceFilter} onChange={(e) => setCalendarConfidenceFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}><option value="all">All Confidence</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
                          <select className="input-field text-sm py-1.5" value={calendarBudgetFilter} onChange={(e) => setCalendarBudgetFilter(e.target.value as typeof calendarBudgetFilter)}><option value="all">All Budget Status</option><option value="complete">Complete</option><option value="partial">Partial</option><option value="missing">No Budget</option><option value="needs_attention">Needs Attention</option></select>
                        </div>
                      )}
                    </>
                  );
                })()}

                {calendarRowsFiltered.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="font-medium text-gray-700">No conferences to score yet</p>
                    <p className="text-sm text-gray-400 mt-1">Upload historical conference lists or complete an active conference to generate calendar recommendations.</p>
                    <div className="mt-3 flex justify-center gap-2">
                      <button className="btn-secondary text-sm" onClick={() => router.push('/conferences/new?mode=historical')}>Upload historical conference →</button>
                      <button className="btn-secondary text-sm" onClick={() => router.push('/conferences')}>View conferences →</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="md:hidden space-y-2">
                      {calendarRowsFiltered.map((r) => {
                        const ti = calendarTierInfo(r.recommendationTier);
                        const isSelected = selectedCalendarRow?.conferenceId === r.conferenceId;
                        const isLoadingScore = calendarIsScoring && !calendarFullyScored.has(r.conferenceId);
                        const mobileDots = (
                          <div className="flex gap-0.5 items-center">
                            {[0, 1, 2].map(i => (
                              <span key={i} className="w-1 h-1 rounded-full bg-blue-200 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
                            ))}
                          </div>
                        );
                        return (
                          <div
                            key={r.conferenceId}
                            className={`rounded-xl border bg-white overflow-hidden cursor-pointer transition-colors ${isSelected ? 'border-brand-secondary ring-1 ring-brand-secondary' : 'border-gray-200 active:bg-gray-50'}`}
                            onClick={() => setSelectedCalendarRow(r)}
                          >
                            <div className="p-4">
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-base text-gray-900 leading-tight">{r.conferenceName}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">{r.conferenceYear} · {r.conferenceType === 'historical' ? 'Historical' : 'Active'} · {r.attendeeCount} attendees</p>
                                </div>
                                <div className="flex-shrink-0 text-right">
                                  {isLoadingScore ? mobileDots : (
                                    <>
                                      <span className="text-3xl font-bold leading-none tabular-nums" style={{ color: calendarScoreColor(r.calendarRecommendationScore) }}>{r.calendarRecommendationScore ?? '—'}</span>
                                      {r.calendarRecommendationScore != null && <span className="text-xs text-gray-400">/100</span>}
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {isLoadingScore ? mobileDots : (
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${ti.classes}`}>{ti.label}</span>
                                )}
                                {r.conferenceType !== 'historical' && (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <BudgetStatusCell row={r} onOpenModal={() => setBudgetModalConf({ id: r.conferenceId, name: r.conferenceName })} />
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="px-4 py-2 border-t border-gray-50 flex items-center gap-3">
                              {isLoadingScore ? mobileDots : (
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${confidencePillClasses(r.confidenceLevel)}`}>{r.confidenceLevel.charAt(0).toUpperCase() + r.confidenceLevel.slice(1)}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="p-2 cursor-pointer" onClick={() => setCalendarSort('conferenceName')}>Conference</th>
                            <th className="p-2 cursor-pointer" onClick={() => setCalendarSort('conferenceYear')}>Year</th>
                            <th className="p-2 cursor-pointer" onClick={() => setCalendarSort('conferenceType')}>Type</th>
                            <th className="p-2 cursor-pointer" onClick={() => setCalendarSort('attendeeCount')}>Attendees</th>
                            <th className="p-2 text-center cursor-pointer" onClick={() => setCalendarSort('icpCompanies')}>ICP Companies</th>
                            <th className="p-2 text-center">Budget Set?</th>
                            <th className="p-2 cursor-pointer" onClick={() => setCalendarSort('score' as keyof CalendarConferenceRow)}>List Score</th>
                            <th className="p-2 cursor-pointer" onClick={() => setCalendarSort('recommendationTier')}>Recommendation</th>
                            <th className="p-2 cursor-pointer" onClick={() => setCalendarSort('confidenceLevel')}>Confidence</th>
                            <th className="p-2">Your Input</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calendarRowsFiltered.map((r) => {
                            const tierInfo = calendarTierInfo(r.recommendationTier);
                            const isSelected = selectedCalendarRow?.conferenceId === r.conferenceId;
                            const isLoadingScore = calendarIsScoring && !calendarFullyScored.has(r.conferenceId);
                            const loadingDots = (
                              <div className="flex gap-0.5">
                                {[0, 1, 2].map(i => (
                                  <span key={i} className="w-1 h-1 rounded-full bg-blue-200 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
                                ))}
                              </div>
                            );
                            return (
                              <tr key={r.conferenceId} className={`border-t cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`} onClick={() => setSelectedCalendarRow(r)}>
                                <td className="p-2 text-brand-secondary font-medium">{r.conferenceName}</td>
                                <td className="p-2 text-gray-600">{r.conferenceYear}</td>
                                <td className="p-2 text-gray-600">{r.conferenceType === 'historical' ? 'Historical' : 'Active'}</td>
                                <td className="p-2 text-gray-600">{r.attendeeCount}</td>
                                <td className="p-2 text-center"><span title={`${r.icpCompanies} ICP / ${r.totalCompanies} total`} className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-xs font-semibold border ${icpDensityPillClasses(r.icpDensityPct)}`}>{r.icpDensityPct.toFixed(0)}%</span></td>
                                <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}><BudgetStatusCell row={r} onOpenModal={() => setBudgetModalConf({ id: r.conferenceId, name: r.conferenceName })} /></td>
                                <td className="p-2 font-semibold tabular-nums">
                                  {isLoadingScore ? loadingDots : (
                                    <span style={{ color: calendarScoreColor(r.calendarRecommendationScore) }}>
                                      {r.calendarRecommendationScore ?? <span className="text-gray-400 font-normal">—</span>}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2">
                                  {isLoadingScore ? loadingDots : (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${tierInfo.classes}`}>{tierInfo.label}</span>
                                  )}
                                </td>
                                <td className="p-2">
                                  {isLoadingScore ? loadingDots : (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${confidencePillClasses(r.confidenceLevel)}`}>{r.confidenceLevel.charAt(0).toUpperCase() + r.confidenceLevel.slice(1)}</span>
                                  )}
                                </td>
                                <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                  <YourInputCell
                                    conferenceId={r.conferenceId}
                                    decision={myInputStatus?.decisions[r.conferenceId] ?? null}
                                    hasPendingRequest={myInputStatus?.pendingConferenceIds.includes(r.conferenceId) ?? false}
                                    canEdit={
                                      !!(user?.capabilities?.record_input_without_invitation) ||
                                      (myInputStatus?.pendingConferenceIds.includes(r.conferenceId) ?? false)
                                    }
                                    onChanged={() => { bumpDecisionSync(); reloadMyInputStatus(); }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Input Board ───────────────────────────────────────────────── */}
      {activeTab === 'decisions' && (
        <DecisionsBoard
          onOpenDrawer={(confId) => { const r = calendarRows.find(x => x.conferenceId === confId); if (r) setSelectedCalendarRow(r); }}
          refreshKey={boardRefreshKey}
          scoredRows={calendarRows}
          selectedConferenceId={selectedBoardConferenceId}
          onSelectedConferenceChange={setSelectedBoardConferenceId}
          onConferencesLoaded={setBoardConferences}
        />
      )}

      {/* ── Score Drawer ───────────────────────────────────────────────────── */}
      {selectedCalendarRow && (
        <>
          {/* Mobile: bottom sheet (all breakpoints below md) */}
          <div className="md:hidden">
            <div className="fixed inset-0 z-50 bg-black/50" onClick={closeDrawer}>
              <div
                className="absolute bottom-0 left-0 right-0 max-h-[90vh] bg-white rounded-t-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                  <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>
                <div className="flex-1 overflow-y-auto hide-scrollbar">
                  <ScoreDrawerContent row={selectedCalendarRow} />
                  {pathToTierOpen && (
                    <div className="border-t border-gray-100">
                      <div className="p-5 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Gap Analysis</h3>
                        <button onClick={() => setPathToTierOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                      <PathToTier score={selectedCalendarRow} conferenceId={selectedCalendarRow.conferenceId} />
                    </div>
                  )}
                  {executionComparisonOpen && (
                    <div className="border-t border-gray-100">
                      <div className="p-5 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Execution Comparison</h3>
                        <button onClick={() => setExecutionComparisonOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                      <ExecutionComparison score={selectedCalendarRow} conferenceId={selectedCalendarRow.conferenceId} />
                    </div>
                  )}
                  {drawerExpanded && (
                    <div className="border-t border-gray-100 p-5">
                      <DecisionColumn row={selectedCalendarRow} syncKey={decisionSyncKey} onDecisionChanged={bumpDecisionSync} isAdmin={user?.role === 'administrator'} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: side panel or full-screen overlay */}
          <div className="hidden md:block">
            {drawerExpanded ? (
              // Full-screen overlay with tools
              <div className="fixed inset-0 z-50 flex bg-black/50" onClick={closeDrawer}>
                <div className="flex h-full w-full gap-3 p-3 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
                  <OverlayPanel className="w-[420px] flex-shrink-0">
                    <ScoreDrawerContent row={selectedCalendarRow} />
                  </OverlayPanel>
                  {pathToTierOpen && (
                    <OverlayPanel className="w-[420px] flex-shrink-0">
                      <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                        <h3 className="font-semibold text-gray-900">Gap Analysis</h3>
                        <button onClick={() => setPathToTierOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                      <PathToTier score={selectedCalendarRow} conferenceId={selectedCalendarRow.conferenceId} />
                    </OverlayPanel>
                  )}
                  {executionComparisonOpen && (
                    <OverlayPanel className="w-[420px] flex-shrink-0">
                      <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                        <h3 className="font-semibold text-gray-900">Execution Comparison</h3>
                        <button onClick={() => setExecutionComparisonOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                      <ExecutionComparison score={selectedCalendarRow} conferenceId={selectedCalendarRow.conferenceId} />
                    </OverlayPanel>
                  )}
                  <DecisionColumn row={selectedCalendarRow} syncKey={decisionSyncKey} onDecisionChanged={bumpDecisionSync} isAdmin={user?.role === 'administrator'} />
                </div>
              </div>
            ) : (
              // Normal right-panel drawer
              <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={closeDrawer}>
                <div
                  className="h-full w-full max-w-[560px] bg-white overflow-y-auto"
                  style={{ transform: 'translateX(0)', transition: 'transform 200ms ease-out', animation: 'slideInFromRight 200ms ease-out' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <style>{`@keyframes slideInFromRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
                  <ScoreDrawerContent row={selectedCalendarRow} />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Budget modal */}
      {budgetModalConf && (
        <BudgetVsActualModal
          conferenceId={budgetModalConf.id}
          conferenceName={budgetModalConf.name}
          onClose={() => setBudgetModalConf(null)}
          onSaved={async () => {
            const confId = budgetModalConf.id;
            setBudgetModalConf(null);
            void refreshConferenceScore(confId);
          }}
        />
      )}
    </div>
  );
}
