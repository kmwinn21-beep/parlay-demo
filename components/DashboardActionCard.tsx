'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { BatchCardScanModal, makeCard, type ScannedCard, type CardDraft } from './BatchCardScanModal';
import { useUser } from '@/components/UserContext';
import { GroupedCompanyDropdown } from '@/components/GroupedCompanyDropdown';
import { AssignFollowUpModal } from './AssignFollowUpModal';
import { getPreset } from '@/lib/colors';
import Link from 'next/link';
import { useActiveConference } from '@/components/ActiveConferenceContext';
import { SetConferenceButton } from '@/components/SetConferenceButton';
import { resolveProductRelevance, type ProductRelevanceResult } from '@/lib/productRelevance';
import { ProductRelevanceSection } from './ProductRelevanceSection';
import { MeetingsTable, type Meeting, type EditFormData } from '@/components/MeetingsTable';
import { useMeetingNotesDrawer } from '@/lib/MeetingNotesDrawerContext';
import { useUserOptions } from '@/lib/useUserOptions';
import { useConfigColors } from '@/lib/useConfigColors';
import { DashboardDrawer } from '@/components/DashboardDrawer';
import { AgendaDrawer } from '@/components/AgendaDrawer';
import { AttendeesDrawer } from '@/components/AttendeesDrawer';
import { MeetingDateFilterBar } from '@/components/MeetingDateFilterBar';
import { isBoothHours } from '@/lib/meetingTime';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TouchpointOption {
  id: number;
  value: string;
  color: string | null;
  sort_order: number;
}

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status?: 'in_progress' | 'upcoming' | 'past';
}

interface Company {
  id: number;
  name: string;
  company_type?: string | null;
}

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  company_id?: number | null;
}

