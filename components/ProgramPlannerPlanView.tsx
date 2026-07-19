'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RepAssignmentPopover, type AssignedRep } from './RepAssignmentPopover';
import { ConferencePlanBudgetModal } from './ConferencePlanBudgetModal';
import { useConfigWithIds } from '@/lib/useUserOptions';

interface BudgetLineItem { label: string; budgeted: number | null; actual: number | null }
interface PlannedLineItem { label: string; budgeted: number }
interface CategoryAverage { label: string; avgActual: number }

export interface PlanConferenceRow {
  conferenceId: number;
  name: string;
  startDate: string;
  ces: number | null;
  actualSpend: number | null;
  decision: string | null;
  plannedBudget: number | null;
  plannedBudgetLineItems: PlannedLineItem[];
  budgetLineItems: BudgetLineItem[] | null;
  assignedReps: AssignedRep[];
  strategyTypeId: number | null;
  strategyTypeName: string | null;
  planNotes: string | null;
}

interface CalIntelScore { score: number; tier: string; confidence: string }

interface ProgramPlannerPlanViewProps {
  year: number;
  conferences: PlanConferenceRow[];
  calIntelScores: Map<number, CalIntelScore>;
  categoryAverages: CategoryAverage[];
  onRepsUpdated: (conferenceId: number, assignedReps: AssignedRep[]) => void;
  onBudgetUpdated: (conferenceId: number, plannedBudget: number, lineItems: PlannedLineItem[]) => void;
  onStrategyUpdated: (conferenceId: number, strategyTypeId: number | null, strategyTypeName: string | null) => void;
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
  return '$' + Math.round(v).toLocaleString();
}

function fmtDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.toLocaleDateString('en-US', { month: 'short' })} '${String(d.getFullYear()).slice(-2)}`;
  } catch { return dateStr; }
}

function scoreDotStyle(score: number | null): { bg: string; color: string; border: string } {
  if (score == null) return { bg: '#F3F4F6', color: '#9CA3AF', border: '#D1D5DB' };
  if (score >= 70) return { bg: '#DCFCE7', color: '#059669', border: '#6EE7B7' };
  if (score >= 50) return { bg: '#DBEAFE', color: '#1B76BC', border: '#93C5FD' };
  if (score >= 40) return { bg: '#FEF3C7', color: '#d97706', border: '#FCD34D' };
  return { bg: '#FEE2E2', color: '#dc2626', border: '#FCA5A5' };
}

type GroupKey = 'attend' | 'reduce' | 'new' | 'evaluating' | 'cut';

const GROUP_CONFIG: Record<GroupKey, { label: string; icon: string; headerBg: string; headerText: string; pillBg: string; pillText: string }> = {
  attend:     { label: 'Attending',                     icon: 'ti-check',        headerBg: 'bg-green-50',  headerText: 'text-green-800',  pillBg: 'bg-green-100',  pillText: 'text-green-700' },
  reduce:     { label: 'Attending (reduced footprint)',  icon: 'ti-arrows-minimize', headerBg: 'bg-amber-50',  headerText: 'text-amber-800',  pillBg: 'bg-amber-100',  pillText: 'text-amber-700' },
  new:        { label: 'New — never attended',           icon: 'ti-sparkles',     headerBg: 'bg-purple-50', headerText: 'text-purple-800', pillBg: 'bg-purple-100', pillText: 'text-purple-700' },
  evaluating: { label: 'Evaluating',                      icon: 'ti-clock',        headerBg: 'bg-gray-100',  headerText: 'text-gray-700',   pillBg: 'bg-gray-200',   pillText: 'text-gray-600' },
  cut:        { label: 'Not attending',                   icon: 'ti-x',            headerBg: 'bg-red-50',    headerText: 'text-red-800',    pillBg: 'bg-red-100',    pillText: 'text-red-700' },
};

