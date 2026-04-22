'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardDraft {
  first_name: string; last_name: string;
  title: string; company: string;
  email: string; phone: string;
}

interface AttendeeMatch {
  id: number; first_name: string; last_name: string;
  title: string | null; company_name: string | null;
  company_id: number | null; email: string | null;
  matchType: 'email' | 'name';
}

interface CompanyMatch {
  id: number; name: string; company_type: string | null;
}

interface SearchResult {
  id: number; name: string; subtitle: string;
}

type CardStatus = 'matching' | 'matched' | 'no-match' | 'confirmed' | 'added' | 'error';

interface ScannedCard {
  localId: string;
  draft: CardDraft;
  attendeeMatches: AttendeeMatch[];
  companyMatches: CompanyMatch[];
  selectedMatch: AttendeeMatch | null;
  selectedCompany: CompanyMatch | null;
  status: CardStatus;
  // add-new form state
  showAddForm: boolean;
  addDraft: CardDraft & { company_id: number | null };
}

interface Props {
  conferenceId: number;
  onClose: () => void;
  onDone: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }

function makeCard(raw: Partial<CardDraft>): ScannedCard {
  return {
    localId: uid(),
    draft: {
      first_name: raw.first_name ?? '',
      last_name:  raw.last_name  ?? '',
      title:      raw.title      ?? '',
      company:    raw.company    ?? '',
      email:      raw.email      ?? '',
      phone:      raw.phone      ?? '',
    },
    attendeeMatches: [],
    companyMatches:  [],
    selectedMatch:   null,
    selectedCompany: null,
    status: 'matching',
    showAddForm: false,
    addDraft: {
      first_name: raw.first_name ?? '', last_name: raw.last_name ?? '',
      title: raw.title ?? '', company: raw.company ?? '',
      email: raw.email ?? '', phone: raw.phone ?? '',
      company_id: null,
    },
  };
}

// ─── SearchInput ──────────────────────────────────────────────────────────────

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (result: SearchResult) => void;
  searchType: 'attendees' | 'companies';
  placeholder?: string;
  label: string;
}