export interface BadgeScanCard {
  localId: string;
  draft: CardDraft;
  attendeeMatches: ScannedCard['attendeeMatches'];
  companyMatches: ScannedCard['companyMatches'];
  status: 'matching' | 'matched' | 'no-match';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res((e.target?.result as string).split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// Resize and compress an image file to JPEG before sending to the API.
// Mobile camera photos can be 5–15 MB; this keeps them under 1 MB.
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function formatCardAsText(draft: CardDraft): string {
  return [
    `Name: ${[draft.first_name, draft.last_name].filter(Boolean).join(' ') || '—'}`,
    `Title: ${draft.title || '—'}`,
    `Company: ${draft.company || '—'}`,
    `Email: ${draft.email || '—'}`,
    `Phone: ${draft.phone || '—'}`,
  ].join('\n');
}

// ── SearchableSelect ──────────────────────────────────────────────────────────

function SearchableSelect<T extends { id: number }>({
  options, value, onChange, getLabel, placeholder, disabled,
}: {
  options: T[]; value: T | null; onChange: (v: T | null) => void;
  getLabel: (v: T) => string; placeholder: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = options.filter(o => getLabel(o).toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(v => !v); setSearch(''); }}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-secondary transition-colors bg-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? 'text-gray-800 truncate' : 'text-gray-400'}>
          {value ? getLabel(value) : placeholder}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange(null); }}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-secondary"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 px-3 py-2">No results</p>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-brand-secondary transition-colors ${value?.id === o.id ? 'bg-blue-50 text-brand-secondary font-medium' : 'text-gray-700'}`}
              >
                {getLabel(o)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SearchableMultiSelect ─────────────────────────────────────────────────────

function SearchableMultiSelect<T extends { id: number }>({
  options, selected, onChange, getLabel, placeholder, onSelectOther,
}: {
  options: T[]; selected: T[]; onChange: (items: T[]) => void;
  getLabel: (v: T) => string; placeholder: string;
  /** Adds an "Other (not in list)" entry above the results when provided. */
  onSelectOther?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selectedIds = new Set(selected.map(s => s.id));

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = options
    .filter(o => getLabel(o).toLowerCase().includes(search.toLowerCase()))
    .slice(0, 100);

  const toggle = (item: T) => {
    if (selectedIds.has(item.id)) {
      onChange(selected.filter(s => s.id !== item.id));
    } else {
      onChange([...selected, item]);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch(''); }}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-secondary transition-colors bg-white min-h-[38px]"
      >
        <span className={selected.length ? 'text-gray-800 truncate' : 'text-gray-400'}>
          {selected.length === 0
            ? placeholder
            : `${selected.length} attendee${selected.length > 1 ? 's' : ''} selected`}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map(s => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-xs text-brand-secondary border border-brand-secondary/20"
            >
              {getLabel(s)}
              <button
                type="button"
                onClick={() => onChange(selected.filter(x => x.id !== s.id))}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search attendees…"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-secondary"
            />
          </div>
          <div className="overflow-y-auto">
            {onSelectOther && (
              <button
                type="button"
                onClick={() => { onSelectOther(); setOpen(false); setSearch(''); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 border-b border-gray-100 font-medium"
              >
                Other (not in list)
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 px-3 py-2">No results</p>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-blue-50 transition-colors ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}
              >
                <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${selectedIds.has(o.id) ? 'bg-brand-secondary border-brand-secondary' : 'border-gray-300'}`}>
                  {selectedIds.has(o.id) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className={selectedIds.has(o.id) ? 'text-brand-secondary font-medium' : 'text-gray-700'}>
                  {getLabel(o)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Booth Interaction Picker ──────────────────────────────────────────────────

const BOOTH_INTERACTIONS = [
  { value: 'booth-stop', label: 'Stopped By', icon: '👋' },
  { value: 'booth-demo', label: 'Demo', icon: '🖥' },
  { value: 'booth-meeting', label: 'Meeting', icon: '📅' },
  { value: 'booth-followup', label: 'Follow-up Req', icon: '📋' },
] as const;

function BoothInteractionPicker({ onSelect, disabled }: { onSelect: (value: string) => void; disabled?: boolean }) {
  return (
    <div className="pt-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">What happened?</p>
      <div className="grid grid-cols-2 gap-1.5">
        {BOOTH_INTERACTIONS.map(item => (
          <button key={item.value} type="button" disabled={disabled} onClick={() => onSelect(item.value)}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:border-brand-secondary hover:text-brand-secondary hover:bg-blue-50 transition-colors disabled:opacity-50 text-left">
            <span className="text-sm">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
      <button type="button" disabled={disabled} onClick={() => onSelect('skip')}
        className="w-full mt-1.5 text-xs text-gray-400 hover:text-gray-600 py-1.5 transition-colors disabled:opacity-50">
        Skip
      </button>
    </div>
  );
}

// ── BadgeScanResultsModal ─────────────────────────────────────────────────────

export function BadgeScanResultsModal({
  cards, onClose, onAssignNow, onAssignLater, savingId, productRelevanceMap,
}: {
  cards: BadgeScanCard[];
  onClose: () => void;
  onAssignNow: (card: BadgeScanCard) => void;
  onAssignLater: (card: BadgeScanCard, secondaryTag?: string) => Promise<void>;
  savingId: string | null;
  productRelevanceMap: Record<string, ProductRelevanceResult[]>;
}) {
  const { user } = useUser();
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-brand-primary font-serif">Scanned Badge / Card</h3>
            <p className="text-xs text-gray-400 mt-0.5">{cards.length} contact{cards.length !== 1 ? 's' : ''} detected</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {cards.map(card => {
            const matchCount = card.attendeeMatches.length + card.companyMatches.length;
            const isSaving = savingId === card.localId;
            return (
              <div key={card.localId} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-gray-800">
                    {[card.draft.first_name, card.draft.last_name].filter(Boolean).join(' ') || 'Unknown'}
                  </p>
                  {card.draft.title && <p className="text-xs text-gray-500">{card.draft.title}</p>}
                  {card.draft.company && <p className="text-xs text-gray-500">{card.draft.company}</p>}
                  {card.draft.email && <p className="text-xs text-gray-400">{card.draft.email}</p>}
                  {card.draft.phone && <p className="text-xs text-gray-400">{card.draft.phone}</p>}
                </div>
                <div>
                  {card.status === 'matching' ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <div className="w-3 h-3 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
                      Searching system…
                    </div>
                  ) : matchCount > 0 ? (
                    <span className="text-xs text-emerald-600 font-medium">{matchCount} match{matchCount !== 1 ? 'es' : ''} found</span>
                  ) : (
                    <span className="text-xs text-amber-600 font-medium">No match found</span>
                  )}
                </div>
                <ProductRelevanceSection results={productRelevanceMap[card.localId] ?? []} />
                <BoothInteractionPicker
                  onSelect={(v) => void onAssignLater(card, v === 'skip' ? undefined : v)}
                  disabled={isSaving || !!user?.demoVisitor}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── TouchpointForm ────────────────────────────────────────────────────────────

/**
 * The Log Touchpoint fields, without any chrome. The modal wraps this, and the
 * desktop dashboard renders it inline in the Touchpoints section — one form so
 * the two can't drift.
 */
export function TouchpointForm({
  onDone, defaultConferenceId, defaultCompanyId, defaultAttendeeId, defaultTouchpointId,
  bodyClassName = 'px-6 py-4 overflow-y-auto flex-1 space-y-4',
  footerClassName = 'flex justify-end gap-2 px-6 pb-5 pt-2 flex-shrink-0',
  cancelLabel = 'Cancel',
  onStepChange,
  onLogged,
}: {
  /** Called once the touchpoint (and any note) is saved, and by Cancel/Skip. */
  onDone: () => void;
  defaultConferenceId?: number | null;
  /** Opens with these already chosen — used when logging from a record. */
  defaultCompanyId?: number | null;
  defaultAttendeeId?: number | null;
  /** Opens with this type already picked — used by the dashboard's type buttons. */
  defaultTouchpointId?: number | null;
  bodyClassName?: string;
  footerClassName?: string;
  /** Hidden entirely when null — inline there's nothing to cancel out of. */
  cancelLabel?: string | null;
  /** Lets the wrapper retitle itself when the note step opens. */
  onStepChange?: (step: 'form' | 'note') => void;
  /** Fired after touchpoints save, so a caller can refresh its own counts. */
  onLogged?: () => void;
}) {
  const onClose = onDone;
  const { user } = useUser();
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [touchpointOptions, setTouchpointOptions] = useState<TouchpointOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Cascade state — rebuilt each time conference changes
  const [confAttendees, setConfAttendees] = useState<Attendee[]>([]);
  const [confCompanies, setConfCompanies] = useState<Company[]>([]);
  const [loadingCascade, setLoadingCascade] = useState(false);

  const [selectedConference, setSelectedConference] = useState<Conference | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedAttendees, setSelectedAttendees] = useState<Attendee[]>([]);
  const [selectedTouchpointId, setSelectedTouchpointId] = useState<number | null>(defaultTouchpointId ?? null);
  const [submitting, setSubmitting] = useState(false);

  // "Log w/ Note" logs the touchpoint first, then swaps the body for a note
  // field. Once we're here the touchpoint is already saved, so closing without
  // writing a note loses nothing.
  const [noteStep, setNoteStep] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showAllTypes, setShowAllTypes] = useState(false);

  // "Other (not in list)" — the company and/or attendee is typed in here and
  // created on submit, the same way the floor-note assign flow does it.
  const [companyIsOther, setCompanyIsOther] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyType, setNewCompanyType] = useState('');
  const [companyTypeOptions, setCompanyTypeOptions] = useState<string[]>([]);
  const [attendeeIsOther, setAttendeeIsOther] = useState(false);
  const [manualFirst, setManualFirst] = useState('');
  const [manualLast, setManualLast] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  const resetCompanyOther = () => { setCompanyIsOther(false); setNewCompanyName(''); setNewCompanyType(''); };
  const resetAttendeeOther = () => { setAttendeeIsOther(false); setManualFirst(''); setManualLast(''); setManualTitle(''); setManualEmail(''); };

  const newCompanyReady = companyIsOther && newCompanyName.trim().length > 0;
  const newAttendeeReady = attendeeIsOther && manualFirst.trim().length > 0 && manualLast.trim().length > 0;

  useEffect(() => {
    fetch('/api/config?category=company_type')
      .then(r => (r.ok ? r.json() : []))
      .then((opts: { value: string }[]) => setCompanyTypeOptions(Array.isArray(opts) ? opts.map(o => o.value).filter(Boolean) : []))
      .catch(() => {});
  }, []);

  useEffect(() => { onStepChange?.(noteStep ? 'note' : 'form'); }, [noteStep, onStepChange]);

  // Load conferences, all companies, and touchpoint options on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [confRes, compRes, optRes] = await Promise.all([
          fetch('/api/conferences?nav=1').then(r => r.ok ? r.json() : []),
          fetch('/api/companies?limit=2000').then(r => r.ok ? r.json() : []),
          fetch('/api/config?category=touchpoints').then(r => r.ok ? r.json() : []),
        ]);
        const confs: Conference[] = (Array.isArray(confRes) ? confRes : []).map((c: Conference) => ({
          ...c,
          status: (c.start_date <= today && c.end_date >= today)
            ? 'in_progress' : c.start_date > today ? 'upcoming' : 'past',
        }));
        setConferences(confs);
        setAllCompanies(Array.isArray(compRes) ? compRes : []);
        setTouchpointOptions(
          (Array.isArray(optRes) ? (optRes as TouchpointOption[]) : [])
            .sort((a, b) => a.sort_order - b.sort_order)
        );
        const active = (defaultConferenceId != null ? confs.find(c => c.id === defaultConferenceId) : null)
          ?? confs.find(c => c.status === 'in_progress')
          ?? confs[0]
          ?? null;
        if (active) {
          setSelectedConference(active);
          await loadConferenceCascade(active.id, Array.isArray(compRes) ? compRes : [], {
            companyId: defaultCompanyId ?? null,
            attendeeId: defaultAttendeeId ?? null,
          });
        }
      } catch { toast.error('Failed to load options.'); }
      finally { setLoading(false); }
    };
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadConferenceCascade = async (
    confId: number,
    companies: Company[],
    preselect?: { companyId: number | null; attendeeId: number | null },
  ) => {
    setLoadingCascade(true);
    setConfAttendees([]);
    setConfCompanies([]);
    setSelectedCompany(null);
    setSelectedAttendees([]);
    try {
      const confData = await fetch(`/api/conferences/${confId}`).then(r => r.json()) as {
        attendees?: Array<{ id: number; first_name: string; last_name: string; company_id?: number | null }>;
      };
      const atts: Attendee[] = (confData.attendees ?? []).map(a => ({
        id: Number(a.id),
        first_name: String(a.first_name),
        last_name: String(a.last_name),
        company_id: a.company_id ?? null,
      }));
      setConfAttendees(atts);
      const companyIdSet = new Set(atts.map(a => a.company_id).filter(Boolean) as number[]);
      const scoped = companies.filter(c => companyIdSet.has(c.id));
      setConfCompanies(scoped);
      if (preselect?.companyId != null) {
        const comp = scoped.find(c => c.id === preselect.companyId) ?? null;
        if (comp) setSelectedCompany(comp);
      }
      if (preselect?.attendeeId != null) {
        const att = atts.find(a => a.id === preselect.attendeeId);
        if (att) setSelectedAttendees([att]);
      }
    } catch { toast.error('Failed to load conference attendees.'); }
    finally { setLoadingCascade(false); }
  };

  const handleConferenceChange = (conf: Conference | null) => {
    setSelectedConference(conf);
    if (conf) {
      void loadConferenceCascade(conf.id, allCompanies);
    } else {
      setConfAttendees([]);
      setConfCompanies([]);
      setSelectedCompany(null);
      setSelectedAttendees([]);
    }
  };

  const handleCompanyChange = (company: Company | null) => {
    setSelectedCompany(company);
    setSelectedAttendees([]);
  };

  const filteredAttendees = selectedCompany
    ? confAttendees.filter(a => a.company_id === selectedCompany.id)
    : confAttendees;

  const selectedTouchpoint = touchpointOptions.find(o => o.id === selectedTouchpointId) ?? null;

  // Two per row, so three rows is six types. A picked type is always shown,
  // even when it lives in the collapsed remainder.
  const TYPE_ROWS = 3;
  const TYPES_PER_ROW = 2;
  const typeCap = TYPE_ROWS * TYPES_PER_ROW;
  const hiddenTypeCount = Math.max(0, touchpointOptions.length - typeCap);
  const visibleTouchpointOptions = showAllTypes || hiddenTypeCount === 0
    ? touchpointOptions
    : (() => {
        const head = touchpointOptions.slice(0, typeCap);
        if (selectedTouchpointId == null || head.some(o => o.id === selectedTouchpointId)) return head;
        const picked = touchpointOptions.find(o => o.id === selectedTouchpointId);
        return picked ? [...head.slice(0, typeCap - 1), picked] : head;
      })();

  /**
   * Writes the note to every record the touchpoint touched — each attendee, the
   * company behind them, and the conference — so it reads the same wherever the
   * reader happens to be. Only the attendee copies notify; the rest are the
   * same note cross-posted, and notifying on each would fire three times.
   */
  const handleSaveNote = async () => {
    const content = noteText.trim();
    if (!content || !selectedConference) return;
    setSavingNote(true);
    try {
      const conferenceName = selectedConference.name;
      const rep = user?.displayName || null;
      const touchpointLabel = selectedTouchpoint?.value ?? null;

      // The company is whichever was picked, or failing that each attendee's own.
      const companyIds = new Set<number>();
      if (selectedCompany) companyIds.add(selectedCompany.id);
      else for (const att of selectedAttendees) if (att.company_id) companyIds.add(att.company_id);

      const companyNameFor = (id: number) =>
        allCompanies.find(c => c.id === id)?.name ?? null;
      const attendeeLabels = selectedAttendees.map(a => `${a.first_name} ${a.last_name}`);
      const sharedCompanyName = companyIds.size === 1
        ? companyNameFor(Array.from(companyIds)[0])
        : selectedCompany?.name ?? null;

      const post = (body: Record<string, unknown>) =>
        fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            conference_name: conferenceName,
            rep,
            touchpoint_type: touchpointLabel,
            ...body,
          }),
        });

      const posts: Promise<Response>[] = [
        ...selectedAttendees.map(att => post({
          entity_type: 'attendee',
          entity_id: att.id,
          attendee_name: `${att.first_name} ${att.last_name}`,
          company_name: att.company_id ? companyNameFor(att.company_id) : sharedCompanyName,
        })),
        ...Array.from(companyIds).map(cid => post({
          entity_type: 'company',
          entity_id: cid,
          attendee_name: attendeeLabels.join(', ') || null,
          company_name: companyNameFor(cid),
          skip_notification: true,
        })),
        post({
          entity_type: 'conference',
          entity_id: selectedConference.id,
          attendee_name: attendeeLabels.join(', ') || null,
          company_name: sharedCompanyName,
          skip_notification: true,
        }),
      ];

      const results = await Promise.allSettled(posts);
      const failures = results.filter(r =>
        r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
      ).length;
      if (failures === results.length) {
        toast.error('Failed to save the note.');
        return;
      }
      if (failures > 0) toast.error(`Note saved, but ${failures} of ${results.length} records missed it.`);
      else toast.success('Note saved.');
      onClose();
    } catch {
      toast.error('Failed to save the note.');
    } finally {
      setSavingNote(false);
    }
  };

  /**
   * Creates whatever was typed into the Other fields and returns the attendees
   * to log against. A new attendee is added to the conference by the same
   * endpoint the attendee list uses, which creates the company alongside it.
   */
  const materialiseOthers = async (): Promise<Attendee[] | null> => {
    if (!selectedConference) return null;
    let companyId = selectedCompany?.id ?? null;
    let companyName = selectedCompany?.name ?? null;

    if (newCompanyReady && !newAttendeeReady) {
      const res = await fetch('/api/companies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCompanyName.trim(), company_type: newCompanyType || null }),
      });
      if (!res.ok) { toast.error('Failed to create the company.'); return null; }
      const created = await res.json();
      companyId = Number(created.id);
      companyName = String(created.name ?? newCompanyName.trim());
      const comp: Company = { id: companyId, name: companyName };
      setAllCompanies(prev => (prev.some(c => c.id === comp.id) ? prev : [...prev, comp]));
      setConfCompanies(prev => (prev.some(c => c.id === comp.id) ? prev : [...prev, comp]));
      setSelectedCompany(comp);
      resetCompanyOther();
    }

    if (newAttendeeReady) {
      const res = await fetch(`/api/conferences/${selectedConference.id}/attendees/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: manualFirst.trim(),
          last_name: manualLast.trim(),
          title: manualTitle.trim() || undefined,
          email: manualEmail.trim() || undefined,
          company: newCompanyReady ? newCompanyName.trim() : (companyName ?? undefined),
          company_type: newCompanyReady ? (newCompanyType || undefined) : undefined,
        }),
      });
      if (!res.ok) { toast.error('Failed to create the attendee.'); return null; }
      const created = await res.json() as { id?: number; attendee_id?: number; company_id?: number | null };
      const newId = Number(created.id ?? created.attendee_id);
      if (!newId || isNaN(newId)) { toast.error('Failed to create the attendee.'); return null; }
      const att: Attendee = {
        id: newId,
        first_name: manualFirst.trim(),
        last_name: manualLast.trim(),
        company_id: created.company_id ?? companyId,
      };
      setConfAttendees(prev => (prev.some(a => a.id === att.id) ? prev : [...prev, att]));
      const next = [...selectedAttendees, att];
      setSelectedAttendees(next);
      resetAttendeeOther();
      resetCompanyOther();
      return next;
    }

    return selectedAttendees;
  };

  const handleSubmit = async (withNote = false) => {
    if (!selectedConference || !selectedTouchpointId || (selectedAttendees.length === 0 && !newAttendeeReady)) {
      toast.error('Please select a conference, at least one attendee, and a touchpoint type.');
      return;
    }
    setSubmitting(true);
    try {
      const attendees = await materialiseOthers();
      if (!attendees || attendees.length === 0) { setSubmitting(false); return; }
      const results = await Promise.allSettled(
        attendees.map(att =>
          fetch(`/api/attendees/${att.id}/touchpoints`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conference_id: selectedConference.id, option_id: selectedTouchpointId }),
          })
        )
      );
      const failures = results.filter(r =>
        r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
      ).length;
      if (failures === 0) {
        toast.success(`Touchpoint logged for ${attendees.length} attendee${attendees.length > 1 ? 's' : ''}.`);
        onLogged?.();
        if (withNote) setNoteStep(true);
        else onClose();
      } else {
        toast.error(`${failures} of ${attendees.length} touchpoints failed to save.`);
      }
    } catch { toast.error('Failed to log touchpoints.'); }
    finally { setSubmitting(false); }
  };

  const isBusy = loading || loadingCascade;
  const canSubmit = !submitting && !isBusy && !!selectedConference && !!selectedTouchpointId
    && (selectedAttendees.length > 0 || newAttendeeReady)
    && !(companyIsOther && !newCompanyReady)
    && !(attendeeIsOther && !newAttendeeReady);

  return (
    <>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : noteStep ? (
          <div className={`${bodyClassName} !space-y-3`}>
            {/* What the note will be filed against, so it's clear before saving */}
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedTouchpoint && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap"
                  style={{
                    borderColor: `${getPreset(selectedTouchpoint.color).hex}55`,
                    backgroundColor: `${getPreset(selectedTouchpoint.color).hex}18`,
                    color: getPreset(selectedTouchpoint.color).hex,
                  }}
                >
                  {selectedTouchpoint.value}
                </span>
              )}
              {selectedAttendees.map(a => (
                <span key={a.id} className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200 whitespace-nowrap">
                  {a.first_name} {a.last_name}
                </span>
              ))}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs font-medium border border-blue-100 whitespace-nowrap">
                {selectedConference?.name}
              </span>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Note</label>
              <textarea
                autoFocus
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={5}
                placeholder="What came out of it?"
                className="input-field resize-none w-full text-sm"
              />
            </div>
            <p className="text-xs text-gray-400">
              The touchpoint is already logged. The note is saved to the attendee
              {selectedAttendees.length > 1 ? 's' : ''}, their company, and the conference.
            </p>
          </div>
        ) : (
          <div className={bodyClassName}>
            {/* Conference */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Conference *</label>
              <SearchableSelect
                options={conferences}
                value={selectedConference}
                onChange={handleConferenceChange}
                getLabel={c => c.name}
                placeholder="Select conference…"
              />
            </div>
            {/* Company — filtered to conference attendees */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Company</label>
              {loadingCascade ? (
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  Loading companies…
                </div>
              ) : companyIsOther ? (
                <div className="space-y-2">
                  <input
                    autoFocus type="text" value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    placeholder="Company name *"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white"
                  />
                  <select
                    value={newCompanyType}
                    onChange={e => setNewCompanyType(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand-secondary"
                  >
                    <option value="">Company type (optional)</option>
                    {companyTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" onClick={resetCompanyOther} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    ← Pick an existing company
                  </button>
                </div>
              ) : (
                <GroupedCompanyDropdown
                  companies={confCompanies}
                  value={selectedCompany?.id ?? null}
                  onChange={(id, _name) => {
                    const comp = confCompanies.find(c => c.id === id) ?? null;
                    handleCompanyChange(comp);
                  }}
                  onClear={() => handleCompanyChange(null)}
                  onSelectOther={() => { handleCompanyChange(null); setCompanyIsOther(true); }}
                  placeholder={selectedConference ? 'Filter by company…' : 'Select a conference first'}
                  disabled={!selectedConference}
                  inputClassName="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left bg-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-brand-secondary"
                />
              )}
            </div>
            {/* Attendee multiselect — filtered to conference attendees (+ company if selected) */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Attendee *</label>
              {loadingCascade ? (
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  Loading attendees…
                </div>
              ) : attendeeIsOther ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input autoFocus type="text" value={manualFirst} onChange={e => setManualFirst(e.target.value)} placeholder="First name *"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white" />
                    <input type="text" value={manualLast} onChange={e => setManualLast(e.target.value)} placeholder="Last name *"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white" />
                  </div>
                  <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Title"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white" />
                  <input type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder="Email"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white" />
                  <button type="button" onClick={resetAttendeeOther} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    ← Pick an existing attendee
                  </button>
                </div>
              ) : (
                <SearchableMultiSelect<Attendee>
                  options={filteredAttendees}
                  selected={selectedAttendees}
                  onChange={setSelectedAttendees}
                  getLabel={a => `${a.first_name} ${a.last_name}`}
                  placeholder={selectedConference ? 'Select attendee(s)…' : 'Select a conference first'}
                  onSelectOther={selectedConference ? () => setAttendeeIsOther(true) : undefined}
                />
              )}
            </div>
            {/* Touchpoint type buttons */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Touchpoint Type *</label>
              {touchpointOptions.length === 0 ? (
                <p className="text-sm text-gray-400">No touchpoint types configured.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {visibleTouchpointOptions.map(opt => {
                    const isSelected = selectedTouchpointId === opt.id;
                    const preset = getPreset(opt.color);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedTouchpointId(isSelected ? null : opt.id)}
                        className="rounded-lg border-2 transition-all text-xs font-medium py-2 px-2 text-center"
                        style={isSelected ? {
                          borderColor: preset.hex,
                          backgroundColor: `${preset.hex}18`,
                          color: preset.hex,
                        } : {
                          borderColor: '#e5e7eb',
                          backgroundColor: '#ffffff',
                          color: '#6b7280',
                        }}
                      >
                        {opt.value}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Three rows fit; the rest open on the chevron rather than a
                  scrollbar inside the card. */}
              {hiddenTypeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllTypes(v => !v)}
                  aria-expanded={showAllTypes}
                  className="w-full mt-2 flex items-center justify-center gap-1 py-1 text-xs font-medium text-gray-400 hover:text-brand-secondary transition-colors"
                >
                  {showAllTypes ? 'Show fewer' : `${hiddenTypeCount} more`}
                  <svg className={`w-4 h-4 transition-transform duration-200 ${showAllTypes ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        <div className={footerClassName}>
          {noteStep ? (
            <>
              <button type="button" onClick={onClose} className="btn-secondary text-sm">Skip</button>
              <button
                type="button"
                onClick={() => void handleSaveNote()}
                disabled={savingNote || !noteText.trim() || !!user?.demoVisitor}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {savingNote ? 'Saving…' : 'Save Note'}
              </button>
            </>
          ) : (
            <>
              {cancelLabel && (
                // On a phone the three buttons don't fit spelled out, so cancel
                // shrinks to a × and the two actions keep their labels.
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={cancelLabel}
                  className="btn-secondary text-sm px-3 sm:px-4"
                >
                  <span className="sm:hidden" aria-hidden="true">&times;</span>
                  <span className="hidden sm:inline">{cancelLabel}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSubmit(true)}
                disabled={!canSubmit || !!user?.demoVisitor}
                className="btn-secondary text-sm whitespace-nowrap w-full"
              >
                Log w/ Note
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit(false)}
                disabled={!canSubmit || !!user?.demoVisitor}
                className="btn-primary text-sm whitespace-nowrap w-full"
              >
                {submitting ? 'Saving…' : 'Log Touchpoint'}
              </button>
            </>
          )}
        </div>
    </>
  );
}

// ── TouchpointQuickModal ──────────────────────────────────────────────────────

/** The same form, in a modal. */
export function TouchpointQuickModal({ onClose, ...defaults }: {
  onClose: () => void;
  defaultConferenceId?: number | null;
  defaultCompanyId?: number | null;
  defaultAttendeeId?: number | null;
  defaultTouchpointId?: number | null;
}) {
  const [step, setStep] = useState<'form' | 'note'>('form');
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-base font-semibold text-brand-primary font-serif">{step === 'note' ? 'Add a Note' : 'Log Touchpoint'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <TouchpointForm {...defaults} onDone={onClose} onStepChange={setStep} />
      </div>
    </div>
  );
}