// Inline strategy editor — reads/writes conferences.conference_strategy_type_id via
// its own scoped PATCH route. Deliberately isolated from any other edit path for this
// field (e.g. the conference detail page's full form) so this table cell can't affect
// any other field on the conference.
function StrategyEditPill({
  conferenceId, strategyTypeId, strategyTypeName, onUpdated,
}: {
  conferenceId: number;
  strategyTypeId: number | null;
  strategyTypeName: string | null;
  onUpdated: (strategyTypeId: number | null, strategyTypeName: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const options = useConfigWithIds('conference_strategy_type');

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node) || dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openDropdown = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(true);
  };

  const select = async (id: number | null, name: string | null) => {
    setOpen(false);
    setSaving(true);
    onUpdated(id, name);
    try {
      await fetch(`/api/conferences/${conferenceId}/strategy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferenceStrategyTypeId: id }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openDropdown}
        disabled={saving}
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-opacity ${saving ? 'opacity-50' : ''} ${
          strategyTypeName
            ? 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
            : 'bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500'
        }`}
      >
        {strategyTypeName ?? '—'}
      </button>
      {open && pos && (
        <div
          ref={dropdownRef}
          className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-64 overflow-y-auto"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => select(o.id, o.value)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${o.id === strategyTypeId ? 'font-semibold text-blue-800' : 'text-gray-700'}`}
            >
              {o.value}
            </button>
          ))}
          <button
            type="button"
            onClick={() => select(null, null)}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100 mt-1"
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}

function ScoreDot({ score }: { score: number | null }) {
  const s = scoreDotStyle(score);
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border mx-auto"
      style={{ backgroundColor: s.bg, color: s.color, borderColor: s.border }}
    >
      {score != null ? Math.round(score) : '—'}
    </span>
  );
}

