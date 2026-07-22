'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { RepAssignmentPopover, type AssignedRep } from './RepAssignmentPopover';
import { ConferencePlanBudgetModal } from './ConferencePlanBudgetModal';
import { AddConferenceModal } from './AddConferenceModal';
import { LocationAutocompleteInput, type LocationDetails } from './LocationAutocompleteInput';
import { useConfigWithIds } from '@/lib/useUserOptions';
import { ConferencePlanLogisticsDrawer } from './logistics';
import { getPreset } from '@/lib/colors';
import { CalendarIntelligenceDrawer } from './CalendarIntelligenceDrawer';
import { ColumnMappingModal } from './ColumnMappingModal';
import type { ColumnMapping } from '@/lib/columnMapping';

interface BudgetLineItem { label: string; budgeted: number | null; actual: number | null }
interface PlannedLineItem { label: string; budgeted: number }
interface CategoryAverage { label: string; avgActual: number }

interface PlanMeta {
  plannedBudget: number | null;
  plannedBudgetLineItems: PlannedLineItem[];
  assignedReps: AssignedRep[];
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  listScore: number | null;
  listScoreTier: string | null;
  listScoreConfidence: string | null;
}

export interface PlanConferenceRow {
  conferenceId: number;
  name: string;
  startDate: string;
  endDate: string;
  ces: number | null;
  actualSpend: number | null;
  budgetLineItems: BudgetLineItem[] | null;
  decision: string | null;
  strategyTypeId: number | null;
  strategyTypeName: string | null;
  conferenceType: string | null;
  sponsorshipLevel: string | null;
  location: string | null;
  boothPresent: boolean;
  boothWidth: number | null;
  boothLength: number | null;
  boothNumber: string | null;
  boothHall: string | null;
  territoryScope: string | null;
  territoryIds: number[];
  committedToProgram: boolean;
  plan: PlanMeta;
}

interface ProgramPlannerPlanViewProps {
  year: number;
  conferences: PlanConferenceRow[];
  categoryAverages: CategoryAverage[];
  // Scores already computed for historical/attended conferences by the Program
  // tab's shared Calendar Intelligence store — pulled over as-is here so a
  // conference that's already been scored from real attendee history never
  // shows the "+" upload prompt. Only conferences absent from this map (i.e.
  // never attended, no real history yet) fall back to conference_plans'
  // uploaded-list score, or the empty "+" state if neither exists.
  calIntelScores: Map<number, { score: number; tier: string; confidence: string }>;
  onDecisionUpdated: (conferenceId: number, decision: 'attend' | 'reduce' | 'cut' | 'evaluating' | 'new' | null) => void;
  onRepsUpdated: (conferenceId: number, assignedReps: AssignedRep[]) => void;
  onBudgetUpdated: (conferenceId: number, plannedBudget: number, lineItems: PlannedLineItem[]) => void;
  onStrategyUpdated: (conferenceId: number, strategyTypeId: number | null, strategyTypeName: string | null) => void;
  onDatesUpdated: (conferenceId: number, plannedStartDate: string | null, plannedEndDate: string | null) => void;
  onListScoreUpdated: (conferenceId: number, listScore: number | null, listScoreTier: string | null, listScoreConfidence: string | null) => void;
  onTypeUpdated: (conferenceId: number, conferenceType: string | null) => void;
  onSponsorshipUpdated: (conferenceId: number, sponsorshipLevel: string | null) => void;
  onBoothUpdated: (conferenceId: number, booth: { boothPresent: boolean; boothWidth: number | null; boothLength: number | null; boothNumber: string | null; boothHall: string | null }) => void;
  onLocationUpdated: (conferenceId: number, location: string) => void;
  onTerritoryUpdated: (conferenceId: number, territoryScope: string | null, territoryIds: number[]) => void;
  onConferenceCommitted: (conferenceId: number, startDate: string, endDate: string) => void;
  onConferenceCreated: () => void;
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
  return '$' + Math.round(v).toLocaleString();
}

function fmtCurrencyFull(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function fmtDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.toLocaleDateString('en-US', { month: 'short' })} '${String(d.getFullYear()).slice(-2)}`;
  } catch { return dateStr; }
}

type GroupKey = 'attend' | 'reduce' | 'new' | 'evaluating' | 'cut';
type GroupMode = 'status' | 'rep' | 'territory' | 'strategy' | 'type' | 'date';
const ORDERED_GROUPS: GroupKey[] = ['evaluating', 'attend', 'reduce', 'new', 'cut'];
const GROUP_TO_DECISION: Record<GroupKey, GroupKey> = {
  attend: 'attend', reduce: 'reduce', new: 'new', evaluating: 'evaluating', cut: 'cut',
};

const GROUP_CONFIG: Record<GroupKey, { label: string; icon: string; headerBg: string; headerText: string; pillBg: string; pillText: string }> = {
  attend:     { label: 'Attending',                     icon: 'ti-check',        headerBg: 'bg-green-50',  headerText: 'text-green-800',  pillBg: 'bg-green-100',  pillText: 'text-green-700' },
  reduce:     { label: 'Attending (reduced footprint)',  icon: 'ti-arrows-minimize', headerBg: 'bg-amber-50',  headerText: 'text-amber-800',  pillBg: 'bg-amber-100',  pillText: 'text-amber-700' },
  new:        { label: 'New (Evaluating)',                  icon: 'ti-sparkles',  headerBg: 'bg-purple-50', headerText: 'text-purple-800', pillBg: 'bg-purple-100', pillText: 'text-purple-700' },
  evaluating: { label: 'Evaluating',                      icon: 'ti-clock',        headerBg: 'bg-gray-100',  headerText: 'text-gray-700',   pillBg: 'bg-gray-200',   pillText: 'text-gray-600' },
  cut:        { label: 'Not attending',                   icon: 'ti-x',            headerBg: 'bg-red-50',    headerText: 'text-red-800',    pillBg: 'bg-red-100',    pillText: 'text-red-700' },
};

// Shortened display text for conference strategy pills/columns — the
// underlying stored value (and grouping key) is left untouched, only what's
// rendered in the table/Kanban views is abbreviated.
const STRATEGY_ABBREVIATIONS: Record<string, string> = {
  'Customer Retention / Customer Nurture': 'Customer Nurture',
  'Customer Retention': 'Customer Nurture',
  'Customer Nurture': 'Customer Nurture',
  'Market Presence / Brand Visiblity': 'Brand Visibility',
  'Market Presence / Brand Visibility': 'Brand Visibility',
  'Market Presence': 'Brand Visibility',
  'Brand Visiblity': 'Brand Visibility',
  'Brand Visibility': 'Brand Visibility',
  'Strategic Account Relationship Building': 'Relationship Dev.',
  'Partner / Ecosystem Development': 'Partnership Dev.',
};
function abbreviateStrategy(name: string): string {
  return STRATEGY_ABBREVIATIONS[name] ?? name;
}

// Territory column abbreviation: two-or-more-word names use the first letter
// of each of the first two words (e.g. "Great Lakes" -> "GL"). One-word names
// normally use just their first letter (e.g. "West" -> "W"), except compound
// direction names like "Southeast"/"Northwest" where "east"/"west" appears
// after a prefix — those use the prefix's first letter + E/W (e.g.
// "Southeast" -> "SE", "Northwest" -> "NW").
function abbreviateTerritory(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const word = words[0];
  const lower = word.toLowerCase();
  const eastIdx = lower.indexOf('east');
  const westIdx = lower.indexOf('west');
  if (eastIdx > 0) return (word[0] + 'E').toUpperCase();
  if (westIdx > 0) return (word[0] + 'W').toUpperCase();
  return word[0].toUpperCase();
}

const CONFERENCE_TYPE_OPTIONS = [
  'Trade show', 'User conference', 'Executive summit', 'Hosted dinner / private event',
  'Roundtable', 'Field event', 'Industry association conference', 'Analyst conference',
  'Partner / ecosystem event', 'Other',
];

// Shared viewport-aware positioning for the click-to-edit dropdowns (Strategy, Type,
// Sponsorship) — flips to open upward when there isn't enough room below, same
// approach as RepMultiSelect's calcPos.
type DropdownPos = { top?: number; bottom?: number; left: number; above: boolean };
const DROPDOWN_EST_HEIGHT = 260;
function calcDropdownPos(el: HTMLElement): DropdownPos {
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const above = spaceBelow < DROPDOWN_EST_HEIGHT && rect.top > spaceBelow;
  return {
    top: above ? undefined : rect.bottom + 4,
    bottom: above ? window.innerHeight - rect.top + 4 : undefined,
    left: rect.left,
    above,
  };
}
function dropdownStyle(pos: DropdownPos): CSSProperties {
  return { position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, zIndex: 9999 };
}

// Same viewport-aware flip-up logic as calcDropdownPos, sized for the small
// click/hover-to-reveal label tooltips (status icon, territory chip, rep
// assignment warning) instead of a full dropdown menu — these previously used
// plain `absolute` positioning, which a section/card's `overflow-hidden`
// wrapper clips whenever the tooltip would otherwise overflow it.
type TooltipPos = { top?: number; bottom?: number; left: number };
const TOOLTIP_EST_HEIGHT = 40;
// center=true (the default) returns the trigger's horizontal center, meant to
// be paired with a `-translate-x-1/2` on the tooltip; pass false for a
// tooltip that aligns to the trigger's left edge instead.
function calcTooltipPos(el: HTMLElement, center = true): TooltipPos {
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const above = spaceBelow < TOOLTIP_EST_HEIGHT + 8 && rect.top > spaceBelow;
  return {
    top: above ? undefined : rect.bottom + 4,
    bottom: above ? window.innerHeight - rect.top + 4 : undefined,
    left: center ? rect.left + rect.width / 2 : rect.left,
  };
}

function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" className="text-gray-300">
      <circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" />
      <circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" />
      <circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" />
    </svg>
  );
}

function TableViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.5" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={2} d="M3 10h18M9 4v16" />
    </svg>
  );
}

function KanbanViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="5" height="16" rx="1" strokeWidth={2} />
      <rect x="9.5" y="4" width="5" height="10" rx="1" strokeWidth={2} />
      <rect x="16" y="4" width="5" height="13" rx="1" strokeWidth={2} />
    </svg>
  );
}

function StatusViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RepViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function TerritoryViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function StrategyViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
      <circle cx="12" cy="12" r="5" strokeWidth={2} />
      <circle cx="12" cy="12" r="1" strokeWidth={2} />
    </svg>
  );
}

function TypeViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 9V4a1 1 0 011-1z" />
    </svg>
  );
}

function DateViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// Flags a conference sitting in the "New — never attended (Evaluating)" bucket.
function NewBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-100 flex-shrink-0"
      title="New — never attended, still evaluating"
    >
      <svg className="w-2.5 h-2.5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 1l2.6 6.2L19 8.3l-4.9 4.3L15.5 19 10 15.6 4.5 19l1.4-6.4L1 8.3l6.4-1.1L10 1z" />
      </svg>
    </span>
  );
}

const STATUS_CIRCLE_CONFIG: Record<GroupKey, { label: string; bg: string; iconColor: string; icon: 'check' | 'question' | 'x' }> = {
  attend:     { label: 'Attending', bg: 'bg-green-100', iconColor: 'text-green-600', icon: 'check' },
  reduce:     { label: 'Attending (Reduced)', bg: 'bg-yellow-100', iconColor: 'text-yellow-700', icon: 'check' },
  new:        { label: 'New (Evaluating)', bg: 'bg-purple-100', iconColor: 'text-purple-700', icon: 'question' },
  evaluating: { label: 'Evaluating', bg: 'bg-gray-100', iconColor: 'text-gray-600', icon: 'question' },
  cut:        { label: 'Not Attending', bg: 'bg-red-100', iconColor: 'text-red-600', icon: 'x' },
};