function SearchInput({ value, onChange, onSelect, searchType, placeholder, label }: SearchInputProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = await res.json();
        const list: SearchResult[] = (data[searchType] ?? []).map((r: { id: number; name: string; subtitle?: string }) => ({
          id: r.id, name: r.name, subtitle: r.subtitle ?? '',
        }));
        setResults(list);
        setOpen(list.length > 0);
      } catch { /* ignore */ }
    }, 250);
  }, [searchType]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); search(e.target.value); }}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-100 max-h-40 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
              onMouseDown={e => { e.preventDefault(); onSelect(r); onChange(r.name); setOpen(false); }}
            >
              <p className="text-sm font-medium text-gray-800">{r.name}</p>
              {r.subtitle && <p className="text-xs text-gray-500">{r.subtitle}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LeftCard — extracted/editable fields ─────────────────────────────────────

interface LeftCardProps {
  card: ScannedCard;
  onDraftChange: (field: keyof CardDraft, value: string) => void;
  onAttendeeSelect: (r: SearchResult) => void;
  onCompanySelect: (r: SearchResult) => void;
}

function LeftCard({ card, onDraftChange, onAttendeeSelect, onCompanySelect }: LeftCardProps) {
  const statusColors: Record<CardStatus, string> = {
    matching:  'bg-gray-100 text-gray-500',
    matched:   'bg-blue-100 text-blue-700',
    'no-match':'bg-amber-100 text-amber-700',
    confirmed: 'bg-green-100 text-green-700',
    added:     'bg-green-100 text-green-700',
    error:     'bg-red-100 text-red-700',
  };
  const statusLabel: Record<CardStatus, string> = {
    matching: 'Matching…', matched: 'Match Found',
    'no-match': 'No Match', confirmed: 'Confirmed',
    added: 'Added', error: 'Error',
  };

  return (
    <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 space-y-2.5 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scanned Card</p>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColors[card.status]}`}>
          {statusLabel[card.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SearchInput
          label="First Name" value={card.draft.first_name} placeholder="First"
          searchType="attendees"
          onChange={v => onDraftChange('first_name', v)}
          onSelect={onAttendeeSelect}
        />
        <SearchInput
          label="Last Name" value={card.draft.last_name} placeholder="Last"
          searchType="attendees"
          onChange={v => onDraftChange('last_name', v)}
          onSelect={onAttendeeSelect}
        />
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Title</label>
        <input
          type="text" value={card.draft.title} placeholder="Job title"
          onChange={e => onDraftChange('title', e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary"
        />
      </div>

      <SearchInput
        label="Company" value={card.draft.company} placeholder="Company name"
        searchType="companies"
        onChange={v => onDraftChange('company', v)}
        onSelect={onCompanySelect}
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Email</label>
          <input
            type="email" value={card.draft.email} placeholder="email@co.com"
            onChange={e => onDraftChange('email', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Phone</label>
          <input
            type="tel" value={card.draft.phone} placeholder="Phone"
            onChange={e => onDraftChange('phone', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary"
          />
        </div>
      </div>
    </div>
  );
}

// ─── RightCard — match result + actions ───────────────────────────────────────

interface RightCardProps {
  card: ScannedCard;
  onConfirm: (attendeeId: number) => void;
  onNotAMatch: () => void;
  onShowAddForm: () => void;
  onAddFormChange: (field: keyof ScannedCard['addDraft'], value: string) => void;
  onAddFormCompanySelect: (r: SearchResult) => void;
  onAddNew: () => void;
  saving: boolean;
}

function RightCard({ card, onConfirm, onNotAMatch, onShowAddForm, onAddFormChange, onAddFormCompanySelect, onAddNew, saving }: RightCardProps) {
  if (card.status === 'confirmed' || card.status === 'added') {
    return (
      <div className="flex-1 bg-green-50 rounded-xl border border-green-200 p-4 flex flex-col items-center justify-center gap-2 min-w-0">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-green-700">
          {card.status === 'confirmed' ? 'Match Confirmed' : 'Attendee Added'}
        </p>
        <p className="text-xs text-green-600 text-center">Follow-up task created</p>
      </div>
    );
  }

  if (card.status === 'matching') {
    return (
      <div className="flex-1 bg-gray-50 rounded-xl border border-gray-200 p-4 flex items-center justify-center min-w-0">
        <div className="flex flex-col items-center gap-2">
          <svg className="animate-spin w-6 h-6 text-brand-secondary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-xs text-gray-500">Searching for matches…</p>
        </div>
      </div>
    );
  }

  const topMatch = card.selectedMatch ?? card.attendeeMatches[0] ?? null;
  const topCompany = card.selectedCompany ?? card.companyMatches[0] ?? null;

  if (card.showAddForm) {
    return (
      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 space-y-2.5 min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Attendee</p>
        <div className="grid grid-cols-2 gap-2">
          {(['first_name','last_name'] as const).map(f => (
            <div key={f}>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                {f === 'first_name' ? 'First' : 'Last'}
              </label>
              <input type="text" value={card.addDraft[f]}
                onChange={e => onAddFormChange(f, e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary"
              />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Title</label>
          <input type="text" value={card.addDraft.title}
            onChange={e => onAddFormChange('title', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary"
          />
        </div>
        <SearchInput label="Company" value={card.addDraft.company} placeholder="Search or type company"
          searchType="companies"
          onChange={v => onAddFormChange('company', v)}
          onSelect={onAddFormCompanySelect}
        />
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Email</label>
          <input type="email" value={card.addDraft.email}
            onChange={e => onAddFormChange('email', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onAddNew} disabled={saving || !card.addDraft.first_name || !card.addDraft.last_name}
            className="btn-primary text-xs flex-1">
            {saving ? 'Saving…' : 'Save & Create'}
          </button>
          <button onClick={onShowAddForm} className="btn-secondary text-xs px-3">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 space-y-3 min-w-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Best Match</p>

      {topMatch ? (
        <>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {topMatch.first_name} {topMatch.last_name}
                </p>
                {topMatch.title && <p className="text-xs text-gray-500">{topMatch.title}</p>}
                {topMatch.company_name && <p className="text-xs text-gray-500">{topMatch.company_name}</p>}
                {topMatch.email && <p className="text-xs text-gray-400">{topMatch.email}</p>}
              </div>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0 capitalize">
                {topMatch.matchType}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onConfirm(topMatch.id)} disabled={saving}
              className="btn-primary text-xs flex-1">
              {saving ? 'Saving…' : 'Confirm Match'}
            </button>
            <button onClick={onNotAMatch} className="text-xs text-gray-400 hover:text-gray-600 px-2">
              Not a match
            </button>
          </div>
          {card.attendeeMatches.length > 1 && (
            <p className="text-[10px] text-gray-400">
              +{card.attendeeMatches.length - 1} other match{card.attendeeMatches.length > 2 ? 'es' : ''} found
            </p>
          )}
        </>
      ) : topCompany ? (
        <>
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-xs text-amber-600 font-medium mb-1">Company match — no attendee record</p>
            <p className="text-sm font-semibold text-gray-800">{topCompany.name}</p>
            {topCompany.company_type && <p className="text-xs text-gray-500">{topCompany.company_type}</p>}
          </div>
          <button onClick={onShowAddForm} className="btn-primary text-xs w-full">
            Add Attendee to this Company
          </button>
        </>
      ) : (
        <>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-center">
            <p className="text-xs text-gray-400">No matching attendee or company found</p>
          </div>
          <button onClick={onShowAddForm} className="btn-primary text-xs w-full">
            Add as New Attendee
          </button>
        </>
      )}
    </div>
  );
}

// ─── BatchCardScanModal — main export ─────────────────────────────────────────

export function BatchCardScanModal({ conferenceId, onClose, onDone }: Props) {
  const [cards, setCards] = useState<ScannedCard[]>([]);
  const [scanning, setScanning] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const updateCard = useCallback((localId: string, patch: Partial<ScannedCard>) => {
    setCards(prev => prev.map(c => c.localId === localId ? { ...c, ...patch } : c));
  }, []);

  const patchDraft = useCallback((localId: string, field: keyof CardDraft, value: string) => {
    setCards(prev => prev.map(c =>
      c.localId === localId ? { ...c, draft: { ...c.draft, [field]: value } } : c
    ));
  }, []);

  const patchAddDraft = useCallback((localId: string, field: keyof ScannedCard['addDraft'], value: string) => {
    setCards(prev => prev.map(c =>
      c.localId === localId ? { ...c, addDraft: { ...c.addDraft, [field]: value } } : c
    ));
  }, []);

  const fetchMatch = useCallback(async (card: ScannedCard) => {
    try {
      const res = await fetch('/api/card-scan/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: card.draft.first_name, last_name: card.draft.last_name,
          company: card.draft.company, email: card.draft.email,
        }),
      });
      if (!res.ok) { updateCard(card.localId, { status: 'no-match' }); return; }
      const { attendeeMatches, companyMatches } = await res.json();
      updateCard(card.localId, {
        attendeeMatches, companyMatches,
        status: attendeeMatches.length > 0 || companyMatches.length > 0 ? 'matched' : 'no-match',
      });
    } catch {
      updateCard(card.localId, { status: 'no-match' });
    }
  }, [updateCard]);

  const handleFile = useCallback(async (file: File) => {
    setScanning(true);
    try {
      const base64: string = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => res((e.target?.result as string).split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/scan-card/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: file.type || 'image/jpeg' }),
      });
      if (!response.ok) throw new Error('Scan failed');
      const { cards: rawCards } = await response.json();
      const newCards: ScannedCard[] = (rawCards as Partial<CardDraft>[]).map(makeCard);
      setCards(prev => [...prev, ...newCards]);
      newCards.forEach(c => fetchMatch(c));
    } catch { /* silent */ } finally { setScanning(false); }
  }, [fetchMatch]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { handleFile(file); e.target.value = ''; }
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) handleFile(file);
  }, [handleFile]);

  const handleConfirm = useCallback(async (localId: string, attendeeId: number) => {
    setSavingId(localId);
    try {
      const res = await fetch('/api/card-scan/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId }),
      });
      if (res.ok) updateCard(localId, { status: 'confirmed' });
    } finally { setSavingId(null); }
  }, [conferenceId, updateCard]);

  const handleAddNew = useCallback(async (localId: string) => {
    const card = cards.find(c => c.localId === localId);
    if (!card) return;
    setSavingId(localId);
    try {
      const res = await fetch('/api/card-scan/add-new', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: card.addDraft.first_name, last_name: card.addDraft.last_name,
          title: card.addDraft.title || undefined, email: card.addDraft.email || undefined,
          company_id: card.addDraft.company_id || undefined,
          company_name: !card.addDraft.company_id && card.addDraft.company ? card.addDraft.company : undefined,
          conference_id: conferenceId,
        }),
      });
      if (res.ok) updateCard(localId, { status: 'added' });
    } finally { setSavingId(null); }
  }, [cards, conferenceId, updateCard]);

  const handleAttendeeSelect = useCallback((localId: string, r: SearchResult) => {
    const parts = r.name.split(' ');
    const syntheticMatch: AttendeeMatch = {
      id: r.id, first_name: parts[0] ?? '', last_name: parts.slice(1).join(' '),
      title: null, company_name: r.subtitle ?? null, company_id: null, email: null, matchType: 'name',
    };
    updateCard(localId, { selectedMatch: syntheticMatch, status: 'matched' });
  }, [updateCard]);

  const handleCompanySelect = useCallback((localId: string, r: SearchResult) => {
    updateCard(localId, {
      selectedCompany: { id: r.id, name: r.name, company_type: r.subtitle ?? null },
      status: 'matched',
    });
  }, [updateCard]);

  const handleAddFormCompanySelect = useCallback((localId: string, r: SearchResult) => {
    setCards(prev => prev.map(c =>
      c.localId === localId ? { ...c, addDraft: { ...c.addDraft, company: r.name, company_id: r.id } } : c
    ));
  }, []);

  const confirmed  = cards.filter(c => c.status === 'confirmed').length;
  const added      = cards.filter(c => c.status === 'added').length;
  const unresolved = cards.filter(c => !['confirmed','added'].includes(c.status)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-brand-primary font-serif">Scan Business Cards</h2>
            {cards.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {confirmed} confirmed · {added} added · {unresolved} unresolved
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drop / upload zone */}
        <div
          onDragOver={e => e.preventDefault()} onDrop={handleDrop}
          onClick={() => !scanning && fileRef.current?.click()}
          className="mx-6 mt-4 flex-shrink-0 border-2 border-dashed border-gray-200 rounded-xl p-5 flex items-center justify-center gap-3 cursor-pointer hover:border-brand-secondary hover:bg-blue-50/40 transition-colors"
        >
          {scanning ? (
            <>
              <svg className="animate-spin w-5 h-5 text-brand-secondary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm text-gray-500">Scanning cards…</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm text-gray-500">
                {cards.length === 0 ? 'Drop a photo or click to scan business cards' : 'Drop or click to scan another photo'}
              </span>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />

        {/* Card rows */}
        {cards.length > 0 && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            {cards.map((card, i) => (
              <div key={card.localId}>
                {i > 0 && <div className="border-t border-gray-100 pt-4" />}
                <div className="flex gap-3">
                  <LeftCard
                    card={card}
                    onDraftChange={(f, v) => patchDraft(card.localId, f, v)}
                    onAttendeeSelect={r => handleAttendeeSelect(card.localId, r)}
                    onCompanySelect={r => handleCompanySelect(card.localId, r)}
                  />
                  <RightCard
                    card={card}
                    saving={savingId === card.localId}
                    onConfirm={attId => handleConfirm(card.localId, attId)}
                    onNotAMatch={() => updateCard(card.localId, { selectedMatch: null, selectedCompany: null, status: 'no-match' })}
                    onShowAddForm={() => updateCard(card.localId, { showAddForm: !card.showAddForm })}
                    onAddFormChange={(f, v) => patchAddDraft(card.localId, f, v)}
                    onAddFormCompanySelect={r => handleAddFormCompanySelect(card.localId, r)}
                    onAddNew={() => handleAddNew(card.localId)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
          {cards.length > 0 && unresolved === 0 && (
            <button onClick={onDone} className="btn-primary text-sm">Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