// ── DashboardActionCard ───────────────────────────────────────────────────────

export function DashboardActionCard({ bannerState }: { bannerState?: 'active' | 'upcoming' | 'none' }) {
  const { user } = useUser();
  const { activeConference } = useActiveConference();
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  // Second step of the Scan menu: a badge can come from the camera or from
  // photos already on the phone.
  const [badgeSourceStep, setBadgeSourceStep] = useState(false);
  const [scanningBadge, setScanningBadge] = useState(false);
  const [scanningNotes, setScanningNotes] = useState(false);
  const [badgeScanCards, setBadgeScanCards] = useState<BadgeScanCard[]>([]);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanSavingId, setScanSavingId] = useState<string | null>(null);
  const [batchModalCards, setBatchModalCards] = useState<ScannedCard[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [badgeScanRelevance, setBadgeScanRelevance] = useState<Record<string, ProductRelevanceResult[]>>({});
  const [meetingsOpen, setMeetingsOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [attendeesOpen, setAttendeesOpen] = useState(false);
  const [drawerDateFilter, setDrawerDateFilter] = useState<string[]>([]);
  const [drawerBoothOnly, setDrawerBoothOnly] = useState(false);
  // Whoever is signed in, by first name where we have one.
  const meetingsOwner = (user?.firstName || user?.displayName || user?.repName || 'My').split(' ')[0];
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const userOptions = useUserOptions();
  const colorMaps = useConfigColors();

  // Only fetched once the section is opened — the dashboard shouldn't pay for
  // a list nobody has asked for.
  useEffect(() => {
    if (!meetingsOpen || !activeConference?.id) return;
    let cancelled = false;
    setLoadingMeetings(true);
    Promise.all([
      fetch(`/api/meetings?conference_id=${activeConference.id}`).then(r => (r.ok ? r.json() : [])),
      fetch('/api/config?category=action').then(r => (r.ok ? r.json() : [])),
    ])
      .then(([rows, actions]: [Meeting[], { value: string }[]]) => {
        if (cancelled) return;
        setMeetings(Array.isArray(rows) ? rows : []);
        setActionOptions(Array.isArray(actions) ? actions.map(a => a.value) : []);
      })
      .catch(() => { if (!cancelled) setMeetings([]); })
      .finally(() => { if (!cancelled) setLoadingMeetings(false); });
    return () => { cancelled = true; };
  }, [meetingsOpen, activeConference?.id]);

  // Mine — booked by me or on support — and still to come, soonest first.
  const myUpcomingMeetings = useMemo(() => {
    const myConfigId = user?.configId ?? null;
    const today = new Date().toISOString().slice(0, 10);
    return meetings
      .filter(m => {
        if (!m.meeting_date || m.meeting_date < today) return false;
        if (myConfigId == null) return false;
        const ids = (m.scheduled_by || '').split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n));
        return ids.includes(myConfigId);
      })
      .sort((a, b) => `${a.meeting_date} ${a.meeting_time}`.localeCompare(`${b.meeting_date} ${b.meeting_time}`));
  }, [meetings, user?.configId]);

  // Day buttons come from the meetings actually in the drawer rather than every
  // day of the conference, so a button can never filter down to nothing.
  const drawerDates = useMemo(
    () => Array.from(new Set(myUpcomingMeetings.map(m => m.meeting_date).filter(Boolean) as string[])).sort(),
    [myUpcomingMeetings],
  );
  const drawerHasBoothHours = useMemo(
    () => myUpcomingMeetings.some(m => isBoothHours(m.meeting_time)),
    [myUpcomingMeetings],
  );
  const filteredDrawerMeetings = useMemo(() => myUpcomingMeetings.filter(m => {
    if (drawerDateFilter.length > 0 && !drawerDateFilter.includes(m.meeting_date)) return false;
    if (drawerBoothOnly && !isBoothHours(m.meeting_time)) return false;
    return true;
  }), [myUpcomingMeetings, drawerDateFilter, drawerBoothOnly]);

  const handleOutcomeChange = useCallback(async (meetingId: number, outcome: string) => {
    setMeetings(prev => prev.map(m => (m.id === meetingId ? { ...m, outcome } : m)));
    try {
      const res = await fetch('/api/meetings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meetingId, outcome }),
      });
      if (!res.ok) throw new Error();
      toast.success('Outcome updated.');
    } catch {
      toast.error('Failed to update outcome.');
    }
  }, []);

  // The card kebab's two actions: the notetaker drawer and an inline edit.
  const { openMeetingNotes } = useMeetingNotesDrawer();

  const handleMeetingEdit = useCallback(async (meetingId: number, data: EditFormData) => {
    setMeetings(prev => prev.map(m => (m.id === meetingId ? { ...m, ...data } : m)));
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      toast.success('Meeting updated.');
    } catch {
      toast.error('Failed to update meeting.');
    }
  }, []);

  const cameraMenuRef = useRef<HTMLDivElement>(null);
  const badgeFileRef = useRef<HTMLInputElement>(null);
  const badgeLibraryRef = useRef<HTMLInputElement>(null);
  const notesFileRef = useRef<HTMLInputElement>(null);
  const isScanning = scanningBadge || scanningNotes;

  useEffect(() => {
    if (!showCameraMenu) return;
    const h = (e: MouseEvent) => {
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(e.target as Node)) { setShowCameraMenu(false); setBadgeSourceStep(false); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showCameraMenu]);

  const handleBadgeFile = useCallback(async (file: File) => {
    setScanningBadge(true); setShowCameraMenu(false);
    try {
      const { base64, mediaType } = await compressImage(file);
      const scanRes = await fetch('/api/scan-card/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: mediaType }),
      });
      if (!scanRes.ok) throw new Error();
      const { cards: rawCards } = await scanRes.json() as { cards: Partial<CardDraft>[] };
      const initial: BadgeScanCard[] = rawCards.map(raw => ({
        localId: Math.random().toString(36).slice(2),
        draft: {
          first_name: raw.first_name ?? '', last_name: raw.last_name ?? '',
          title: raw.title ?? '', company: raw.company ?? '',
          email: raw.email ?? '', phone: raw.phone ?? '',
        },
        attendeeMatches: [], companyMatches: [], status: 'matching' as const,
      }));
      setBadgeScanCards(initial); setShowScanModal(true);
      // Compute product relevance for each scanned card (uses cached product config)
      setBadgeScanRelevance({});
      initial.forEach(card => {
        if (card.draft.title) {
          void resolveProductRelevance(card.draft.title).then(results => {
            setBadgeScanRelevance(prev => ({ ...prev, [card.localId]: results }));
          });
        }
      });
      initial.forEach(card => {
        void fetch('/api/card-scan/match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: card.draft.first_name, last_name: card.draft.last_name,
            company: card.draft.company, email: card.draft.email,
          }),
        }).then(async mRes => {
          const { attendeeMatches = [], companyMatches = [] } = mRes.ok ? await mRes.json() : {};
          setBadgeScanCards(prev => prev.map(c => c.localId === card.localId
            ? { ...c, attendeeMatches, companyMatches, status: (attendeeMatches.length > 0 || companyMatches.length > 0) ? 'matched' : 'no-match' }
            : c));
        }).catch(() => {
          setBadgeScanCards(prev => prev.map(c => c.localId === card.localId ? { ...c, status: 'no-match' } : c));
        });
      });
    } catch { toast.error('Failed to scan badge. Please try again.'); }
    finally { setScanningBadge(false); }
  }, []);

  const handleNotesFile = useCallback(async (file: File) => {
    setScanningNotes(true); setShowCameraMenu(false);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/scan-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: file.type || 'image/jpeg' }),
      });
      if (!res.ok) throw new Error();
      const { text } = await res.json() as { text: string };
      if (!text?.trim()) { toast.error('No text detected in image.'); return; }
      const saveRes = await fetch('/api/quick-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim() }),
      });
      if (saveRes.ok) {
        const note = await saveRes.json();
        window.dispatchEvent(new CustomEvent('quicknote:saved', { detail: note }));
        toast.success('Note saved!');
      } else { toast.error('Failed to save scanned note.'); }
    } catch { toast.error('Failed to scan notes. Please try again.'); }
    finally { setScanningNotes(false); }
  }, []);

  const handleScanAssignNow = useCallback((card: BadgeScanCard) => {
    const scanned: ScannedCard = {
      ...makeCard(card.draft),
      attendeeMatches: card.attendeeMatches,
      companyMatches: card.companyMatches,
      status: card.attendeeMatches.length > 0 ? 'matched' : 'no-match',
    };
    setBatchModalCards([scanned]);
    setShowScanModal(false);
    setShowBatchModal(true);
  }, []);

  const handleScanAssignLater = useCallback(async (card: BadgeScanCard, secondaryTag?: string) => {
    setScanSavingId(card.localId);
    const relevance = badgeScanRelevance[card.localId] ?? [];
    const productSuggestions = JSON.stringify(
      relevance.map(r => ({ productId: r.productId, productName: r.productName, score: r.score, buyerRole: r.buyerRole }))
    );
    const res = await fetch('/api/quick-notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: formatCardAsText(card.draft),
        tag: 'card-badge',
        secondary_tag: secondaryTag ?? null,
        product_suggestions: productSuggestions,
      }),
    });
    if (res.ok) {
      const note = await res.json();
      window.dispatchEvent(new CustomEvent('quicknote:saved', { detail: note }));
      const label = secondaryTag === 'booth-demo' ? 'Demo logged'
        : secondaryTag === 'booth-meeting' ? 'Meeting logged'
        : secondaryTag === 'booth-followup' ? 'Follow-up logged'
        : secondaryTag === 'booth-stop' ? 'Booth stop logged'
        : 'Saved to Floor Notes';
      toast.success(`${label} — assign details anytime`);
    } else { toast.error('Failed to save note.'); }
    setScanSavingId(null);
    setBadgeScanCards(prev => {
      const next = prev.filter(c => c.localId !== card.localId);
      if (next.length === 0) setTimeout(() => setShowScanModal(false), secondaryTag ? 1500 : 0);
      return next;
    });
  }, [badgeScanRelevance]);

  return (
    <div className="card flex flex-col justify-center lg:relative">
      <div className="lg:hidden mb-3">
        <SetConferenceButton />
      </div>
      <div className="flex flex-row gap-1">

        {bannerState === 'active' && activeConference ? (
          <Link
            href={`/conferences/${activeConference.id}?fieldreport=true`}
            className={`hidden lg:flex flex-1 flex-col items-center gap-1 p-2 rounded-xl hover:bg-purple-50 transition-all group `}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-purple-500 transition-colors flex-shrink-0" style={{ backgroundColor: '#f5f3ff' }}>
              <svg className="w-4 h-4 group-hover:text-white transition-colors" style={{ color: '#7c3aed' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-xs text-gray-500 leading-tight">Field Report</p>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setShowFollowUpModal(true)}
            className={`hidden lg:flex flex-1 flex-col items-center gap-1 p-2 rounded-xl hover:bg-blue-50 transition-all group ${meetingsOpen ? 'opacity-40 grayscale' : ''}`}
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-brand-secondary transition-colors flex-shrink-0">
              <svg className="w-4 h-4 text-brand-secondary group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 112 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <p className="text-xs text-gray-500 leading-tight">Follow Up</p>
          </button>
        )}

        {/* Phones log touchpoints from the Touchpoints section beside Floor
            Notes, so this slot gives way to Attendees there. */}
        <button
          type="button"
          onClick={() => { setAttendeesOpen(true); setAgendaOpen(false); setMeetingsOpen(false); }}
          className="lg:hidden flex-1 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-sky-50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center group-hover:bg-sky-500 transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-sky-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 leading-tight">Attendees</p>
        </button>

        {/* No Touchpoints button here — desktop logs them from the full form in
            the Touchpoints section, phones from that section's type buttons. */}

        {/* Agenda — sits beside Meetings on both breakpoints */}
        <button
          type="button"
          onClick={() => { setAgendaOpen(true); setMeetingsOpen(false); }}
          className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-indigo-50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-500 transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-6 4h6" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 leading-tight">Agenda</p>
        </button>

        {/* Right — Meetings, which opens the drawer */}
        <button
          type="button"
          onClick={() => { setMeetingsOpen(true); setAgendaOpen(false); setDrawerDateFilter([]); setDrawerBoothOnly(false); }}
          aria-expanded={meetingsOpen}
          className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-yellow-50 transition-colors group"
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${meetingsOpen ? 'bg-brand-highlight' : 'bg-yellow-100 group-hover:bg-brand-highlight'}`}>
            <svg className={`w-4 h-4 transition-colors ${meetingsOpen ? 'text-brand-primary' : 'text-yellow-600 group-hover:text-brand-primary'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 leading-tight">Meetings</p>
        </button>
      </div>

      {agendaOpen && <AgendaDrawer onClose={() => setAgendaOpen(false)} />}

      {attendeesOpen && <AttendeesDrawer onClose={() => setAttendeesOpen(false)} />}

      {meetingsOpen && (
        <DashboardDrawer
          title={`${activeConference?.name ?? 'Conference'} - ${meetingsOwner}'s Meetings`}
          onClose={() => setMeetingsOpen(false)}
        >
          {!activeConference ? (
            <p className="text-xs text-gray-400 text-center py-8">Set an active conference to see your meetings.</p>
          ) : loadingMeetings ? (
            <p className="text-xs text-gray-400 text-center py-8">Loading meetings…</p>
          ) : myUpcomingMeetings.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">
              No upcoming meetings for you at {activeConference.name}.
            </p>
          ) : (
            <>
              {drawerDates.length > 1 && (
                <div className="px-4 pt-3 pb-1">
                  <MeetingDateFilterBar
                    dates={drawerDates}
                    selected={drawerDateFilter}
                    onChange={setDrawerDateFilter}
                    variant="short"
                    showBoothHours={drawerHasBoothHours}
                    boothHoursOnly={drawerBoothOnly}
                    onBoothHoursChange={setDrawerBoothOnly}
                  />
                </div>
              )}
              {filteredDrawerMeetings.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No meetings match those filters.</p>
              ) : (
            <MeetingsTable
              cardsOnly
              groupByDate
              showConferencePill
              tableName="conference_meetings"
              meetings={filteredDrawerMeetings}
              actionOptions={actionOptions}
              colorMap={colorMaps.action || {}}
              userOptions={userOptions}
              onOutcomeChange={handleOutcomeChange}
              onNotesClick={openMeetingNotes}
              onEdit={handleMeetingEdit}
            />
              )}
            </>
          )}
        </DashboardDrawer>
      )}

      {/* Hidden file inputs for camera scan */}
      <input
        ref={badgeFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleBadgeFile(f); e.target.value = ''; }}
      />
      {/* No capture attribute, so this one opens the phone's photo library */}
      <input
        ref={badgeLibraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleBadgeFile(f); e.target.value = ''; }}
      />
      <input
        ref={notesFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleNotesFile(f); e.target.value = ''; }}
      />

      {/* Modals */}
      <AssignFollowUpModal
        isOpen={showFollowUpModal}
        onClose={() => setShowFollowUpModal(false)}
        onSuccess={() => setShowFollowUpModal(false)}
      />
      {showScanModal && badgeScanCards.length > 0 && (
        <BadgeScanResultsModal
          cards={badgeScanCards}
          onClose={() => setShowScanModal(false)}
          onAssignNow={handleScanAssignNow}
          onAssignLater={handleScanAssignLater}
          savingId={scanSavingId}
          productRelevanceMap={badgeScanRelevance}
        />
      )}
      {showBatchModal && (
        <BatchCardScanModal
          initialCards={batchModalCards}
          onClose={() => setShowBatchModal(false)}
          onDone={() => setShowBatchModal(false)}
          conferenceId={activeConference?.id}
        />
      )}
    </div>
  );
}
