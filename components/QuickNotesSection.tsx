'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { BatchCardScanModal, makeCard, type ScannedCard, type CardDraft } from './BatchCardScanModal';

interface QuickNote {
  id: number;
  content: string;
  created_at: string;
  created_by: string | null;
  tag: string | null;
}

interface Conference { id: number; name: string; }
interface Company { id: number; name: string; }
interface Attendee { id: number; first_name: string; last_name: string; company_id?: number | null; company_name?: string | null; }

interface BadgeScanCard {
  localId: string;
  draft: CardDraft;
  attendeeMatches: ScannedCard['attendeeMatches'];
  companyMatches: ScannedCard['companyMatches'];
  status: 'matching' | 'matched' | 'no-match';
}

function fmtDate(dateStr: string) {
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return dateStr; }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res((e.target?.result as string).split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function formatCardAsText(draft: CardDraft): string {
  const lines = [
    `Name: ${[draft.first_name, draft.last_name].filter(Boolean).join(' ') || '—'}`,
    `Title: ${draft.title || '—'}`,
    `Company: ${draft.company || '—'}`,
    `Email: ${draft.email || '—'}`,
    `Phone: ${draft.phone || '—'}`,
  ];
  return lines.join('\n');
}

// ── Searchable dropdown ──────────────────────────────────────────────────────
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
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = options.filter(o => getLabel(o).toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button" disabled={disabled}
        onClick={() => { setOpen(v => !v); setSearch(''); }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-secondary transition-colors bg-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>{value ? getLabel(value) : placeholder}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <span role="button" onClick={e => { e.stopPropagation(); onChange(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </span>
          )}
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-secondary" />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 px-3 py-2">No results</p>
            ) : filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-brand-secondary transition-colors ${value?.id === o.id ? 'bg-blue-50 text-brand-secondary font-medium' : 'text-gray-700'}`}>
                {getLabel(o)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Note Modal ────────────────────────────────────────────────────────────
function AddNoteModal({ onClose, onSave }: { onClose: () => void; onSave: (content: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    await onSave(text.trim());
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-brand-primary font-serif">Quick Note</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Write your note here…" rows={5}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary resize-none"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave(); }} />
        <p className="text-xs text-gray-400 mt-1 mb-4">⌘+Enter to save</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button type="button" onClick={handleSave} disabled={!text.trim() || saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign Note Modal ─────────────────────────────────────────────────────────
function AssignNoteModal({ note, onClose, onAssigned }: { note: QuickNote; onClose: () => void; onAssigned: (id: number) => void }) {
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [allAttendees, setAllAttendees] = useState<Attendee[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [filteredAttendees, setFilteredAttendees] = useState<Attendee[]>([]);
  const [filteredConferences, setFilteredConferences] = useState<Conference[]>([]);
  const [selConference, setSelConference] = useState<Conference | null>(null);
  const [selCompany, setSelCompany] = useState<Company | null>(null);
  const [selAttendee, setSelAttendee] = useState<Attendee | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const confAttendeesRef = useRef<Map<number, Set<number>>>(new Map());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [confRes, compRes, attRes] = await Promise.all([
          fetch('/api/conferences?nav=1').then(r => r.ok ? r.json() : []),
          fetch('/api/companies?limit=2000').then(r => r.ok ? r.json() : []),
          fetch('/api/attendees?limit=5000').then(r => r.ok ? r.json() : []),
        ]);
        const confs: Conference[] = Array.isArray(confRes) ? confRes.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })) : [];
        const comps: Company[] = Array.isArray(compRes) ? compRes.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })) : [];
        const atts: Attendee[] = Array.isArray(attRes)
          ? attRes.map((a: { id: number; first_name: string; last_name: string; company_id?: number; company_name?: string }) => ({
              id: a.id, first_name: a.first_name, last_name: a.last_name,
              company_id: a.company_id ?? null, company_name: a.company_name ?? null,
            }))
          : [];
        setConferences(confs); setAllCompanies(comps); setAllAttendees(atts);
        setFilteredConferences(confs); setFilteredCompanies(comps); setFilteredAttendees(atts);
        const caRes = await fetch('/api/conference-attendees?all=1').then(r => r.ok ? r.json() : []).catch(() => []);
        if (Array.isArray(caRes)) {
          const map = new Map<number, Set<number>>();
          for (const row of caRes as { conference_id: number; attendee_id: number }[]) {
            if (!map.has(row.conference_id)) map.set(row.conference_id, new Set());
            map.get(row.conference_id)!.add(row.attendee_id);
          }
          confAttendeesRef.current = map;
        }
      } catch { toast.error('Failed to load options.'); }
      setLoading(false);
    };
    load();
  }, []);

  const handleConferenceChange = useCallback((conf: Conference | null) => {
    setSelConference(conf); setSelAttendee(null);
    if (!conf) {
      if (selCompany) { setFilteredAttendees(allAttendees.filter(a => a.company_id === selCompany.id)); }
      else { setFilteredAttendees(allAttendees); setFilteredCompanies(allCompanies); }
      return;
    }
    const attIds = confAttendeesRef.current.get(conf.id) ?? new Set<number>();
    const confAtts = allAttendees.filter(a => attIds.has(a.id));
    setFilteredAttendees(confAtts);
    if (!selCompany) setFilteredCompanies(allCompanies.filter(c => new Set(confAtts.map(a => a.company_id).filter(Boolean)).has(c.id)));
  }, [selCompany, allAttendees, allCompanies]);

  const handleCompanyChange = useCallback((comp: Company | null) => {
    setSelCompany(comp); setSelAttendee(null);
    if (!comp) {
      if (selConference) {
        const attIds = confAttendeesRef.current.get(selConference.id) ?? new Set<number>();
        const confAtts = allAttendees.filter(a => attIds.has(a.id));
        setFilteredAttendees(confAtts);
        setFilteredCompanies(allCompanies.filter(c => new Set(confAtts.map(a => a.company_id).filter(Boolean)).has(c.id)));
      } else { setFilteredAttendees(allAttendees); setFilteredCompanies(allCompanies); }
      return;
    }
    const compAtts = allAttendees.filter(a => a.company_id === comp.id);
    setFilteredAttendees(selConference ? compAtts.filter(a => (confAttendeesRef.current.get(selConference.id) ?? new Set()).has(a.id)) : compAtts);
    if (!selConference && confAttendeesRef.current.size > 0) {
      const confIds = new Set<number>();
      confAttendeesRef.current.forEach((attIds, confId) => { if (compAtts.some(a => attIds.has(a.id))) confIds.add(confId); });
      setFilteredConferences(conferences.filter(c => confIds.has(c.id)));
    }
  }, [selConference, allAttendees, allCompanies, conferences]);

  const handleAttendeeChange = useCallback((att: Attendee | null) => {
    setSelAttendee(att);
    if (!att) return;
    if (!selCompany && att.company_id) {
      const comp = allCompanies.find(c => c.id === att.company_id) ?? null;
      if (comp) { setSelCompany(comp); setFilteredCompanies([comp]); }
    }
    if (!selConference && confAttendeesRef.current.size > 0) {
      const confIds = new Set<number>();
      confAttendeesRef.current.forEach((attIds, confId) => { if (attIds.has(att.id)) confIds.add(confId); });
      setFilteredConferences(conferences.filter(c => confIds.has(c.id)));
    }
  }, [selCompany, selConference, allCompanies, conferences]);

  const canSave = selConference || selCompany || selAttendee;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quick-notes/${note.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conference_id: selConference?.id ?? null, company_id: selCompany?.id ?? null,
          attendee_id: selAttendee?.id ?? null, conference_name: selConference?.name ?? null,
          company_name: selCompany?.name ?? null,
          attendee_name: selAttendee ? `${selAttendee.first_name} ${selAttendee.last_name}` : null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Note assigned successfully.');
      onAssigned(note.id);
    } catch { toast.error('Failed to assign note.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-brand-primary font-serif">Assign Note</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 line-clamp-3">{note.content}</p>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Conference</label>
                <SearchableSelect options={filteredConferences} value={selConference} onChange={handleConferenceChange} getLabel={c => c.name} placeholder="Select a conference…" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Company</label>
                <SearchableSelect options={filteredCompanies} value={selCompany} onChange={handleCompanyChange} getLabel={c => c.name} placeholder="Select a company…" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Attendee</label>
                <SearchableSelect options={filteredAttendees} value={selAttendee} onChange={handleAttendeeChange} getLabel={a => `${a.first_name} ${a.last_name}`} placeholder="Select an attendee…" />
              </div>
              {canSave
                ? <p className="text-xs text-gray-400">Note will be saved to the selected record(s) and removed from Quick Notes.</p>
                : <p className="text-xs text-amber-600">Select at least one conference, company, or attendee.</p>}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button type="button" onClick={handleSave} disabled={!canSave || saving || loading} className="btn-primary text-sm">
            {saving ? 'Assigning…' : 'Assign Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────────
function NoteCard({ note, onDelete, onAssign, onEdit }: {
  note: QuickNote; onDelete: (id: number) => void; onAssign: () => void; onEdit: (id: number, content: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const isLong = note.content.length > 200;

  const handleEditSave = async () => {
    if (!editText.trim() || editText.trim() === note.content) { setEditing(false); return; }
    setSaving(true);
    await onEdit(note.id, editText.trim());
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-xs text-gray-400 truncate">{fmtDate(note.created_at)}{note.created_by && ` · ${note.created_by.split('@')[0]}`}</p>
          {note.tag === 'card-badge' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[10px] font-medium text-blue-600 flex-shrink-0">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2" /></svg>
              Badge
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" onClick={() => { setEditing(true); setEditText(note.content); }}
            className="text-gray-300 hover:text-brand-secondary transition-colors p-1 rounded" title="Edit">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button type="button" onClick={onAssign}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-secondary hover:text-brand-primary border border-brand-secondary/30 hover:border-brand-secondary px-2.5 py-1 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" /></svg>
            Assign
          </button>
          <button type="button" onClick={() => onDelete(note.id)}
            className="text-gray-300 hover:text-red-400 transition-colors p-1 rounded" title="Delete">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={4} autoFocus
            className="w-full border border-brand-secondary/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary resize-none"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleEditSave(); if (e.key === 'Escape') setEditing(false); }} />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">Cancel</button>
            <button type="button" onClick={handleEditSave} disabled={saving || !editText.trim()}
              className="text-xs font-medium text-white bg-brand-secondary hover:bg-brand-primary px-3 py-1 rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className={`text-sm text-gray-700 leading-relaxed ${!expanded && isLong ? 'line-clamp-4' : ''}`}>{note.content}</p>
          {isLong && (
            <button type="button" onClick={() => setExpanded(v => !v)} className="text-xs text-brand-secondary hover:underline mt-1.5">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Badge Scan Results Modal ──────────────────────────────────────────────────
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-brand-primary font-serif">Scanned Badge / Card</h3>
            <p className="text-xs text-gray-400 mt-0.5">{cards.length} contact{cards.length !== 1 ? 's' : ''} detected</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
                  <button type="button" onClick={() => onAssignNow(card)} disabled={isSaving}
                    className="flex-1 btn-primary text-xs py-1.5 disabled:opacity-50">
                    Assign Now
                  </button>
                  <button type="button" onClick={() => onAssignLater(card)} disabled={isSaving}
                    className="flex-1 btn-secondary text-xs py-1.5 disabled:opacity-50">
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

// ── Main QuickNotesSection ────────────────────────────────────────────────────
export function QuickNotesSection({ className = '' }: { className?: string }) {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [assigningNote, setAssigningNote] = useState<QuickNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const [scanningBadge, setScanningBadge] = useState(false);
  const [scanningNotes, setScanningNotes] = useState(false);
  const [badgeScanCards, setBadgeScanCards] = useState<BadgeScanCard[]>([]);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanSavingId, setScanSavingId] = useState<string | null>(null);
  const [batchModalCards, setBatchModalCards] = useState<ScannedCard[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const cameraMenuRef = useRef<HTMLDivElement>(null);
  const badgeFileRef = useRef<HTMLInputElement>(null);
  const notesFileRef = useRef<HTMLInputElement>(null);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) { setHasMore(false); return; }
    setHasMore(el.scrollHeight - el.scrollTop > el.clientHeight + 4);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => { const m = media.matches; setIsMobile(m); if (!m) setSectionExpanded(true); };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    fetch('/api/quick-notes').then(r => r.ok ? r.json() : [])
      .then(data => { setNotes(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { if (sectionExpanded) requestAnimationFrame(checkScroll); }, [notes, sectionExpanded, loading, checkScroll]);

  useEffect(() => {
    const handler = (e: Event) => {
      const note = (e as CustomEvent<QuickNote>).detail;
      setNotes(prev => prev.some(n => n.id === note.id) ? prev : [note, ...prev]);
      setSectionExpanded(true);
    };
    window.addEventListener('quicknote:saved', handler);
    return () => window.removeEventListener('quicknote:saved', handler);
  }, []);

  useEffect(() => {
    if (!showCameraMenu) return;
    const h = (e: MouseEvent) => { if (cameraMenuRef.current && !cameraMenuRef.current.contains(e.target as Node)) setShowCameraMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showCameraMenu]);

  const handleSaveNote = useCallback(async (content: string, tag?: string | null): Promise<QuickNote | null> => {
    const res = await fetch('/api/quick-notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, tag: tag ?? null }),
    });
    if (res.ok) {
      const note = await res.json() as QuickNote;
      setNotes(prev => [note, ...prev]);
      setSectionExpanded(true);
      toast.success('Note saved!');
      return note;
    }
    toast.error('Failed to save note.');
    return null;
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this quick note? This cannot be undone.')) return;
    const res = await fetch(`/api/quick-notes/${id}`, { method: 'DELETE' });
    if (res.ok) setNotes(prev => prev.filter(n => n.id !== id));
    else toast.error('Failed to delete note.');
  };

  const handleEdit = async (id: number, content: string) => {
    const res = await fetch(`/api/quick-notes/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const updated = await res.json() as QuickNote;
      setNotes(prev => prev.map(n => n.id === id ? updated : n));
      toast.success('Note updated.');
    } else toast.error('Failed to update note.');
  };

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
        draft: { first_name: raw.first_name ?? '', last_name: raw.last_name ?? '', title: raw.title ?? '', company: raw.company ?? '', email: raw.email ?? '', phone: raw.phone ?? '' },
        attendeeMatches: [], companyMatches: [], status: 'matching' as const,
      }));
      setBadgeScanCards(initial); setShowScanModal(true);
      initial.forEach(async card => {
        try {
          const mRes = await fetch('/api/card-scan/match', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name: card.draft.first_name, last_name: card.draft.last_name, company: card.draft.company, email: card.draft.email }),
          });
          const { attendeeMatches = [], companyMatches = [] } = mRes.ok ? await mRes.json() : {};
          setBadgeScanCards(prev => prev.map(c => c.localId === card.localId
            ? { ...c, attendeeMatches, companyMatches, status: attendeeMatches.length > 0 || companyMatches.length > 0 ? 'matched' : 'no-match' }
            : c));
        } catch {
          setBadgeScanCards(prev => prev.map(c => c.localId === card.localId ? { ...c, status: 'no-match' } : c));
        }
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
      await handleSaveNote(text.trim());
    } catch { toast.error('Failed to scan notes. Please try again.'); }
    finally { setScanningNotes(false); }
  }, [handleSaveNote]);

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
    await handleSaveNote(formatCardAsText(card.draft), 'card-badge');
    setScanSavingId(null);
    setBadgeScanCards(prev => {
      const next = prev.filter(c => c.localId !== card.localId);
      if (next.length === 0) setShowScanModal(false);
      return next;
    });
  }, [handleSaveNote]);

  const handleAssignNote = useCallback(async (note: QuickNote) => {
    if (note.tag !== 'card-badge') { setAssigningNote(note); return; }
    const lines = note.content.split('\n');
    const get = (key: string) => { const l = lines.find(ln => ln.startsWith(key + ':')); return l ? l.slice(key.length + 1).trim().replace('—', '').trim() : ''; };
    const nameParts = get('Name').split(' ');
    const draft: CardDraft = {
      first_name: nameParts[0] ?? '', last_name: nameParts.slice(1).join(' '),
      title: get('Title'), company: get('Company'), email: get('Email'), phone: get('Phone'),
    };
    try {
      const mRes = await fetch('/api/card-scan/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: draft.first_name, last_name: draft.last_name, company: draft.company, email: draft.email }),
      });
      const { attendeeMatches = [], companyMatches = [] } = mRes.ok ? await mRes.json() : {};
      const scanned: ScannedCard = { ...makeCard(draft), attendeeMatches, companyMatches, status: attendeeMatches.length > 0 ? 'matched' : 'no-match' };
      setBatchModalCards([scanned]);
      setShowBatchModal(true);
      setNotes(prev => prev.filter(n => n.id !== note.id));
      await fetch(`/api/quick-notes/${note.id}`, { method: 'DELETE' });
    } catch { toast.error('Failed to search for match.'); }
  }, []);

  const showBody = !isMobile || sectionExpanded;
  const isScanning = scanningBadge || scanningNotes;

  return (
    <div className={`card h-full flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between mb-1 flex-shrink-0">
        <button type="button" onClick={() => { if (isMobile) setSectionExpanded(v => !v); }}
          className={`flex items-center gap-2 text-left group ${isMobile ? '' : 'cursor-default'}`}>
          <svg className="w-5 h-5 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="text-lg font-semibold text-brand-primary font-serif group-hover:text-brand-secondary transition-colors">Quick Notes</span>
          {notes.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-secondary text-white text-[10px] font-bold leading-none">{notes.length}</span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 lg:hidden ${sectionExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Mobile: camera + plus icon buttons */}
        <div className="flex items-center gap-1.5 lg:hidden">
          <div className="relative" ref={cameraMenuRef}>
            <button type="button" onClick={() => setShowCameraMenu(v => !v)} disabled={isScanning}
              className="border border-brand-secondary/30 hover:border-brand-secondary hover:bg-blue-50 p-1.5 rounded-lg text-brand-secondary transition-colors disabled:opacity-50" title="Scan">
              {isScanning
                ? <div className="w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              }
            </button>
            {showCameraMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]">
                <button type="button" onClick={() => { setShowCameraMenu(false); badgeFileRef.current?.click(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-brand-secondary transition-colors">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2" /></svg>
                  Scan Badge/Card
                </button>
                <button type="button" onClick={() => { setShowCameraMenu(false); notesFileRef.current?.click(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-brand-secondary transition-colors">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Scan Notes
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={() => setShowAddModal(true)}
            className="border border-brand-secondary/30 hover:border-brand-secondary hover:bg-blue-50 p-1.5 rounded-lg text-brand-secondary transition-colors" title="Add quick note">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>

        {/* Desktop: text button */}
        <button type="button" onClick={() => setShowAddModal(true)}
          className="hidden lg:flex items-center gap-1.5 text-sm font-medium text-brand-secondary hover:text-brand-primary border border-brand-secondary/30 hover:border-brand-secondary hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Quick Note
        </button>
      </div>

      <input ref={badgeFileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleBadgeFile(f); e.target.value = ''; }} />
      <input ref={notesFileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleNotesFile(f); e.target.value = ''; }} />

      {showBody && (
        <div className="mt-4 flex-1 min-h-0 flex flex-col overflow-hidden">
          {loading ? (
            <div className="space-y-3 animate-pulse">{[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}</div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <p className="text-sm text-gray-400">Add a note now and assign it later. Quick Notes can only be seen by you until you assign it to an Attendee, Company, and/or Conference record.</p>
              <button type="button" onClick={() => setShowAddModal(true)} className="text-brand-secondary text-sm hover:underline mt-1">Add note →</button>
            </div>
          ) : (
            <div className="relative flex-1 min-h-0 overflow-hidden">
              <div ref={scrollRef} onScroll={checkScroll} className="h-full overflow-y-auto space-y-3 pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {notes.map(note => (
                  <NoteCard key={note.id} note={note} onDelete={handleDelete} onAssign={() => handleAssignNote(note)} onEdit={handleEdit} />
                ))}
              </div>
              {hasMore && (
                <div className="absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-white via-white/70 to-transparent pointer-events-none flex items-end justify-center pb-2">
                  <button type="button" aria-label="Scroll for more notes"
                    className="pointer-events-auto flex items-center justify-center w-7 h-7 rounded-full bg-white shadow-md border border-gray-200 text-gray-400 hover:text-brand-secondary hover:border-brand-secondary transition-colors"
                    onClick={() => scrollRef.current?.scrollBy({ top: 180, behavior: 'smooth' })}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAddModal && <AddNoteModal onClose={() => setShowAddModal(false)} onSave={content => handleSaveNote(content).then(() => {})} />}
      {assigningNote && (
        <AssignNoteModal note={assigningNote} onClose={() => setAssigningNote(null)}
          onAssigned={id => { setNotes(prev => prev.filter(n => n.id !== id)); setAssigningNote(null); }} />
      )}
      {showScanModal && badgeScanCards.length > 0 && (
        <BadgeScanResultsModal cards={badgeScanCards} onClose={() => setShowScanModal(false)}
          onAssignNow={handleScanAssignNow} onAssignLater={handleScanAssignLater} savingId={scanSavingId} />
      )}
      {showBatchModal && (
        <BatchCardScanModal initialCards={batchModalCards} onClose={() => setShowBatchModal(false)} onDone={() => setShowBatchModal(false)} />
      )}
    </div>
  );
}

// Exported for use in FloatingNav
export function QuickNoteInlineModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const res = await fetch('/api/quick-notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      const note = await res.json() as QuickNote;
      window.dispatchEvent(new CustomEvent('quicknote:saved', { detail: note }));
      toast.success('Quick note saved!');
      onClose();
    } else toast.error('Failed to save note.');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-brand-primary font-serif">Quick Note</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Write a quick note…" rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary resize-none"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave(); }} />
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button type="button" onClick={handleSave} disabled={!text.trim() || saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
