'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { RepAssignmentPopover, type AssignedRep } from './RepAssignmentPopover';
import { ConferencePlanBudgetModal } from './ConferencePlanBudgetModal';
import { AddConferenceModal } from './AddConferenceModal';
import { LocationAutocompleteInput, type LocationDetails } from './LocationAutocompleteInput';
import { useConfigWithIds } from '@/lib/useUserOptions';
import { ConferencePlanLogisticsDrawer } from './logistics';

interface BudgetLineItem { label: string; budgeted: number | null; actual: number | null }
interface PlannedLineItem { label: string; budgeted: number }
interface CategoryAverage { label: string; avgActual: number }
interface TeamInputInfo { hasInput: boolean; hasComments: boolean }

interface PlanMeta {
  plannedBudget: number | null;
  plannedBudgetLineItems: PlannedLineItem[];
  assignedReps: AssignedRep[];
  plannedStartDate: string | null;
  plannedEndDate: string | null;
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
  plan: PlanMeta;
}

interface ProgramPlannerPlanViewProps {
  year: number;
  conferences: PlanConferenceRow[];
  categoryAverages: CategoryAverage[];
  teamInputMap: Map<number, TeamInputInfo>;
  onOpenInputPanel: (conferenceId: number, conferenceName: string) => void;
  onDecisionUpdated: (conferenceId: number, decision: 'attend' | 'reduce' | 'cut' | 'evaluating' | 'new' | null) => void;
  onRepsUpdated: (conferenceId: number, assignedReps: AssignedRep[]) => void;
  onBudgetUpdated: (conferenceId: number, plannedBudget: number, lineItems: PlannedLineItem[]) => void;
  onStrategyUpdated: (conferenceId: number, strategyTypeId: number | null, strategyTypeName: string | null) => void;
  onDatesUpdated: (conferenceId: number, plannedStartDate: string | null, plannedEndDate: string | null) => void;
  onTypeUpdated: (conferenceId: number, conferenceType: string | null) => void;
  onSponsorshipUpdated: (conferenceId: number, sponsorshipLevel: string | null) => void;
  onBoothUpdated: (conferenceId: number, booth: { boothPresent: boolean; boothWidth: number | null; boothLength: number | null; boothNumber: string | null; boothHall: string | null }) => void;
  onLocationUpdated: (conferenceId: number, location: string) => void;
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
const ORDERED_GROUPS: GroupKey[] = ['attend', 'reduce', 'new', 'evaluating', 'cut'];
const GROUP_TO_DECISION: Record<GroupKey, GroupKey> = {
  attend: 'attend', reduce: 'reduce', new: 'new', evaluating: 'evaluating', cut: 'cut',
};

const GROUP_CONFIG: Record<GroupKey, { label: string; icon: string; headerBg: string; headerText: string; pillBg: string; pillText: string }> = {
  attend:     { label: 'Attending',                     icon: 'ti-check',        headerBg: 'bg-green-50',  headerText: 'text-green-800',  pillBg: 'bg-green-100',  pillText: 'text-green-700' },
  reduce:     { label: 'Attending (reduced footprint)',  icon: 'ti-arrows-minimize', headerBg: 'bg-amber-50',  headerText: 'text-amber-800',  pillBg: 'bg-amber-100',  pillText: 'text-amber-700' },
  new:        { label: 'New — never attended (Evaluating)', icon: 'ti-sparkles',  headerBg: 'bg-purple-50', headerText: 'text-purple-800', pillBg: 'bg-purple-100', pillText: 'text-purple-700' },
  evaluating: { label: 'Evaluating',                      icon: 'ti-clock',        headerBg: 'bg-gray-100',  headerText: 'text-gray-700',   pillBg: 'bg-gray-200',   pillText: 'text-gray-600' },
  cut:        { label: 'Not attending',                   icon: 'ti-x',            headerBg: 'bg-red-50',    headerText: 'text-red-800',    pillBg: 'bg-red-100',    pillText: 'text-red-700' },
};

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

function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" className="text-gray-300">
      <circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" />
      <circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" />
      <circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" />
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

function InputButton({ conferenceId, conferenceName, info, onOpen }: {
  conferenceId: number; conferenceName: string; info: TeamInputInfo | undefined; onOpen: (id: number, name: string) => void;
}) {
  const hasInput = info?.hasInput ?? false;
  const hasComments = info?.hasComments ?? false;
  return (
    <button
      type="button"
      onClick={() => onOpen(conferenceId, conferenceName)}
      className={`relative p-1.5 rounded-full transition-all hover:opacity-75 ${hasInput ? 'bg-brand-primary/10' : ''}`}
      title="View team input"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: hasInput ? 'rgb(var(--brand-primary-rgb))' : '#B0B7C3' }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      {hasComments && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />}
    </button>
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
        {strategyTypeName ?? 'Set strategy'}
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
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
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
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
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 260 }}
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
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
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
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
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 280 }}
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
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
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
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
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 200 }}
        >
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">FY{planYear} dates</p>
          <div className="space-y-1.5">
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Start</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} className="input-field text-xs w-full" />
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
  year, conferences, categoryAverages, teamInputMap, onOpenInputPanel,
  onDecisionUpdated, onRepsUpdated, onBudgetUpdated, onStrategyUpdated, onDatesUpdated,
  onTypeUpdated, onSponsorshipUpdated, onBoothUpdated, onLocationUpdated, onConferenceCreated,
}: ProgramPlannerPlanViewProps) {
  const [priorYearActual, setPriorYearActual] = useState<number | null>(null);
  const [budgetModalConf, setBudgetModalConf] = useState<PlanConferenceRow | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<GroupKey | null>(null);
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

  const plannedConfs = [...groups.attend, ...groups.reduce, ...groups.new];
  const totalPlannedBudget = plannedConfs.reduce((sum, c) => sum + (c.plan.plannedBudget ?? 0), 0);
  const totalReps = plannedConfs.reduce((sum, c) => sum + c.plan.assignedReps.length, 0);
  const pipelineTarget = totalPlannedBudget * 3.5;

  const moveToGroup = async (conferenceId: number, group: GroupKey) => {
    const decision = GROUP_TO_DECISION[group];
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

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowAddDrawer(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-primary text-white hover:opacity-90 transition-opacity"
        >
          <i className="ti ti-plus text-[13px]" aria-hidden="true" />
          Add conference
        </button>
      </div>

      {/* Decision groups — always all 5, even empty, so a row can be dragged into any of them */}
      {ORDERED_GROUPS.map(key => {
        const rows = groups[key];
        const cfg = GROUP_CONFIG[key];
        const groupBudget = rows.reduce((sum, c) => sum + (c.plan.plannedBudget ?? 0), 0);
        const groupReps = rows.reduce((sum, c) => sum + c.plan.assignedReps.length, 0);
        const hasBudget = groupBudget > 0 || groupReps > 0;
        const dimRows = key === 'cut';
        const isDragOver = dragOverGroup === key;

        return (
          <div
            key={key}
            className={`card p-0 overflow-hidden transition-shadow ${isDragOver ? 'ring-2 ring-brand-secondary' : ''}`}
            onDragOver={e => { e.preventDefault(); if (draggedId != null) setDragOverGroup(key); }}
            onDragLeave={() => setDragOverGroup(prev => prev === key ? null : prev)}
            onDrop={e => { e.preventDefault(); handleDrop(key); }}
          >
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

            {rows.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-gray-400 border-2 border-dashed border-gray-100 m-3 rounded-lg">
                Drag a conference here
              </div>
            ) : (
              <>
                {/* Mobile: one card per conference, stacked */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {rows.map(c => {
                    const info = teamInputMap.get(c.conferenceId);
                    return (
                      <div
                        key={c.conferenceId}
                        draggable
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
                              {c.decision === 'new' && <NewBadge />}
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
                              <button type="button" onClick={() => setBudgetModalConf(c)} className="text-gray-700 font-semibold text-sm tabular-nums hover:text-brand-primary transition-colors">
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
                          <InputButton conferenceId={c.conferenceId} conferenceName={c.name} info={info} onOpen={onOpenInputPanel} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className={`w-full text-xs border-collapse ${dimRows ? 'opacity-60' : ''}`}>
                    <colgroup>
                      <col style={{ width: 24 }} />
                      <col style={{ minWidth: 140 }} />
                      <col style={{ width: 70 }} />
                      <col style={{ minWidth: 170 }} />
                      <col style={{ minWidth: 120 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ minWidth: 140 }} />
                      <col style={{ minWidth: 130 }} />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 52 }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-2 py-2"></th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Conference</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Dates</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Strategy</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Type</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Sponsorship</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Booth</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Location</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Budget</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Assigned reps</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Input</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c, i) => {
                        const info = teamInputMap.get(c.conferenceId);
                        return (
                          <tr
                            key={c.conferenceId}
                            draggable
                            onDragStart={() => setDraggedId(c.conferenceId)}
                            onDragEnd={() => setDraggedId(null)}
                            style={i % 2 === 1 ? { backgroundColor: 'var(--color-background-secondary, #F9FAFB)' } : {}}
                            className={`hover:bg-blue-50/30 transition-colors ${draggedId === c.conferenceId ? 'opacity-40' : ''}`}
                          >
                            <td className="px-2 py-2 cursor-grab active:cursor-grabbing"><GripIcon /></td>
                            <td className="px-3 py-2">
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
                                  className="text-brand-secondary hover:text-brand-primary font-medium truncate max-w-[110px] bg-transparent border-0 p-0 text-left cursor-pointer"
                                >
                                  {c.name}
                                </button>
                                <Link href={`/conferences/${c.conferenceId}`} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Open conference detail">
                                  <i className="ti ti-external-link text-[11px]" aria-hidden="true" />
                                </Link>
                                {c.decision === 'new' && <NewBadge />}
                              </div>
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
                                <button type="button" onClick={() => setBudgetModalConf(c)} className="text-gray-700 font-medium tabular-nums hover:text-brand-primary transition-colors">
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
                              <InputButton conferenceId={c.conferenceId} conferenceName={c.name} info={info} onOpen={onOpenInputPanel} />
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
    </div>
  );
}