// Circular icon replacement for the text status pill shown in any grouping
// other than Status — hover shows the full label (native title, desktop);
// click toggles the same label in a small tooltip (mobile, no hover).
function StatusCircleBadge({ decision }: { decision: string | null }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const key: GroupKey = decision === 'attend' || decision === 'reduce' || decision === 'new' || decision === 'cut' ? decision : 'evaluating';
  const cfg = STATUS_CIRCLE_CONFIG[key];

  return (
    <div ref={ref} className="relative inline-flex flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { if (buttonRef.current) setPos(calcTooltipPos(buttonRef.current)); setOpen(o => !o); }}
        title={cfg.label}
        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bg}`}
      >
        {cfg.icon === 'check' && (
          <svg className={`w-3 h-3 ${cfg.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {cfg.icon === 'x' && (
          <svg className={`w-3 h-3 ${cfg.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {cfg.icon === 'question' && (
          <span className={`text-[11px] font-extrabold leading-none ${cfg.iconColor}`}>?</span>
        )}
      </button>
      {open && pos && (
        <div className="fixed z-[9999] -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-[11px] rounded-md shadow-lg px-2 py-1" style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}>
          {cfg.label}
        </div>
      )}
    </div>
  );
}

function listScoreColor(score: number | null): string {
  if (score == null) return '#9ca3af';
  if (score >= 85) return '#059669';
  if (score >= 70) return '#0d9488';
  if (score >= 55) return '#d97706';
  if (score >= 40) return '#f97316';
  return '#dc2626';
}

// The Plan tab's "List Score" column — circular to match the Cal Intel score
// shape. Unscored conferences show a plus-only circle (same dashed, clickable
// empty-state convention as the other "Set [x]" columns) that opens an upload
// prompt; scored conferences show the numeric score and open the same Cal
// Intel drawer used in the Program tab (with Gap Analysis/Execution hidden).
function ListScoreBadge({ size, score, onUpload, onOpenScore }: {
  size: number; score: number | null; onUpload: () => void; onOpenScore: () => void;
}) {
  if (score == null) {
    return (
      <button
        type="button"
        onClick={onUpload}
        title="Upload a list to evaluate this conference"
        style={{ width: size, height: size }}
        className="inline-flex items-center justify-center rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-secondary hover:text-brand-secondary transition-colors flex-shrink-0"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    );
  }
  const color = listScoreColor(score);
  return (
    <button
      type="button"
      onClick={onOpenScore}
      title={`List Score: ${score}/100`}
      style={{ width: size, height: size, backgroundColor: color + '18', border: `1.5px solid ${color}` }}
      className="inline-flex items-center justify-center rounded-full flex-shrink-0 hover:brightness-95 transition-all"
    >
      <span style={{ color, fontSize: size >= 32 ? 12 : 10 }} className="font-bold tabular-nums leading-none">{score}</span>
    </button>
  );
}

// Single circular abbreviated-territory pill — full-color border, lighter
// tint fill. National uses brand-primary instead of a territory color since
// it isn't any one territory. Hover shows the full name (native title,
// desktop); click toggles the same name in a small tooltip (mobile).
function TerritoryChip({ label, name, color, bg }: { label: string; name: string; color: string; bg: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { if (buttonRef.current) setPos(calcTooltipPos(buttonRef.current)); setOpen(o => !o); }}
        title={name}
        style={{ width: 24, height: 24, border: `1.5px solid ${color}`, backgroundColor: bg, color }}
        className="inline-flex items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
      >
        {label}
      </button>
      {open && pos && (
        <div className="fixed z-[9999] -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-[11px] rounded-md shadow-lg px-2 py-1" style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}>
          {name}
        </div>
      )}
    </div>
  );
}

// The Plan tab's Territory column — Regional conferences show one chip per
// assigned territory (abbreviated, colored to match that territory); National
// shows a single "NT" chip in brand-primary since it isn't tied to any one
// territory.
function TerritoryCell({ scope, territoryIds, territoryOptions }: {
  scope: string | null;
  territoryIds: number[];
  territoryOptions: Array<{ id: number; name: string; color: string }>;
}) {
  if (scope === 'national') {
    return (
      <div className="flex items-center justify-center">
        <TerritoryChip
          label="NT"
          name="National"
          color="rgb(var(--brand-primary-rgb))"
          bg="rgb(var(--brand-primary-rgb) / 0.12)"
        />
      </div>
    );
  }
  const matched = scope === 'regional' ? territoryOptions.filter(t => territoryIds.includes(t.id)) : [];
  if (matched.length === 0) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex items-center justify-center flex-wrap gap-1">
      {matched.map(t => (
        <TerritoryChip key={t.id} label={abbreviateTerritory(t.name)} name={t.name} color={t.color} bg={t.color + '18'} />
      ))}
    </div>
  );
}

// Click-to-edit wrapper around TerritoryCell — opens a popup to pick Market
// Coverage (National/Regional) and, for Regional, one or more territories.
// Each pick persists immediately (same pattern as the other edit pills), so
// there's no separate Save step; "Done" just closes the popup.
function TerritoryEditCell({ conferenceId, territoryScope, territoryIds, territoryOptions, onUpdated }: {
  conferenceId: number;
  territoryScope: string | null;
  territoryIds: number[];
  territoryOptions: Array<{ id: number; name: string; color: string }>;
  onUpdated: (territoryScope: string | null, territoryIds: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    if (buttonRef.current) setPos(calcDropdownPos(buttonRef.current));
    setOpen(true);
  };

  const persist = async (scope: 'national' | 'regional' | null, ids: number[]) => {
    setSaving(true);
    onUpdated(scope, ids);
    try {
      await fetch(`/api/conferences/${conferenceId}/territory`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ territoryScope: scope, territoryIds: ids }),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleTerritory = (id: number) => {
    const next = territoryIds.includes(id) ? territoryIds.filter(x => x !== id) : [...territoryIds, id];
    persist('regional', next);
  };

  return (
    <>
      <button ref={buttonRef} type="button" onClick={openDropdown} disabled={saving} className={`inline-flex ${saving ? 'opacity-50' : ''}`}>
        {territoryScope ? (
          <TerritoryCell scope={territoryScope} territoryIds={territoryIds} territoryOptions={territoryOptions} />
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500 transition-colors">
            Set Territory
          </span>
        )}
      </button>
      {open && pos && (
        <div ref={dropdownRef} className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-60" style={dropdownStyle(pos)}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Market Coverage</p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => persist('national', [])}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                territoryScope === 'national' ? 'bg-brand-primary text-white border-brand-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              National
            </button>
            <button
              type="button"
              onClick={() => persist('regional', territoryIds)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                territoryScope === 'regional' ? 'bg-brand-primary text-white border-brand-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              Regional
            </button>
          </div>
          {territoryScope === 'regional' && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Select Territories</p>
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {territoryOptions.length === 0 && <p className="text-xs text-gray-400 px-1.5 py-1">No territories configured.</p>}
                {territoryOptions.map(t => (
                  <label key={t.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={territoryIds.includes(t.id)} onChange={() => toggleTerritory(t.id)} className="accent-brand-secondary" />
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="text-xs text-gray-700">{t.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => { persist(null, []); setOpen(false); }}
              disabled={!territoryScope}
              className="px-2 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// The Plan table's Commit column (table view only — a Kanban card has no
// equivalent row of columns to append to). Only ever renders something for
// conferences the user has actually decided to attend; every other decision
// leaves the cell blank since "committing" only makes sense once you're
// going. Promotes the conference from a Plan-tab-only draft (no Conference
// Details profile, invisible to Go To Conference / the Conferences list)
// into a real, committed conference via POST .../commit — which requires
// planned dates to already be set, since those become the new profile's
// start/end date.
function CommitCell({ conferenceId, conferenceName, decision, plannedStartDate, planYear, committedToProgram, onCommitted }: {
  conferenceId: number;
  conferenceName: string;
  decision: string | null;
  plannedStartDate: string | null;
  planYear: number;
  committedToProgram: boolean;
  onCommitted: (startDate: string, endDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node) || popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (decision !== 'attend' && decision !== 'reduce') return null;

  if (committedToProgram) {
    return (
      <span
        title="Added to program"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 border border-green-300 flex-shrink-0"
      >
        <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }

  const openPopover = () => {
    if (buttonRef.current) setPos(calcDropdownPos(buttonRef.current));
    setOpen(true);
  };

  const confirm = async () => {
    if (!plannedStartDate) {
      toast.error('Set conference dates before adding this conference to your program.');
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planYear }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to add to program');
      }
      const result = await res.json();
      onCommitted(result.startDate, result.endDate);
      toast.success(`${conferenceName} added to your ${planYear} program.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add to program');
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openPopover}
        disabled={saving}
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap bg-brand-primary/10 text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/20 transition-colors disabled:opacity-50"
      >
        + to Program
      </button>
      {open && pos && (
        <div ref={popoverRef} className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64" style={dropdownStyle(pos)}>
          <p className="text-sm text-gray-700 mb-3">
            Add <span className="font-semibold">{conferenceName}</span> to your {planYear} Program?
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={saving}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-brand-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Shown in By Rep grouping next to a conference that landed in this rep's
// column via territory auto-placement rather than an actual rep assignment —
// click reveals why it's here instead of silently implying the rep is
// formally on the hook for it.
function RepAssignmentWarning({ repName, conferenceName, scopeLabel }: {
  repName: string; conferenceName: string; scopeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { if (buttonRef.current) setPos(calcTooltipPos(buttonRef.current, false)); setOpen(o => !o); }}
        className="w-5 h-5 flex items-center justify-center rounded-full bg-amber-50 text-amber-500 hover:bg-amber-100 transition-colors flex-shrink-0"
        title="Not formally assigned"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </button>
      {open && pos && (
        <div
          className="fixed z-[9999] w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2 leading-snug"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
          onClick={e => e.stopPropagation()}
        >
          {repName} has not been formally assigned to {conferenceName}. This is a {scopeLabel} conference that has been designated in their territory.
        </div>
      )}
    </div>
  );
}

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
  const [pos, setPos] = useState<DropdownPos | null>(null);
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
    if (buttonRef.current) setPos(calcDropdownPos(buttonRef.current));
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
        {strategyTypeName ? abbreviateStrategy(strategyTypeName) : 'Set strategy'}
      </button>
      {open && pos && (
        <div
          ref={dropdownRef}
          className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-max max-w-[320px] max-h-64 overflow-y-auto"
          style={dropdownStyle(pos)}
        >
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => select(o.id, o.value)}
              className={`w-full text-left px-3 py-1.5 text-xs whitespace-nowrap hover:bg-gray-50 ${o.id === strategyTypeId ? 'font-semibold text-blue-800' : 'text-gray-700'}`}
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

// Generic click-to-edit dropdown pill, shared by Type and Sponsorship — both are a
// flat list of string options mapped onto a single scoped conferences.* column.
function OptionEditPill({
  value, options, activeClass, placeholder, onSelect, colorFor,
}: {
  value: string | null;
  options: string[];
  activeClass: string;
  placeholder: string;
  onSelect: (value: string | null) => Promise<void>;
  // Optional per-value hex color — when the current value has one, it's
  // rendered as a full-color border with a lightly tinted fill in that same
  // color, overriding `activeClass`'s fixed color.
  colorFor?: (value: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    if (buttonRef.current) setPos(calcDropdownPos(buttonRef.current));
    setOpen(true);
  };

  const select = async (v: string | null) => {
    setOpen(false);
    setSaving(true);
    try { await onSelect(v); } finally { setSaving(false); }
  };

  const color = value ? colorFor?.(value) ?? null : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openDropdown}
        disabled={saving}
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-opacity ${saving ? 'opacity-50' : ''} ${
          color ? 'border' : value ? activeClass : 'bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500'
        }`}
        style={color ? { borderColor: color, backgroundColor: `${color}26`, color } : undefined}
      >
        {value ?? placeholder}
      </button>
      {open && pos && (
        <div
          ref={dropdownRef}
          className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-max max-w-[240px] max-h-64 overflow-y-auto"
          style={dropdownStyle(pos)}
        >
          {options.map(o => (
            <button
              key={o}
              type="button"
              onClick={() => select(o)}
              className={`w-full text-left px-3 py-1.5 text-xs whitespace-nowrap hover:bg-gray-50 ${o === value ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
            >
              {o}
            </button>
          ))}
          <button
            type="button"
            onClick={() => select(null)}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100 mt-1"
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}

function BoothEditPopover({
  conferenceId, boothPresent, boothWidth, boothLength, boothNumber, boothHall, onUpdated,
}: {
  conferenceId: number;
  boothPresent: boolean;
  boothWidth: number | null;
  boothLength: number | null;
  boothNumber: string | null;
  boothHall: string | null;
  onUpdated: (booth: { boothPresent: boolean; boothWidth: number | null; boothLength: number | null; boothNumber: string | null; boothHall: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [present, setPresent] = useState(boothPresent);
  const [width, setWidth] = useState(boothWidth != null ? String(boothWidth) : '');
  const [length, setLength] = useState(boothLength != null ? String(boothLength) : '');
  const [number, setNumber] = useState(boothNumber ?? '');
  const [hall, setHall] = useState(boothHall ?? '');
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node) || popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openPopover = () => {
    setPresent(boothPresent);
    setWidth(boothWidth != null ? String(boothWidth) : '');
    setLength(boothLength != null ? String(boothLength) : '');
    setNumber(boothNumber ?? '');
    setHall(boothHall ?? '');
    if (buttonRef.current) setPos(calcDropdownPos(buttonRef.current));
    setOpen(true);
  };

  const save = async () => {
    setOpen(false);
    setSaving(true);
    const booth = {
      boothPresent: present,
      boothWidth: present && width ? Number(width) : null,
      boothLength: present && length ? Number(length) : null,
      boothNumber: present && number ? number : null,
      boothHall: present && hall ? hall : null,
    };
    onUpdated(booth);
    try {
      await fetch(`/api/conferences/${conferenceId}/booth`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(booth),
      });
    } finally {
      setSaving(false);
    }
  };

  const dims = boothWidth != null || boothLength != null ? ` · ${boothWidth ?? '?'}×${boothLength ?? '?'} ft` : '';
  const label = boothPresent ? `Booth${boothNumber ? ` #${boothNumber}` : ''}${dims}` : 'No Booth';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openPopover}
        disabled={saving}
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-opacity ${saving ? 'opacity-50' : ''} ${
          boothPresent ? 'bg-purple-50 text-purple-800 border border-purple-300 hover:bg-purple-100' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        {label}
      </button>
      {open && pos && (
        <div
          ref={popoverRef}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-3"
          style={{ ...dropdownStyle(pos), width: 260 }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={present}
              onClick={() => setPresent(v => !v)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${present ? 'bg-brand-secondary' : 'bg-gray-200'}`}
            >
              <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform" style={{ transform: present ? 'translateX(18px)' : 'translateX(4px)' }} />
            </button>
            <span className="text-xs text-gray-700">{present ? 'We have a booth' : 'No booth'}</span>
          </div>
          {present && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">Length (ft)</label>
                <input type="number" min="1" value={length} onChange={e => setLength(e.target.value)} className="input-field text-xs w-full" placeholder="10" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">Width (ft)</label>
                <input type="number" min="1" value={width} onChange={e => setWidth(e.target.value)} className="input-field text-xs w-full" placeholder="10" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">Booth #</label>
                <input type="text" value={number} onChange={e => setNumber(e.target.value)} className="input-field text-xs w-full" placeholder="412" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">Hall</label>
                <input type="text" value={hall} onChange={e => setHall(e.target.value)} className="input-field text-xs w-full" placeholder="Hall B" />
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={save} className="btn-primary text-[11px] px-2.5 py-1">Save</button>
          </div>
        </div>
      )}
    </>
  );
}

function LocationEditCell({ conferenceId, location, onUpdated }: {
  conferenceId: number;
  location: string | null;
  onUpdated: (location: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [value, setValue] = useState(location ?? '');
  const [details, setDetails] = useState<LocationDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node) || popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openPopover = () => {
    setValue(location ?? '');
    setDetails(null);
    if (buttonRef.current) setPos(calcDropdownPos(buttonRef.current));
    setOpen(true);
  };

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) { setOpen(false); return; }
    setOpen(false);
    setSaving(true);
    onUpdated(trimmed);
    try {
      await fetch(`/api/conferences/${conferenceId}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: trimmed,
          ...(details && details.formatted_address === trimmed ? {
            locationPlaceId: details.place_id,
            locationLat: details.lat,
            locationLng: details.lng,
            locationCity: details.city,
            locationState: details.state,
            locationCountry: details.country,
            locationTimezone: details.timezone,
          } : {}),
        }),
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
        onClick={openPopover}
        disabled={saving}
        className={`text-[11px] text-left truncate max-w-[110px] transition-opacity ${saving ? 'opacity-50' : ''} ${location ? 'text-gray-600 hover:text-brand-primary' : 'text-gray-400 hover:text-brand-secondary'}`}
      >
        {location || 'Set location'}
      </button>
      {open && pos && (
        <div
          ref={popoverRef}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2"
          style={{ ...dropdownStyle(pos), width: 280 }}
        >
          <LocationAutocompleteInput
            value={value}
            onChange={setValue}
            onSelect={setDetails}
            placeholder="e.g., Las Vegas Convention Center, NV"
          />
          <div className="flex justify-end">
            <button type="button" onClick={save} className="btn-primary text-[11px] px-2.5 py-1">Save</button>
          </div>
        </div>
      )}
    </>
  );
}

// Inline dates editor — writes conference_plans.planned_start_date/planned_end_date
// for the selected plan year, distinct from conferences.start_date/end_date (this
// year's actual dates, which stay the fallback until the user sets next year's own).
function DatesEditCell({
  conferenceId, planYear, displayStartDate, plannedStartDate, plannedEndDate, fallbackStartDate, fallbackEndDate, onUpdated,
}: {
  conferenceId: number;
  planYear: number;
  displayStartDate: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  fallbackStartDate: string;
  fallbackEndDate: string;
  onUpdated: (plannedStartDate: string | null, plannedEndDate: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [start, setStart] = useState(plannedStartDate ?? '');
  const [end, setEnd] = useState(plannedEndDate ?? '');
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node) || popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openPopover = () => {
    setStart(plannedStartDate ?? '');
    setEnd(plannedEndDate ?? '');
    if (buttonRef.current) setPos(calcDropdownPos(buttonRef.current));
    setOpen(true);
  };

  const save = async (newStart: string | null, newEnd: string | null) => {
    setOpen(false);
    setSaving(true);
    onUpdated(newStart, newEnd);
    try {
      await fetch(`/api/program-planner/conferences/${conferenceId}/dates?year=${planYear}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedStartDate: newStart, plannedEndDate: newEnd }),
      });
    } finally {
      setSaving(false);
    }
  };

  const isOverridden = plannedStartDate != null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openPopover}
        disabled={saving}
        className={`whitespace-nowrap transition-opacity ${saving ? 'opacity-50' : ''} ${
          isOverridden
            ? 'text-[11px] text-gray-700 font-medium hover:text-brand-primary'
            : 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500 transition-colors'
        }`}
      >
        {displayStartDate ? fmtDateShort(displayStartDate) : 'Set dates'}
      </button>
      {open && pos && (
        <div
          ref={popoverRef}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2"
          style={{ ...dropdownStyle(pos), width: 200 }}
        >
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">FY{planYear} dates</p>
          <div className="space-y-1.5">
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Start</label>
              <input
                type="date"
                value={start}
                onChange={e => {
                  const newStart = e.target.value;
                  setStart(newStart);
                  if (newStart) {
                    const d = new Date(newStart + 'T00:00:00');
                    d.setDate(d.getDate() + 3);
                    setEnd(d.toISOString().slice(0, 10));
                  }
                }}
                className="input-field text-xs w-full"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">End</label>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="input-field text-xs w-full" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            {isOverridden ? (
              <button type="button" onClick={() => save(null, null)} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">
                Clear
              </button>
            ) : <span />}
            <button type="button" onClick={() => save(start || null, end || null)} className="btn-primary text-[11px] px-2.5 py-1">
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ProgramPlannerPlanView({
  year, conferences, categoryAverages, calIntelScores,
  onDecisionUpdated, onRepsUpdated, onBudgetUpdated, onStrategyUpdated, onDatesUpdated, onListScoreUpdated,
  onTypeUpdated, onSponsorshipUpdated, onBoothUpdated, onLocationUpdated, onTerritoryUpdated, onConferenceCommitted, onConferenceCreated,
}: ProgramPlannerPlanViewProps) {
  const [priorYearActual, setPriorYearActual] = useState<number | null>(null);
  const [budgetModalConf, setBudgetModalConf] = useState<PlanConferenceRow | null>(null);
  const [calDrawer, setCalDrawer] = useState<{ conferenceId: number; conferenceName: string; basicScore: { score: number; tier: string; confidence: string }; hideTools: boolean } | null>(null);

  // Resolves the score to display for a conference: prefer the Program tab's
  // already-computed score from real attendee history (never requires an
  // upload); fall back to a score from an uploaded evaluation list, which is
  // the only case where the drawer's Gap Analysis/Execution tools are hidden.
  const resolveListScore = (c: PlanConferenceRow) => {
    const programScore = calIntelScores.get(c.conferenceId);
    if (programScore) return { score: programScore.score, tier: programScore.tier, confidence: programScore.confidence, hideTools: false };
    if (c.plan.listScore != null) return { score: c.plan.listScore, tier: c.plan.listScoreTier ?? '', confidence: c.plan.listScoreConfidence ?? 'low', hideTools: true };
    return null;
  };
  const [listScoreUploadConf, setListScoreUploadConf] = useState<PlanConferenceRow | null>(null);
  const [listScorePendingFile, setListScorePendingFile] = useState<File | null>(null);
  const [listScoreMappingData, setListScoreMappingData] = useState<{ headers: string[]; suggestions: ColumnMapping; sampleRows: Record<string, string>[]; totalRows: number } | null>(null);
  const [listScoreProcessing, setListScoreProcessing] = useState(false);
  const listScoreFileInputRef = useRef<HTMLInputElement>(null);

  const handleListScoreFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (listScoreFileInputRef.current) listScoreFileInputRef.current.value = '';
    if (!file || !listScoreUploadConf) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file.');
      return;
    }
    setListScoreProcessing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-preview', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(res.status === 413 ? 'File is too large. Please try a smaller file.' : (JSON.parse(text)?.error ?? 'Failed to read file'));
      }
      const data = await res.json();
      setListScorePendingFile(file);
      setListScoreMappingData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setListScoreProcessing(false);
    }
  };

  const handleListScoreMappingConfirmed = async (mapping: ColumnMapping) => {
    if (!listScorePendingFile || !listScoreUploadConf) return;
    setListScoreMappingData(null);
    setListScoreProcessing(true);
    const conf = listScoreUploadConf;
    try {
      const formData = new FormData();
      formData.append('file', listScorePendingFile);
      formData.append('mapping', JSON.stringify(mapping));
      const uploadRes = await fetch(`/api/conferences/${conf.conferenceId}/attendees/upload`, { method: 'POST', body: formData });
      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => '');
        throw new Error(uploadRes.status === 413 ? 'File is too large. Please try a smaller file.' : (JSON.parse(text)?.error ?? 'Failed to upload list'));
      }

      const scoreRes = await fetch(`/api/program-planner/conferences/${conf.conferenceId}/list-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planYear: year }),
      });
      if (!scoreRes.ok) {
        const err = await scoreRes.json().catch(() => ({}));
        throw new Error(err.error ?? 'List uploaded, but scoring failed');
      }
      const { listScore, listScoreTier, listScoreConfidence } = await scoreRes.json();
      onListScoreUpdated(conf.conferenceId, listScore, listScoreTier, listScoreConfidence);
      toast.success('List uploaded and scored.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to score list');
    } finally {
      setListScoreProcessing(false);
      setListScoreUploadConf(null);
      setListScorePendingFile(null);
    }
  };
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [planViewMode, setPlanViewMode] = useState<'table' | 'kanban'>('table');
  const [groupMode, setGroupMode] = useState<GroupMode>('status');
  const kanbanScrollRef = useRef<HTMLDivElement>(null);
  const scrollKanban = (dir: -1 | 1) => {
    kanbanScrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };
  const [draggedId, setDraggedId] = useState<number | null>(null);
  // Conferences that were decision='new' at some point this session, tracked
  // client-side only (not persisted) so the "never attended before" star
  // keeps showing even after being dragged out of the New section into e.g.
  // Attending — decision itself is single-valued and overwritten by the move.
  const [wasNewIds, setWasNewIds] = useState<Set<number>>(new Set());
  const [dragOverGroup, setDragOverGroup] = useState<GroupKey | null>(null);
  // Any section/column in any grouping mode can be hidden from view (same
  // minimize/restore pattern as the tier columns in the pre-conference
  // Targets tab's kanban) — minimized ones collapse to a small restore pill
  // instead of rendering. Keyed by groupMode + the section's own key, since
  // different modes can reuse the same key (e.g. a rep id and a territory id
  // could collide) and switching modes shouldn't carry over what was hidden.
  const [minimizedGroups, setMinimizedGroups] = useState<Set<string>>(new Set());
  // Sections mid-close animate out for a beat before actually being removed
  // from `sections` (and thus from minimizedGroups).
  const [closingKeys, setClosingKeys] = useState<Set<string>>(new Set());
  const sectionKey = (key: string) => `${groupMode}:${key}`;
  const isMinimized = (key: string) => minimizedGroups.has(sectionKey(key));
  const isClosing = (key: string) => closingKeys.has(sectionKey(key));
  const minimizeSection = (key: string) => {
    const sk = sectionKey(key);
    setClosingKeys(prev => new Set(prev).add(sk));
    setTimeout(() => {
      setMinimizedGroups(prev => new Set(prev).add(sk));
      setClosingKeys(prev => { const next = new Set(prev); next.delete(sk); return next; });
    }, 200);
  };
  const restoreSection = (key: string) => {
    const sk = sectionKey(key);
    setMinimizedGroups(prev => { const next = new Set(prev); next.delete(sk); return next; });
  };
  const [logisticsDrawer, setLogisticsDrawer] = useState<{
    conferenceId: number;
    conferenceName: string;
    seriesName: string | null;
    planYear: number;
    startDate: string | null;
    endDate: string | null;
    decision: string | null;
    plannedBudget: number | null;
    assignedReps: AssignedRep[];
    calScore: number | null;
    boothPresent: boolean;
    boothWidth: number | null;
    boothLength: number | null;
    boothHall: string | null;
  } | null>(null);
  const sponsorshipOptions = useConfigWithIds('sponsorship_level');
  // Per-tier colors — same source (/api/config/sponsorship-levels) the drawer's
  // Sponsorship tab tier picker uses, so the Plan table pill and the drawer chip
  // for a given tier always agree on its color.
  const [sponsorshipColors, setSponsorshipColors] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/config/sponsorship-levels')
      .then(r => r.json())
      .then((rows: Array<{ value: string; color: string | null }>) => {
        const map: Record<string, string> = {};
        for (const r of rows) if (r.color) map[r.value] = r.color;
        setSponsorshipColors(map);
      })
      .catch(() => {});
  }, []);

  // Rep colors/names — same config_options (category='user') roster assigned in
  // the admin Users config section, resolved through the shared color-preset
  // system (colors are stored as preset keys like "blue", not raw hex).
  const [repColors, setRepColors] = useState<Partial<Record<number, string>>>({});
  const [repNames, setRepNames] = useState<Partial<Record<number, string>>>({});
  useEffect(() => {
    fetch('/api/config?category=user')
      .then(r => r.json())
      .then((rows: Array<{ id: number; value: string; color: string | null }>) => {
        const colorMap: Record<number, string> = {};
        const nameMap: Record<number, string> = {};
        for (const r of rows) {
          if (r.color) colorMap[r.id] = getPreset(r.color).hex;
          nameMap[r.id] = r.value;
        }
        setRepColors(colorMap);
        setRepNames(nameMap);
      })
      .catch(() => {});
  }, []);

  // Sales territories — for By Territory grouping (and for auto-placing
  // unassigned conferences under their territory's reps in By Rep grouping),
  // sourced from the territories configured in Admin Settings → Sales Reps.
  const [territoryOptions, setTerritoryOptions] = useState<Array<{ id: number; name: string; color: string; assignedUserIds: number[] }>>([]);
  useEffect(() => {
    fetch('/api/admin/territories')
      .then(r => r.json())
      .then((data: { territories: Array<{ id: number; name: string; color: string; assignedUserIds: number[] }> }) => {
        setTerritoryOptions((data.territories ?? []).map(t => ({ id: t.id, name: t.name, color: t.color, assignedUserIds: t.assignedUserIds ?? [] })));
      })
      .catch(() => {});
  }, []);

  // Effective start date for grouping/conflict math — the plan year's own date once
  // set, falling back to the conference's actual date until then.
  const conferencesForConflicts = conferences.map(c => ({
    ...c,
    startDate: c.plan.plannedStartDate ?? c.startDate,
  }));

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
    const d = c.decision;
    if (d === 'attend' || d === 'reduce' || d === 'new' || d === 'cut') return d;
    return 'evaluating';
  };

  const groups: Record<GroupKey, PlanConferenceRow[]> = { attend: [], reduce: [], new: [], evaluating: [], cut: [] };
  for (const c of conferences) groups[groupOf(c)].push(c);

  // Sections are either the 5 decision groups (status mode — draggable between
  // groups to change decision, and mergeable/minimizable) or one per assigned
  // rep (rep mode — a conference can appear in more than one rep's column, and
  // since dragging a card wouldn't map to a single meaningful action there,
  // rep sections aren't drop targets or minimizable; each card instead shows
  // its decision as a status pill, since the section no longer implies it).
  interface Section {
    key: string;
    label: string;
    icon: string;
    headerBg: string;
    headerText: string;
    pillBg: string;
    pillText: string;
    rows: PlanConferenceRow[];
    dropKey: GroupKey | null;
    // Rep sections color their header from that rep's admin-configured color
    // instead of the fixed decision-group palette — set, this overrides
    // headerBg/headerText via inline style (lighter tint of the color for the
    // background, the color itself for text/icon).
    headerColor?: string | null;
  }
  const statusSections: Section[] = ORDERED_GROUPS.map(key => {
    const cfg = GROUP_CONFIG[key];
    return { key, dropKey: key, ...cfg, rows: groups[key] };
  });
  const repSections: Section[] = (() => {
    const byRep = new Map<string, { label: string; rows: PlanConferenceRow[] }>();
    const unassigned: PlanConferenceRow[] = [];
    for (const c of conferences) {
      if (c.plan.assignedReps.length > 0) {
        for (const rep of c.plan.assignedReps) {
          const key = String(rep.userId);
          const bucket = byRep.get(key) ?? { label: rep.displayName, rows: [] };
          bucket.rows.push(c);
          byRep.set(key, bucket);
        }
        continue;
      }
      // No reps assigned — auto-place under whichever reps cover this
      // conference's territory (national conferences count for every
      // territory's reps), flagged as unassigned via a warning icon in the
      // row itself rather than left out of the rep view entirely.
      let matchedTerritories: typeof territoryOptions = [];
      if (c.territoryScope === 'national') matchedTerritories = territoryOptions;
      else if (c.territoryScope === 'regional' && c.territoryIds.length > 0) {
        matchedTerritories = territoryOptions.filter(t => c.territoryIds.includes(t.id));
      }
      const repIds = new Set<number>();
      for (const t of matchedTerritories) for (const uid of t.assignedUserIds) repIds.add(uid);
      if (repIds.size === 0) { unassigned.push(c); continue; }
      for (const uid of Array.from(repIds)) {
        const key = String(uid);
        const bucket = byRep.get(key) ?? { label: repNames[uid] ?? `Rep ${uid}`, rows: [] };
        bucket.rows.push(c);
        byRep.set(key, bucket);
      }
    }
    const entries = Array.from(byRep.entries())
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([key, v]) => ({
        key, label: v.label, icon: 'ti-user', headerBg: 'bg-gray-100', headerText: 'text-gray-700',
        pillBg: 'bg-gray-200', pillText: 'text-gray-600', rows: v.rows, dropKey: null,
        headerColor: repColors[Number(key)] ?? null,
      }));
    if (unassigned.length > 0) {
      entries.push({
        key: 'unassigned', label: 'Unassigned', icon: 'ti-user-question', headerBg: 'bg-gray-50', headerText: 'text-gray-500',
        pillBg: 'bg-gray-100', pillText: 'text-gray-500', rows: unassigned, dropKey: null, headerColor: null,
      });
    }
    return entries;
  })();
  const territorySections: Section[] = (() => {
    const byTerritory = new Map<number, PlanConferenceRow[]>();
    const national: PlanConferenceRow[] = [];
    const none: PlanConferenceRow[] = [];
    for (const c of conferences) {
      if (c.territoryScope === 'national') { national.push(c); continue; }
      if (c.territoryScope === 'regional' && c.territoryIds.length > 0) {
        for (const tid of c.territoryIds) {
          const arr = byTerritory.get(tid) ?? [];
          arr.push(c);
          byTerritory.set(tid, arr);
        }
        continue;
      }
      none.push(c);
    }
    // National conferences apply to every territory too, alongside their own
    // National bucket (which stays as-is, unaffected by this).
    if (national.length > 0) {
      for (const t of territoryOptions) {
        byTerritory.set(t.id, [...(byTerritory.get(t.id) ?? []), ...national]);
      }
    }
    // When a national conference exists, every configured territory shows up —
    // even ones with no conferences of their own yet.
    const territoryIdsToShow = national.length > 0
      ? territoryOptions.map(t => t.id)
      : Array.from(byTerritory.keys());
    const entries: Section[] = territoryIdsToShow
      .map(tid => {
        const t = territoryOptions.find(x => x.id === tid);
        return {
          key: String(tid), label: t?.name ?? `Territory ${tid}`, icon: 'ti-map-pin', headerBg: 'bg-gray-100', headerText: 'text-gray-700',
          pillBg: 'bg-gray-200', pillText: 'text-gray-600', rows: byTerritory.get(tid) ?? [], dropKey: null,
          headerColor: t?.color ?? null,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    if (national.length > 0) {
      entries.unshift({
        key: 'national', label: 'National', icon: 'ti-world', headerBg: 'bg-gray-100', headerText: 'text-gray-700',
        pillBg: 'bg-gray-200', pillText: 'text-gray-600', rows: national, dropKey: null, headerColor: null,
      });
    }
    if (none.length > 0) {
      entries.push({
        key: 'no-territory', label: 'No Territory', icon: 'ti-map-pin-off', headerBg: 'bg-gray-50', headerText: 'text-gray-500',
        pillBg: 'bg-gray-100', pillText: 'text-gray-500', rows: none, dropKey: null, headerColor: null,
      });
    }
    return entries;
  })();

  // Strategy/Type sections: a conference has exactly one value for each (no
  // multi-membership like reps/territories), so grouping is a simple bucket-by-value.
  function buildSingleFieldSections(getValue: (c: PlanConferenceRow) => string | null, icon: string, noneLabel: string, formatLabel?: (v: string) => string): Section[] {
    const map = new Map<string, PlanConferenceRow[]>();
    for (const c of conferences) {
      const key = getValue(c) ?? '__none__';
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    const entries: Section[] = Array.from(map.entries())
      .filter(([key]) => key !== '__none__')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, rows]) => ({
        key, label: formatLabel ? formatLabel(key) : key, icon, headerBg: 'bg-gray-100', headerText: 'text-gray-700',
        pillBg: 'bg-gray-200', pillText: 'text-gray-600', rows, dropKey: null,
      }));
    const none = map.get('__none__');
    if (none) {
      entries.push({
        key: '__none__', label: noneLabel, icon, headerBg: 'bg-gray-50', headerText: 'text-gray-500',
        pillBg: 'bg-gray-100', pillText: 'text-gray-500', rows: none, dropKey: null,
      });
    }
    return entries;
  }
  const strategySections: Section[] = buildSingleFieldSections(c => c.strategyTypeName, 'ti-target-arrow', 'No Strategy', abbreviateStrategy);
  const typeSections: Section[] = buildSingleFieldSections(c => c.conferenceType, 'ti-category', 'No Type');

  // By Date: one section per calendar month of each conference's effective
  // start date (the plan year's own date once set, same fallback used
  // elsewhere on this page), sorted chronologically rather than alphabetically.
  const dateSections: Section[] = (() => {
    const byMonth = new Map<string, { label: string; rows: PlanConferenceRow[] }>();
    for (const c of conferences) {
      const dateStr = c.plan.plannedStartDate ?? c.startDate;
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const bucket = byMonth.get(key) ?? { label, rows: [] };
      bucket.rows.push(c);
      byMonth.set(key, bucket);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({
        key, label: v.label, icon: 'ti-calendar', headerBg: 'bg-gray-100', headerText: 'text-gray-700',
        pillBg: 'bg-gray-200', pillText: 'text-gray-600', rows: v.rows, dropKey: null,
      }));
  })();

  const allSections = groupMode === 'status' ? statusSections
    : groupMode === 'rep' ? repSections
    : groupMode === 'territory' ? territorySections
    : groupMode === 'strategy' ? strategySections
    : groupMode === 'type' ? typeSections
    : dateSections;
  // Sections mid-close (isClosing) stay in the visible list so they can
  // animate out — they aren't actually in minimizedGroups yet.
  const sections = allSections.filter(s => !isMinimized(s.key) || isClosing(s.key));
  const minimizedSections = allSections.filter(s => isMinimized(s.key));

  const plannedConfs = [...groups.attend, ...groups.reduce, ...groups.new];
  const totalPlannedBudget = plannedConfs.reduce((sum, c) => sum + (c.plan.plannedBudget ?? 0), 0);
  const totalReps = plannedConfs.reduce((sum, c) => sum + c.plan.assignedReps.length, 0);
  const pipelineTarget = totalPlannedBudget * 3.5;

  const moveToGroup = async (conferenceId: number, group: GroupKey) => {
    const decision = GROUP_TO_DECISION[group];
    if (group !== 'new') {
      const conf = conferences.find(c => c.conferenceId === conferenceId);
      if (conf?.decision === 'new') setWasNewIds(prev => new Set(prev).add(conferenceId));
    }
    onDecisionUpdated(conferenceId, decision);
    await fetch(`/api/program-planner/conferences/${conferenceId}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, decision }),
    }).catch(() => {});
  };

  const handleDrop = (group: GroupKey) => {
    setDragOverGroup(null);
    if (draggedId != null) void moveToGroup(draggedId, group);
    setDraggedId(null);
  };

  return (
    <div className="space-y-4">
      {/* Summary stat strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Planned conferences</p>
          <p className="text-2xl font-bold text-brand-primary">{plannedConfs.length}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{groups.attend.length} returning · {groups.new.length} new · {groups.reduce.length} reduced</p>
        </div>
        <div className="card">
          <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Total planned budget</p>
          <p className="text-2xl font-bold text-brand-primary">{fmtCurrencyFull(totalPlannedBudget)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {priorYearActual != null ? `vs ${fmtCurrencyFull(priorYearActual)} actuals ${year - 1}` : ' '}
          </p>
        </div>
        <div className="card">
          <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Total headcount</p>
          <p className="text-2xl font-bold text-brand-primary">{totalReps} reps</p>
          <p className="text-[11px] text-gray-400 mt-0.5">across all planned conferences</p>
        </div>
        <div className="card">
          <p className="text-[12px] text-gray-500 uppercase tracking-wide mb-1">Pipeline target</p>
          <p className="text-2xl font-bold text-brand-primary">{fmtCurrencyFull(pipelineTarget)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">3.5x planned spend</p>
        </div>
      </div>

      <style>{`
        @keyframes minimizedPillIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes sectionPopIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
      `}</style>
      {minimizedSections.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {minimizedSections.map(section => (
            <button
              key={section.key}
              type="button"
              onClick={() => restoreSection(section.key)}
              title={`Show ${section.label}`}
              style={{
                animation: 'minimizedPillIn 200ms ease-out',
                ...(section.headerColor ? { backgroundColor: `${section.headerColor}26`, color: section.headerColor } : {}),
              }}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border border-transparent text-xs font-semibold transition-colors hover:brightness-95 ${section.headerColor ? '' : `${section.headerBg} ${section.headerText}`}`}
            >
              <span>{section.label}</span>
              <span className="opacity-80">{section.rows.length}</span>
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/70">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Grouping toggle (left) + view toggle / Add conference (right) — one row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
          <button
            type="button"
            onClick={() => setGroupMode('status')}
            title="Group by status"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              groupMode === 'status' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <StatusViewIcon />
            Status
          </button>
          <button
            type="button"
            onClick={() => setGroupMode('rep')}
            title="Group by rep"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${
              groupMode === 'rep' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <RepViewIcon />
            By Rep
          </button>
          <button
            type="button"
            onClick={() => setGroupMode('territory')}
            title="Group by territory"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${
              groupMode === 'territory' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <TerritoryViewIcon />
            By Territory
          </button>
          <button
            type="button"
            onClick={() => setGroupMode('strategy')}
            title="Group by strategy"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${
              groupMode === 'strategy' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <StrategyViewIcon />
            By Strategy
          </button>
          <button
            type="button"
            onClick={() => setGroupMode('type')}
            title="Group by type"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${
              groupMode === 'type' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <TypeViewIcon />
            By Type
          </button>
          <button
            type="button"
            onClick={() => setGroupMode('date')}
            title="Group by date"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${
              groupMode === 'date' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <DateViewIcon />
            By Date
          </button>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => setPlanViewMode('table')}
              title="Table view"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                planViewMode === 'table' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <TableViewIcon />
              Table
            </button>
            <button
              type="button"
              onClick={() => setPlanViewMode('kanban')}
              title="Kanban view"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${
                planViewMode === 'kanban' ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <KanbanViewIcon />
              Kanban
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowAddDrawer(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-primary text-white hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <i className="ti ti-plus text-[13px]" aria-hidden="true" />
            Add conference
          </button>
        </div>
      </div>

      {/* Decision groups — always all 5 (unless minimized), even empty, so a row can be dragged into any of them */}
      {planViewMode === 'table' && sections.map(section => {
        const rows = section.rows;
        const cfg = section;
        const key = section.key;
        const groupBudget = rows.reduce((sum, c) => sum + (c.plan.plannedBudget ?? 0), 0);
        const groupReps = rows.reduce((sum, c) => sum + c.plan.assignedReps.length, 0);
        const hasBudget = groupBudget > 0 || groupReps > 0;
        const dimRows = key === 'cut';
        const isDragOver = dragOverGroup === section.dropKey && section.dropKey != null;

        const closing = isClosing(section.key);
        return (
          <div
            key={key}
            className={`card p-0 overflow-hidden transition-all duration-200 ${isDragOver ? 'ring-2 ring-brand-secondary' : ''} ${closing ? 'opacity-0 scale-[0.98]' : 'opacity-100'}`}
            style={{ animation: closing ? undefined : 'sectionPopIn 200ms ease-out' }}
            onDragOver={e => { e.preventDefault(); if (draggedId != null && section.dropKey) setDragOverGroup(section.dropKey); }}
            onDragLeave={() => setDragOverGroup(prev => prev === section.dropKey ? null : prev)}
            onDrop={e => { e.preventDefault(); if (section.dropKey) handleDrop(section.dropKey); }}
          >
            <div
              className={`flex items-center justify-between gap-2 px-4 py-2.5 ${section.headerColor ? '' : cfg.headerBg}`}
              style={section.headerColor ? { backgroundColor: `${section.headerColor}26` } : undefined}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => minimizeSection(section.key)}
                  title={`Hide ${cfg.label}`}
                  className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/70 text-gray-500 hover:text-gray-700 hover:bg-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                  </svg>
                </button>
                <i className={`ti ${cfg.icon} text-[14px] ${section.headerColor ? '' : cfg.headerText}`} style={section.headerColor ? { color: section.headerColor } : undefined} aria-hidden="true" />
                <span className={`text-sm font-semibold ${section.headerColor ? '' : cfg.headerText}`} style={section.headerColor ? { color: section.headerColor } : undefined}>{cfg.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.pillBg} ${cfg.pillText}`}>
                  {rows.length} conference{rows.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span className={`text-[11px] font-medium ${section.headerColor ? '' : cfg.headerText}`} style={section.headerColor ? { color: section.headerColor } : undefined}>
                {hasBudget ? `${fmtCurrency(groupBudget)} planned · ${groupReps} rep${groupReps !== 1 ? 's' : ''}` : 'No budget committed'}
              </span>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-gray-400 border-2 border-dashed border-gray-100 m-3 rounded-lg">
                Drag a conference here
              </div>
            ) : (
              <>
                {/* Mobile: one card per conference, stacked */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {rows.map(c => {
                    return (
                      <div
                        key={c.conferenceId}
                        draggable={!!section.dropKey}
                        onDragStart={() => setDraggedId(c.conferenceId)}
                        onDragEnd={() => setDraggedId(null)}
                        className={`px-4 py-3 space-y-2.5 ${dimRows ? 'opacity-60' : ''} ${draggedId === c.conferenceId ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="cursor-grab active:cursor-grabbing mt-1 flex-shrink-0"><GripIcon /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <button
                                type="button"
                                onClick={() => setLogisticsDrawer({
                                  conferenceId: c.conferenceId,
                                  conferenceName: c.name,
                                  seriesName: null,
                                  planYear: year,
                                  startDate: c.startDate ?? null,
                                  endDate: c.endDate ?? null,
                                  decision: c.decision ?? null,
                                  plannedBudget: c.plan.plannedBudget ?? null,
                                  assignedReps: c.plan.assignedReps ?? [],
                                  calScore: null,
                                  boothPresent: c.boothPresent,
                                  boothWidth: c.boothWidth,
                                  boothLength: c.boothLength,
                                  boothHall: c.boothHall,
                                })}
                                className="text-brand-secondary hover:text-brand-primary font-medium text-sm truncate bg-transparent border-0 p-0 text-left cursor-pointer"
                              >
                                {c.name}
                              </button>
                              <Link href={`/conferences/${c.conferenceId}`} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Open conference detail">
                                <i className="ti ti-external-link text-[11px]" aria-hidden="true" />
                              </Link>
                              {(c.decision === 'new' || wasNewIds.has(c.conferenceId)) && <NewBadge />}
                              {groupMode === 'rep' && c.plan.assignedReps.length === 0 && (
                                <RepAssignmentWarning
                                  repName={section.label}
                                  conferenceName={c.name}
                                  scopeLabel={c.territoryScope === 'national' ? 'National' : 'Regional'}
                                />
                              )}
                              {groupMode !== 'status' && <StatusCircleBadge decision={c.decision} />}
                              <ListScoreBadge
                                size={22}
                                score={resolveListScore(c)?.score ?? null}
                                onUpload={() => setListScoreUploadConf(c)}
                                onOpenScore={() => {
                                  const ls = resolveListScore(c);
                                  if (!ls) return;
                                  setCalDrawer({ conferenceId: c.conferenceId, conferenceName: c.name, basicScore: { score: ls.score, tier: ls.tier, confidence: ls.confidence }, hideTools: ls.hideTools });
                                }}
                              />
                            </div>
                            <DatesEditCell
                              conferenceId={c.conferenceId}
                              planYear={year}
                              displayStartDate={c.plan.plannedStartDate}
                              plannedStartDate={c.plan.plannedStartDate}
                              plannedEndDate={c.plan.plannedEndDate}
                              fallbackStartDate={c.startDate}
                              fallbackEndDate={c.endDate}
                              onUpdated={(start, end) => onDatesUpdated(c.conferenceId, start, end)}
                            />
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {c.plan.plannedBudget != null ? (
                              <button type="button" onClick={() => setBudgetModalConf(c)} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums whitespace-nowrap bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
                                {fmtCurrency(c.plan.plannedBudget)}
                              </button>
                            ) : (
                              <button type="button" onClick={() => setBudgetModalConf(c)} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500 transition-colors">
                                + Budget
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pl-5">
                          <StrategyEditPill
                            conferenceId={c.conferenceId}
                            strategyTypeId={c.strategyTypeId}
                            strategyTypeName={c.strategyTypeName}
                            onUpdated={(id, name) => onStrategyUpdated(c.conferenceId, id, name)}
                          />
                          <TerritoryEditCell
                            conferenceId={c.conferenceId}
                            territoryScope={c.territoryScope}
                            territoryIds={c.territoryIds}
                            territoryOptions={territoryOptions}
                            onUpdated={(scope, ids) => onTerritoryUpdated(c.conferenceId, scope, ids)}
                          />
                          <OptionEditPill
                            value={c.conferenceType}
                            options={CONFERENCE_TYPE_OPTIONS}
                            activeClass="bg-amber-50 text-amber-800 border border-amber-300"
                            placeholder="Set type"
                            onSelect={async v => { onTypeUpdated(c.conferenceId, v); await fetch(`/api/conferences/${c.conferenceId}/type`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferenceType: v }) }); }}
                          />
                          <OptionEditPill
                            value={c.sponsorshipLevel}
                            options={sponsorshipOptions.map(o => o.value)}
                            activeClass="bg-green-50 text-green-800 border border-green-300"
                            placeholder="Set sponsorship"
                            colorFor={v => sponsorshipColors[v] ?? null}
                            onSelect={async v => { onSponsorshipUpdated(c.conferenceId, v); await fetch(`/api/conferences/${c.conferenceId}/sponsorship`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sponsorshipLevel: v }) }); }}
                          />
                          <BoothEditPopover
                            conferenceId={c.conferenceId}
                            boothPresent={c.boothPresent}
                            boothWidth={c.boothWidth}
                            boothLength={c.boothLength}
                            boothNumber={c.boothNumber}
                            boothHall={c.boothHall}
                            onUpdated={booth => onBoothUpdated(c.conferenceId, booth)}
                          />
                        </div>

                        <div className="pl-5 text-[11px] text-gray-500">
                          <LocationEditCell
                            conferenceId={c.conferenceId}
                            location={c.location}
                            onUpdated={loc => onLocationUpdated(c.conferenceId, loc)}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 pl-5">
                          <div style={{ position: 'relative', overflow: 'visible' }}>
                            <RepAssignmentPopover
                              conferenceId={c.conferenceId}
                              planYear={year}
                              assignedReps={c.plan.assignedReps}
                              allConferences={conferencesForConflicts.map(cc => ({ conferenceId: cc.conferenceId, name: cc.name, startDate: cc.startDate, assignedReps: cc.plan.assignedReps }))}
                              onUpdate={reps => onRepsUpdated(c.conferenceId, reps)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className={`w-full text-xs border-collapse ${dimRows ? 'opacity-60' : ''}`} style={{ tableLayout: 'fixed' }}>
                    {/* Identical, fixed-width colgroup in every section's table (table-layout:
                        fixed forces it) so columns land in the same vertical line across all
                        sections regardless of what content each section happens to contain —
                        with table-layout:auto, minWidth-only columns drift per table instead. */}
                    <colgroup>
                      <col style={{ width: 24 }} />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 76 }} />
                      <col style={{ width: 70 }} />
                      <col style={{ width: 160 }} />
                      <col style={{ width: 84 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 140 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 116 }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-2 py-2"></th>
                        <th className="px-3 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                          <div className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
                            <span className="text-left">Conference</span>
                            {groupMode !== 'status' && (
                              <span className="w-[68px] flex-shrink-0 text-center">Status</span>
                            )}
                          </div>
                        </th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">List Score</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Dates</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Strategy</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Territory</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Type</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Sponsorship</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Booth</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Location</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Budget</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Assigned reps</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Commit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c, i) => {
                        return (
                          <tr
                            key={c.conferenceId}
                            draggable={!!section.dropKey}
                            onDragStart={() => setDraggedId(c.conferenceId)}
                            onDragEnd={() => setDraggedId(null)}
                            style={i % 2 === 1 ? { backgroundColor: 'var(--color-background-secondary, #F9FAFB)' } : {}}
                            className={`hover:bg-blue-50/30 transition-colors ${draggedId === c.conferenceId ? 'opacity-40' : ''}`}
                          >
                            <td className="px-2 py-2 cursor-grab active:cursor-grabbing"><GripIcon /></td>
                            <td className="px-3 py-2">
                              <div className="grid grid-cols-[1fr_auto] gap-1.5 items-start">
                                <div className="flex items-start gap-1 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => setLogisticsDrawer({
                                      conferenceId: c.conferenceId,
                                      conferenceName: c.name,
                                      seriesName: null,
                                      planYear: year,
                                      startDate: c.startDate ?? null,
                                      endDate: c.endDate ?? null,
                                      decision: c.decision ?? null,
                                      plannedBudget: c.plan.plannedBudget ?? null,
                                      assignedReps: c.plan.assignedReps ?? [],
                                      calScore: null,
                                      boothPresent: c.boothPresent,
                                      boothWidth: c.boothWidth,
                                      boothLength: c.boothLength,
                                      boothHall: c.boothHall,
                                    })}
                                    className="text-brand-secondary hover:text-brand-primary font-medium whitespace-normal break-words bg-transparent border-0 p-0 text-left cursor-pointer"
                                  >
                                    {c.name}
                                  </button>
                                  <Link href={`/conferences/${c.conferenceId}`} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Open conference detail">
                                    <i className="ti ti-external-link text-[11px]" aria-hidden="true" />
                                  </Link>
                                </div>
                                <div className="flex items-center gap-1 w-[68px] flex-shrink-0 justify-center pt-0.5">
                                  {(c.decision === 'new' || wasNewIds.has(c.conferenceId)) && <NewBadge />}
                                  {groupMode === 'rep' && c.plan.assignedReps.length === 0 && (
                                    <RepAssignmentWarning
                                      repName={section.label}
                                      conferenceName={c.name}
                                      scopeLabel={c.territoryScope === 'national' ? 'National' : 'Regional'}
                                    />
                                  )}
                                  {groupMode !== 'status' && <StatusCircleBadge decision={c.decision} />}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <ListScoreBadge
                                size={32}
                                score={resolveListScore(c)?.score ?? null}
                                onUpload={() => setListScoreUploadConf(c)}
                                onOpenScore={() => {
                                  const ls = resolveListScore(c);
                                  if (!ls) return;
                                  setCalDrawer({ conferenceId: c.conferenceId, conferenceName: c.name, basicScore: { score: ls.score, tier: ls.tier, confidence: ls.confidence }, hideTools: ls.hideTools });
                                }}
                              />
                            </td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <DatesEditCell
                                conferenceId={c.conferenceId}
                                planYear={year}
                                displayStartDate={c.plan.plannedStartDate}
                                plannedStartDate={c.plan.plannedStartDate}
                                plannedEndDate={c.plan.plannedEndDate}
                                fallbackStartDate={c.startDate}
                                fallbackEndDate={c.endDate}
                                onUpdated={(start, end) => onDatesUpdated(c.conferenceId, start, end)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <StrategyEditPill
                                conferenceId={c.conferenceId}
                                strategyTypeId={c.strategyTypeId}
                                strategyTypeName={c.strategyTypeName}
                                onUpdated={(id, name) => onStrategyUpdated(c.conferenceId, id, name)}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <TerritoryEditCell
                                conferenceId={c.conferenceId}
                                territoryScope={c.territoryScope}
                                territoryIds={c.territoryIds}
                                territoryOptions={territoryOptions}
                                onUpdated={(scope, ids) => onTerritoryUpdated(c.conferenceId, scope, ids)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <OptionEditPill
                                value={c.conferenceType}
                                options={CONFERENCE_TYPE_OPTIONS}
                                activeClass="bg-amber-50 text-amber-800 border border-amber-300"
                                placeholder="Set type"
                                onSelect={async v => { onTypeUpdated(c.conferenceId, v); await fetch(`/api/conferences/${c.conferenceId}/type`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferenceType: v }) }); }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <OptionEditPill
                                value={c.sponsorshipLevel}
                                options={sponsorshipOptions.map(o => o.value)}
                                activeClass="bg-green-50 text-green-800 border border-green-300"
                                placeholder="Set sponsorship"
                                colorFor={v => sponsorshipColors[v] ?? null}
                                onSelect={async v => { onSponsorshipUpdated(c.conferenceId, v); await fetch(`/api/conferences/${c.conferenceId}/sponsorship`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sponsorshipLevel: v }) }); }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <BoothEditPopover
                                conferenceId={c.conferenceId}
                                boothPresent={c.boothPresent}
                                boothWidth={c.boothWidth}
                                boothLength={c.boothLength}
                                boothNumber={c.boothNumber}
                                boothHall={c.boothHall}
                                onUpdated={booth => onBoothUpdated(c.conferenceId, booth)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <LocationEditCell
                                conferenceId={c.conferenceId}
                                location={c.location}
                                onUpdated={loc => onLocationUpdated(c.conferenceId, loc)}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              {c.plan.plannedBudget != null ? (
                                <button type="button" onClick={() => setBudgetModalConf(c)} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums whitespace-nowrap bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
                                  {fmtCurrency(c.plan.plannedBudget)}
                                </button>
                              ) : (
                                <button type="button" onClick={() => setBudgetModalConf(c)} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500 transition-colors">
                                  + Budget
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2" style={{ position: 'relative', overflow: 'visible' }}>
                              <RepAssignmentPopover
                                conferenceId={c.conferenceId}
                                planYear={year}
                                assignedReps={c.plan.assignedReps}
                                allConferences={conferencesForConflicts.map(cc => ({ conferenceId: cc.conferenceId, name: cc.name, startDate: cc.startDate, assignedReps: cc.plan.assignedReps }))}
                                onUpdate={reps => onRepsUpdated(c.conferenceId, reps)}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <CommitCell
                                conferenceId={c.conferenceId}
                                conferenceName={c.name}
                                decision={c.decision}
                                plannedStartDate={c.plan.plannedStartDate}
                                planYear={year}
                                committedToProgram={c.committedToProgram}
                                onCommitted={(startDate, endDate) => onConferenceCommitted(c.conferenceId, startDate, endDate)}
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
        );
      })}

      {planViewMode === 'kanban' && (
        <div className="relative">
          <button
            type="button"
            onClick={() => scrollKanban(-1)}
            title="Scroll left"
            className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeftIcon />
          </button>
          <div ref={kanbanScrollRef} className="overflow-x-auto pb-2 scroll-smooth">
            <div className="flex items-start gap-3 min-w-max px-1">
              {sections.map(section => {
                const rows = section.rows;
                const cfg = section;
                const key = section.key;
                const isDragOver = dragOverGroup === section.dropKey && section.dropKey != null;
                const closing = isClosing(section.key);
                return (
                  <div
                    key={key}
                    className={`w-72 flex-shrink-0 rounded-xl border border-gray-200 overflow-hidden transition-all duration-200 ${isDragOver ? 'ring-2 ring-brand-secondary' : ''} ${closing ? 'opacity-0 scale-[0.98]' : 'opacity-100'}`}
                    style={{ animation: closing ? undefined : 'sectionPopIn 200ms ease-out' }}
                    onDragOver={e => { e.preventDefault(); if (draggedId != null && section.dropKey) setDragOverGroup(section.dropKey); }}
                    onDragLeave={() => setDragOverGroup(prev => prev === section.dropKey ? null : prev)}
                    onDrop={e => { e.preventDefault(); if (section.dropKey) handleDrop(section.dropKey); }}
                  >
                    <div
                      className={`flex items-center gap-2 px-3 py-2.5 ${section.headerColor ? '' : cfg.headerBg}`}
                      style={section.headerColor ? { backgroundColor: `${section.headerColor}26` } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => minimizeSection(section.key)}
                        title={`Hide ${cfg.label}`}
                        className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/70 text-gray-500 hover:text-gray-700 hover:bg-white transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                        </svg>
                      </button>
                      <i className={`ti ${cfg.icon} text-[13px] ${section.headerColor ? '' : cfg.headerText}`} style={section.headerColor ? { color: section.headerColor } : undefined} aria-hidden="true" />
                      <span className={`text-xs font-semibold flex-1 truncate ${section.headerColor ? '' : cfg.headerText}`} style={section.headerColor ? { color: section.headerColor } : undefined}>{cfg.label}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${cfg.pillBg} ${cfg.pillText}`}>
                        {rows.length}
                      </span>
                    </div>
                    <div className="p-2 space-y-2 min-h-[100px] bg-gray-50/50">
                      {rows.length === 0 ? (
                        <div className="px-2 py-6 text-center text-[11px] text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-white">
                          Drag a conference here
                        </div>
                      ) : rows.map(c => (
                        <div
                          key={c.conferenceId}
                          draggable={!!section.dropKey}
                          onDragStart={() => setDraggedId(c.conferenceId)}
                          onDragEnd={() => setDraggedId(null)}
                          className={`bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm hover:shadow-md transition-shadow ${section.dropKey ? 'cursor-grab active:cursor-grabbing' : ''} ${
                            draggedId === c.conferenceId ? 'opacity-40' : ''
                          } ${key === 'cut' ? 'opacity-70' : ''}`}
                        >
                          <div className="grid grid-cols-[1fr_auto] gap-1.5 items-start mb-1.5">
                            <button
                              type="button"
                              onClick={() => setLogisticsDrawer({
                                conferenceId: c.conferenceId,
                                conferenceName: c.name,
                                seriesName: null,
                                planYear: year,
                                startDate: c.startDate ?? null,
                                endDate: c.endDate ?? null,
                                decision: c.decision ?? null,
                                plannedBudget: c.plan.plannedBudget ?? null,
                                assignedReps: c.plan.assignedReps ?? [],
                                calScore: null,
                                boothPresent: c.boothPresent,
                                boothWidth: c.boothWidth,
                                boothLength: c.boothLength,
                                boothHall: c.boothHall,
                              })}
                              className="text-brand-secondary hover:text-brand-primary font-semibold text-xs whitespace-normal break-words bg-transparent border-0 p-0 text-left cursor-pointer min-w-0"
                            >
                              {c.name}
                            </button>
                            <div className="flex items-center gap-1 w-[84px] flex-shrink-0 justify-center pt-0.5">
                              {(c.decision === 'new' || wasNewIds.has(c.conferenceId)) && <NewBadge />}
                              {groupMode === 'rep' && c.plan.assignedReps.length === 0 && (
                                <RepAssignmentWarning
                                  repName={section.label}
                                  conferenceName={c.name}
                                  scopeLabel={c.territoryScope === 'national' ? 'National' : 'Regional'}
                                />
                              )}
                              {groupMode !== 'status' && <StatusCircleBadge decision={c.decision} />}
                              <ListScoreBadge
                                size={20}
                                score={resolveListScore(c)?.score ?? null}
                                onUpload={() => setListScoreUploadConf(c)}
                                onOpenScore={() => {
                                  const ls = resolveListScore(c);
                                  if (!ls) return;
                                  setCalDrawer({ conferenceId: c.conferenceId, conferenceName: c.name, basicScore: { score: ls.score, tier: ls.tier, confidence: ls.confidence }, hideTools: ls.hideTools });
                                }}
                              />
                              <Link href={`/conferences/${c.conferenceId}`} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Open conference detail">
                                <i className="ti ti-external-link text-[11px]" aria-hidden="true" />
                              </Link>
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400 mb-2">
                            {fmtDateShort(c.plan.plannedStartDate ?? c.startDate)}
                          </p>
                          <div className="flex items-center flex-wrap gap-1 mb-2">
                            <TerritoryEditCell
                              conferenceId={c.conferenceId}
                              territoryScope={c.territoryScope}
                              territoryIds={c.territoryIds}
                              territoryOptions={territoryOptions}
                              onUpdated={(scope, ids) => onTerritoryUpdated(c.conferenceId, scope, ids)}
                            />
                            <OptionEditPill
                              value={c.conferenceType}
                              options={CONFERENCE_TYPE_OPTIONS}
                              activeClass="bg-amber-50 text-amber-800 border border-amber-300"
                              placeholder="Set type"
                              onSelect={async v => { onTypeUpdated(c.conferenceId, v); await fetch(`/api/conferences/${c.conferenceId}/type`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferenceType: v }) }); }}
                            />
                            <OptionEditPill
                              value={c.sponsorshipLevel}
                              options={sponsorshipOptions.map(o => o.value)}
                              activeClass="bg-green-50 text-green-800 border border-green-300"
                              placeholder="Set sponsorship"
                              colorFor={v => sponsorshipColors[v] ?? null}
                              onSelect={async v => { onSponsorshipUpdated(c.conferenceId, v); await fetch(`/api/conferences/${c.conferenceId}/sponsorship`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sponsorshipLevel: v }) }); }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            {c.plan.plannedBudget != null ? (
                              <button type="button" onClick={() => setBudgetModalConf(c)} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium tabular-nums whitespace-nowrap bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
                                {fmtCurrency(c.plan.plannedBudget)}
                              </button>
                            ) : (
                              <button type="button" onClick={() => setBudgetModalConf(c)} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-500 transition-colors">
                                + Budget
                              </button>
                            )}
                            <div style={{ position: 'relative' }}>
                              <RepAssignmentPopover
                                conferenceId={c.conferenceId}
                                planYear={year}
                                assignedReps={c.plan.assignedReps}
                                allConferences={conferencesForConflicts.map(cc => ({ conferenceId: cc.conferenceId, name: cc.name, startDate: cc.startDate, assignedReps: cc.plan.assignedReps }))}
                                onUpdate={reps => onRepsUpdated(c.conferenceId, reps)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => scrollKanban(1)}
            title="Scroll right"
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ChevronRightIcon />
          </button>
        </div>
      )}

      {budgetModalConf && (
        <ConferencePlanBudgetModal
          conferenceId={budgetModalConf.conferenceId}
          conferenceName={budgetModalConf.name}
          year={year}
          actualLineItems={budgetModalConf.budgetLineItems}
          plannedLineItems={budgetModalConf.plan.plannedBudgetLineItems}
          categoryAverages={categoryAverages}
          onClose={() => setBudgetModalConf(null)}
          onSaved={(plannedBudget, lineItems) => onBudgetUpdated(budgetModalConf.conferenceId, plannedBudget, lineItems)}
        />
      )}

      {showAddDrawer && (
        <AddConferenceModal
          planYear={year}
          onClose={() => setShowAddDrawer(false)}
          onCreated={onConferenceCreated}
        />
      )}

      {logisticsDrawer && (
        <ConferencePlanLogisticsDrawer
          conferenceId={logisticsDrawer.conferenceId}
          conferenceName={logisticsDrawer.conferenceName}
          seriesName={logisticsDrawer.seriesName}
          planYear={logisticsDrawer.planYear}
          startDate={logisticsDrawer.startDate}
          endDate={logisticsDrawer.endDate}
          decision={logisticsDrawer.decision}
          plannedBudget={logisticsDrawer.plannedBudget}
          assignedReps={logisticsDrawer.assignedReps}
          calScore={logisticsDrawer.calScore}
          boothPresent={logisticsDrawer.boothPresent}
          boothWidth={logisticsDrawer.boothWidth}
          boothLength={logisticsDrawer.boothLength}
          boothHall={logisticsDrawer.boothHall}
          isOpen={true}
          onClose={() => setLogisticsDrawer(null)}
          onSponsorshipUpdated={v => onSponsorshipUpdated(logisticsDrawer.conferenceId, v)}
          onBoothUpdated={booth => {
            onBoothUpdated(logisticsDrawer.conferenceId, booth);
            setLogisticsDrawer(d => d && { ...d, boothPresent: booth.boothPresent, boothWidth: booth.boothWidth, boothLength: booth.boothLength, boothHall: booth.boothHall });
          }}
        />
      )}

      {calDrawer && (
        <CalendarIntelligenceDrawer
          conferenceId={calDrawer.conferenceId}
          conferenceName={calDrawer.conferenceName}
          basicScore={calDrawer.basicScore}
          onClose={() => setCalDrawer(null)}
          hideTools={calDrawer.hideTools}
        />
      )}

      {listScoreUploadConf && !listScoreMappingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !listScoreProcessing && setListScoreUploadConf(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-brand-highlight w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-brand-primary font-serif mb-1">Upload a list to evaluate</h2>
            <p className="text-sm text-gray-500 mb-4">
              Upload a prospect list for &ldquo;{listScoreUploadConf.name}&rdquo; — it&apos;ll be scored through the same Calendar Intelligence engine used for historical conferences.
            </p>
            <input
              ref={listScoreFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleListScoreFilePicked}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setListScoreUploadConf(null)}
                disabled={listScoreProcessing}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => listScoreFileInputRef.current?.click()}
                disabled={listScoreProcessing}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:bg-brand-primary transition-colors disabled:opacity-50"
              >
                {listScoreProcessing ? 'Processing…' : 'Choose file'}
              </button>
            </div>
          </div>
        </div>
      )}

      {listScoreMappingData && (
        <ColumnMappingModal
          fileName={listScorePendingFile?.name ?? ''}
          totalRows={listScoreMappingData.totalRows}
          headers={listScoreMappingData.headers}
          suggestions={listScoreMappingData.suggestions}
          sampleRows={listScoreMappingData.sampleRows}
          onConfirm={handleListScoreMappingConfirmed}
          onCancel={() => { setListScoreMappingData(null); setListScorePendingFile(null); }}
        />
      )}
    </div>
  );
}