export function ProgramPlannerPlanView({
  year, conferences, calIntelScores, categoryAverages, onRepsUpdated, onBudgetUpdated, onStrategyUpdated,
}: ProgramPlannerPlanViewProps) {
  const [priorYearActual, setPriorYearActual] = useState<number | null>(null);
  const [budgetModalConf, setBudgetModalConf] = useState<PlanConferenceRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/program-planner/summary?year=${year - 1}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { totalActualSpend?: number } | null) => {
        if (!cancelled) setPriorYearActual(data?.totalActualSpend ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [year]);

  const groupOf = (c: PlanConferenceRow): GroupKey => {
    if (c.decision === 'reduce') return 'reduce';
    if (c.decision === 'cut') return 'cut';
    if (c.decision === 'attend') return c.ces == null && c.actualSpend == null ? 'new' : 'attend';
    return 'evaluating';
  };

  const groups: Record<GroupKey, PlanConferenceRow[]> = { attend: [], reduce: [], new: [], evaluating: [], cut: [] };
  for (const c of conferences) groups[groupOf(c)].push(c);

  // "Planned" = actually being attended in some form (full or reduced), matching the
  // Program Planner's own decision field rather than re-deriving intent elsewhere.
  const plannedConfs = [...groups.attend, ...groups.reduce, ...groups.new];
  const totalPlannedBudget = plannedConfs.reduce((sum, c) => sum + (c.plannedBudget ?? 0), 0);
  const totalReps = plannedConfs.reduce((sum, c) => sum + c.assignedReps.length, 0);
  const pipelineTarget = totalPlannedBudget * 3.5;

  const orderedGroups: GroupKey[] = ['attend', 'reduce', 'new', 'evaluating', 'cut'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Link
          href="/conferences/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-primary text-white hover:opacity-90 transition-opacity"
        >
          <i className="ti ti-plus text-[13px]" aria-hidden="true" />
          Add conference
        </Link>
      </div>

      {/* Summary stat strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Planned conferences</p>
          <p className="text-2xl font-bold text-brand-primary">{plannedConfs.length}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{groups.attend.length} returning · {groups.new.length} new · {groups.reduce.length} reduced</p>
        </div>
        <div className="card">
          <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Total planned budget</p>
          <p className="text-2xl font-bold text-brand-primary">{fmtCurrency(totalPlannedBudget)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {priorYearActual != null ? `vs ${fmtCurrency(priorYearActual)} actuals ${year - 1}` : ` `}
          </p>
        </div>
        <div className="card">
          <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Total headcount</p>
          <p className="text-2xl font-bold text-brand-primary">{totalReps} reps</p>
          <p className="text-[11px] text-gray-400 mt-0.5">across all planned conferences</p>
        </div>
        <div className="card">
          <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Pipeline target</p>
          <p className="text-2xl font-bold text-brand-primary">{fmtCurrency(pipelineTarget)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">3.5x planned spend</p>
        </div>
      </div>

      {/* Decision groups */}
      {orderedGroups.map(key => {
        const rows = groups[key];
        if (rows.length === 0) return null;
        const cfg = GROUP_CONFIG[key];
        const groupBudget = rows.reduce((sum, c) => sum + (c.plannedBudget ?? 0), 0);
        const groupReps = rows.reduce((sum, c) => sum + c.assignedReps.length, 0);
        const hasBudget = groupBudget > 0 || groupReps > 0;
        const dimRows = key === 'cut';

        return (
          <div key={key} className="card p-0 overflow-hidden">
            <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${cfg.headerBg}`}>
              <div className="flex items-center gap-2">
                <i className={`ti ${cfg.icon} text-[14px] ${cfg.headerText}`} aria-hidden="true" />
                <span className={`text-sm font-semibold ${cfg.headerText}`}>{cfg.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.pillBg} ${cfg.pillText}`}>
                  {rows.length} conference{rows.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span className={`text-[11px] font-medium ${cfg.headerText}`}>
                {hasBudget ? `${fmtCurrency(groupBudget)} planned · ${groupReps} rep${groupReps !== 1 ? 's' : ''}` : 'No budget committed'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className={`w-full text-xs border-collapse ${dimRows ? 'opacity-60' : ''}`}>
                <colgroup>
                  <col style={{ minWidth: 140 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ minWidth: 170 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 52 }} />
                  <col style={{ width: 52 }} />
                  <col style={{ width: 80 }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Conference</th>
                    <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Dates</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Strategy</th>
                    <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Budget</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Assigned reps</th>
                    <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Cal. Intel</th>
                    <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Prior CES</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c, i) => {
                    const ci = calIntelScores.get(c.conferenceId);
                    return (
                      <tr
                        key={c.conferenceId}
                        style={i % 2 === 1 ? { backgroundColor: 'var(--color-background-secondary, #F9FAFB)' } : {}}
                        className="hover:bg-blue-50/30 transition-colors"
                      >
                        <td className="px-3 py-2">
                          <Link href={`/conferences/${c.conferenceId}`} className="text-brand-secondary hover:text-brand-primary font-medium truncate max-w-[150px] block">
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">{fmtDateShort(c.startDate)}</td>
                        <td className="px-3 py-2">
                          <StrategyEditPill
                            conferenceId={c.conferenceId}
                            strategyTypeId={c.strategyTypeId}
                            strategyTypeName={c.strategyTypeName}
                            onUpdated={(id, name) => onStrategyUpdated(c.conferenceId, id, name)}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.plannedBudget != null ? (
                            <button
                              type="button"
                              onClick={() => setBudgetModalConf(c)}
                              className="text-gray-700 font-medium tabular-nums hover:text-brand-primary transition-colors"
                            >
                              {fmtCurrency(c.plannedBudget)}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setBudgetModalConf(c)}
                              className="text-brand-secondary hover:text-brand-primary text-[11px] font-medium whitespace-nowrap"
                            >
                              + Budget
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2" style={{ position: 'relative', overflow: 'visible' }}>
                          <RepAssignmentPopover
                            conferenceId={c.conferenceId}
                            planYear={year}
                            assignedReps={c.assignedReps}
                            allConferences={conferences}
                            onUpdate={reps => onRepsUpdated(c.conferenceId, reps)}
                          />
                        </td>
                        <td className="px-3 py-2 text-center"><ScoreDot score={ci?.score ?? null} /></td>
                        <td className="px-3 py-2 text-center"><ScoreDot score={c.ces} /></td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[80px]">{c.planNotes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {budgetModalConf && (
        <ConferencePlanBudgetModal
          conferenceId={budgetModalConf.conferenceId}
          conferenceName={budgetModalConf.name}
          year={year}
          actualLineItems={budgetModalConf.budgetLineItems}
          plannedLineItems={budgetModalConf.plannedBudgetLineItems}
          categoryAverages={categoryAverages}
          onClose={() => setBudgetModalConf(null)}
          onSaved={(plannedBudget, lineItems) => onBudgetUpdated(budgetModalConf.conferenceId, plannedBudget, lineItems)}
        />
      )}
    </div>
  );
}
