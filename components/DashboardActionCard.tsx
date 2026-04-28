'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { BatchCardScanModal, makeCard, type ScannedCard, type CardDraft } from './BatchCardScanModal';
import { AssignFollowUpModal } from './AssignFollowUpModal';
import { QuickNoteInlineModal } from './QuickNotesSection';
import { getPreset } from '@/lib/colors';

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
}

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  company_id?: number | null;
}

interface BadgeScanCard {
  localId: string;
  draft: CardDraft;
  attendeeMatches: ScannedCard['attendeeMatches'];
  companyMatches: ScannedCard['companyMatches'];
  status: 'matching' | 'matched' | 'no-match';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res((e.target?.result as string).split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function formatCardAsText(draft: CardDraft): string {
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
  options, selected, onChange, getLabel, placeholder,
}: {
  options: T[]; selected: T[]; onChange: (items: T[]) => void;
  getLabel: (v: T) => string; placeholder: string;
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

// ── BadgeScanResultsModal ─────────────────────────────────────────────────────

function BadgeScanResultsModal({
  cards, onClose, onAssignNow, onAssignLater, savingId,
}: {
  cards: BadgeScanCard[];
  onClose: () => void;
  onAssignNow: (card: BadgeScanCard) => void;
  onAssignLater: (card: BadgeScanCard) => Promise<void>;
  savingId: string | null;
}) {
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onAssignNow(card)}
                    disabled={isSaving}
                    className="flex-1 btn-primary text-xs py-1.5 disabled:opacity-50"
                  >
                    Assign Now
                  </button>
                  <button
                    type="button"
                    onClick={() => void onAssignLater(card)}
                    disabled={isSaving}
                    className="flex-1 btn-secondary text-xs py-1.5 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving…' : 'Assign Later'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── TouchpointQuickModal ──────────────────────────────────────────────────────

export function TouchpointQuickModal({ onClose }: { onClose: () => void }) {
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
  const [selectedTouchpointId, setSelectedTouchpointId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        const active = confs.find(c => c.status === 'in_progress') ?? confs[0] ?? null;
        if (active) {
          setSelectedConference(active);
          await loadConferenceCascade(active.id, Array.isArray(compRes) ? compRes : []);
        }
      } catch { toast.error('Failed to load options.'); }
      finally { setLoading(false); }
    };
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadConferenceCascade = async (confId: number, companies: Company[]) => {
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
      setConfCompanies(companies.filter(c => companyIdSet.has(c.id)));
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

  const handleSubmit = async () => {
    if (!selectedConference || selectedAttendees.length === 0 || !selectedTouchpointId) {
      toast.error('Please select a conference, at least one attendee, and a touchpoint type.');
      return;
    }
    setSubmitting(true);
    try {
      const results = await Promise.allSettled(
        selectedAttendees.map(att =>
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
        toast.success(`Touchpoint logged for ${selectedAttendees.length} attendee${selectedAttendees.length > 1 ? 's' : ''}.`);
        onClose();
      } else {
        toast.error(`${failures} of ${selectedAttendees.length} touchpoints failed to save.`);
      }
    } catch { toast.error('Failed to log touchpoints.'); }
    finally { setSubmitting(false); }
  };

  const isBusy = loading || loadingCascade;
  const canSubmit = !submitting && !isBusy && !!selectedConference && selectedAttendees.length > 0 && !!selectedTouchpointId;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-base font-semibold text-brand-primary font-serif">Log Touchpoint</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
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
              ) : (
                <SearchableSelect
                  options={confCompanies}
                  value={selectedCompany}
                  onChange={handleCompanyChange}
                  getLabel={c => c.name}
                  placeholder={selectedConference ? 'Filter by company…' : 'Select a conference first'}
                  disabled={!selectedConference}
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
              ) : (
                <SearchableMultiSelect<Attendee>
                  options={filteredAttendees}
                  selected={selectedAttendees}
                  onChange={setSelectedAttendees}
                  getLabel={a => `${a.first_name} ${a.last_name}`}
                  placeholder={selectedConference ? 'Select attendee(s)…' : 'Select a conference first'}
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
                  {touchpointOptions.map(opt => {
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
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 px-6 pb-5 pt-2 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="btn-primary text-sm"
          >
            {submitting ? 'Saving…' : 'Log Touchpoint'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DashboardActionCard ───────────────────────────────────────────────────────

export function DashboardActionCard() {
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const [scanningBadge, setScanningBadge] = useState(false);
  const [scanningNotes, setScanningNotes] = useState(false);
  const [badgeScanCards, setBadgeScanCards] = useState<BadgeScanCard[]>([]);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanSavingId, setScanSavingId] = useState<string | null>(null);
  const [batchModalCards, setBatchModalCards] = useState<ScannedCard[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showTouchpointsModal, setShowTouchpointsModal] = useState(false);

  const cameraMenuRef = useRef<HTMLDivElement>(null);
  const badgeFileRef = useRef<HTMLInputElement>(null);
  const notesFileRef = useRef<HTMLInputElement>(null);
  const isScanning = scanningBadge || scanningNotes;

  useEffect(() => {
    if (!showCameraMenu) return;
    const h = (e: MouseEvent) => {
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(e.target as Node)) setShowCameraMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showCameraMenu]);

  const handleBadgeFile = useCallback(async (file: File) => {
    setScanningBadge(true); setShowCameraMenu(false);
    try {
      const base64 = await fileToBase64(file);
      const scanRes = await fetch('/api/scan-card/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: file.type || 'image/jpeg' }),
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

  const handleScanAssignLater = useCallback(async (card: BadgeScanCard) => {
    setScanSavingId(card.localId);
    const res = await fetch('/api/quick-notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: formatCardAsText(card.draft), tag: 'card-badge' }),
    });
    if (res.ok) {
      const note = await res.json();
      window.dispatchEvent(new CustomEvent('quicknote:saved', { detail: note }));
      toast.success('Saved to Quick Notes!');
    } else { toast.error('Failed to save note.'); }
    setScanSavingId(null);
    setBadgeScanCards(prev => {
      const next = prev.filter(c => c.localId !== card.localId);
      if (next.length === 0) setShowScanModal(false);
      return next;
    });
  }, []);

  return (
    <div className="card flex flex-col justify-center">
      <div className="flex flex-row gap-1">

        {/* Left — mobile: Scan camera, desktop: Follow Up */}
        <div className="lg:hidden flex-1 relative" ref={cameraMenuRef}>
          <button
            type="button"
            onClick={() => setShowCameraMenu(v => !v)}
            disabled={isScanning}
            className="w-full flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-blue-50 transition-colors group disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-brand-secondary transition-colors flex-shrink-0">
              {isScanning ? (
                <div className="w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 text-brand-secondary group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
            <p className="text-xs text-gray-500 leading-tight">Scan</p>
          </button>
          {showCameraMenu && (
            <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]">
              <button
                type="button"
                onClick={() => { setShowCameraMenu(false); badgeFileRef.current?.click(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-brand-secondary transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2" />
                </svg>
                Scan Badge/Card
              </button>
              <button
                type="button"
                onClick={() => { setShowCameraMenu(false); notesFileRef.current?.click(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-brand-secondary transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Scan Notes
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowFollowUpModal(true)}
          className="hidden lg:flex flex-1 flex-col items-center gap-1 p-2 rounded-xl hover:bg-blue-50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-brand-secondary transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-brand-secondary group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 leading-tight">Follow Up</p>
        </button>

        {/* Middle — Quick Note */}
        <button
          type="button"
          onClick={() => setShowNoteModal(true)}
          className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-yellow-50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center group-hover:bg-brand-highlight transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-yellow-600 group-hover:text-brand-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 leading-tight">Quick Note</p>
        </button>

        {/* Right — Touchpoints */}
        <button
          type="button"
          onClick={() => setShowTouchpointsModal(true)}
          className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-green-50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-500 transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-green-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 leading-tight">Touchpoints</p>
        </button>
      </div>

      {/* Hidden file inputs for camera scan */}
      <input
        ref={badgeFileRef}
        type="file"
        accept="image/*"
        capture="environment"
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
      {showNoteModal && <QuickNoteInlineModal onClose={() => setShowNoteModal(false)} />}
      <AssignFollowUpModal
        isOpen={showFollowUpModal}
        onClose={() => setShowFollowUpModal(false)}
        onSuccess={() => setShowFollowUpModal(false)}
      />
      {showTouchpointsModal && <TouchpointQuickModal onClose={() => setShowTouchpointsModal(false)} />}
      {showScanModal && badgeScanCards.length > 0 && (
        <BadgeScanResultsModal
          cards={badgeScanCards}
          onClose={() => setShowScanModal(false)}
          onAssignNow={handleScanAssignNow}
          onAssignLater={handleScanAssignLater}
          savingId={scanSavingId}
        />
      )}
      {showBatchModal && (
        <BatchCardScanModal
          initialCards={batchModalCards}
          onClose={() => setShowBatchModal(false)}
          onDone={() => setShowBatchModal(false)}
        />
      )}
    </div>
  );
}
