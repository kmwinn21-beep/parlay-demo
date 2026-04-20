'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

interface QuickNote {
  id: number;
  content: string;
  created_at: string;
  created_by: string | null;
}

interface Conference { id: number; name: string; }
interface Company { id: number; name: string; }
interface Attendee { id: number; first_name: string; last_name: string; company_id?: number | null; company_name?: string | null; }

function fmtDate(dateStr: string) {
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return dateStr; }
}

// ── Searchable dropdown ──────────────────────────────────────────────────────
function SearchableSelect<T extends { id: number }>({
  options,
  value,
  onChange,
  getLabel,
  placeholder,
  disabled,
}: {
  options: T[];
  value: T | null;
  onChange: (v: T | null) => void;
  getLabel: (v: T) => string;
  placeholder: string;
  disabled?: boolean;
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
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(v => !v); setSearch(''); }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-procare-bright-blue transition-colors bg-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>{value ? getLabel(value) : placeholder}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange(null); }}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </span>
          )}
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-procare-bright-blue"
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
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-procare-bright-blue transition-colors ${value?.id === o.id ? 'bg-blue-50 text-procare-bright-blue font-medium' : 'text-gray-700'}`}
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
          <h3 className="text-base font-semibold text-procare-dark-blue font-serif">Quick Note</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write your note here…"
          rows={5}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-procare-bright-blue resize-none"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave(); }}
        />
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

  // Conf-attendee cross-reference: conference_id → Set<attendee_id>
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
              id: a.id,
              first_name: a.first_name,
              last_name: a.last_name,
              company_id: a.company_id ?? null,
              company_name: a.company_name ?? null,
            }))
          : [];
        setConferences(confs);
        setAllCompanies(comps);
        setAllAttendees(atts);
        setFilteredConferences(confs);
        setFilteredCompanies(comps);
        setFilteredAttendees(atts);

        // Build conf→attendee map
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
    setSelConference(conf);
    setSelAttendee(null);
    if (!conf) {
      // Reset filters unless company is selected
      const compFilter = selCompany;
      if (compFilter) {
        setFilteredAttendees(allAttendees.filter(a => a.company_id === compFilter.id));
      } else {
        setFilteredAttendees(allAttendees);
        setFilteredCompanies(allCompanies);
      }
      return;
    }
    const attIds = confAttendeesRef.current.get(conf.id) ?? new Set<number>();
    const confAtts = allAttendees.filter(a => attIds.has(a.id));
    const companyIds = new Set(confAtts.map(a => a.company_id).filter(Boolean));
    setFilteredAttendees(confAtts);
    if (!selCompany) setFilteredCompanies(allCompanies.filter(c => companyIds.has(c.id)));
  }, [selCompany, allAttendees, allCompanies]);

  const handleCompanyChange = useCallback((comp: Company | null) => {
    setSelCompany(comp);
    setSelAttendee(null);
    if (!comp) {
      if (selConference) {
        const attIds = confAttendeesRef.current.get(selConference.id) ?? new Set<number>();
        setFilteredAttendees(allAttendees.filter(a => attIds.has(a.id)));
        const compIds = new Set(allAttendees.filter(a => attIds.has(a.id)).map(a => a.company_id).filter(Boolean));
        setFilteredCompanies(allCompanies.filter(c => compIds.has(c.id)));
      } else {
        setFilteredAttendees(allAttendees);
        setFilteredCompanies(allCompanies);
      }
      return;
    }
    const compAtts = allAttendees.filter(a => a.company_id === comp.id);
    setFilteredAttendees(selConference
      ? compAtts.filter(a => (confAttendeesRef.current.get(selConference.id) ?? new Set()).has(a.id))
      : compAtts
    );
    // Filter conferences to those with attendees from this company
    if (!selConference && confAttendeesRef.current.size > 0) {
      const confIds = new Set<number>();
      confAttendeesRef.current.forEach((attIds, confId) => {
        if (compAtts.some(a => attIds.has(a.id))) confIds.add(confId);
      });
      setFilteredConferences(conferences.filter(c => confIds.has(c.id)));
    }
  }, [selConference, allAttendees, allCompanies, conferences]);

  const handleAttendeeChange = useCallback((att: Attendee | null) => {
    setSelAttendee(att);
    if (!att) return;
    // Auto-set company if not already set
    if (!selCompany && att.company_id) {
      const comp = allCompanies.find(c => c.id === att.company_id) ?? null;
      if (comp) {
        setSelCompany(comp);
        setFilteredCompanies([comp]);
      }
    }
    // Filter conferences to those this attendee is in
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conference_id: selConference?.id ?? null,
          company_id: selCompany?.id ?? null,
          attendee_id: selAttendee?.id ?? null,
          conference_name: selConference?.name ?? null,
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
          <h3 className="text-base font-semibold text-procare-dark-blue font-serif">Assign Note</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 line-clamp-3">{note.content}</p>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-procare-bright-blue border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Conference</label>
                <SearchableSelect
                  options={filteredConferences}
                  value={selConference}
                  onChange={handleConferenceChange}
                  getLabel={c => c.name}
                  placeholder="Select a conference…"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Company</label>
                <SearchableSelect
                  options={filteredCompanies}
                  value={selCompany}
                  onChange={handleCompanyChange}
                  getLabel={c => c.name}
                  placeholder="Select a company…"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Attendee</label>
                <SearchableSelect
                  options={filteredAttendees}
                  value={selAttendee}
                  onChange={handleAttendeeChange}
                  getLabel={a => `${a.first_name} ${a.last_name}`}
                  placeholder="Select an attendee…"
                />
              </div>
              {selConference || selCompany || selAttendee ? (
                <p className="text-xs text-gray-400">Note will be saved to the selected record(s) and removed from Quick Notes.</p>
              ) : (
                <p className="text-xs text-amber-600">Select at least one conference, company, or attendee.</p>
              )}
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
function NoteCard({ note, onDelete, onAssign }: { note: QuickNote; onDelete: (id: number) => void; onAssign: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = note.content.length > 200;

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-xs text-gray-400">{fmtDate(note.created_at)}{note.created_by && ` · ${note.created_by.split('@')[0]}`}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onAssign}
            className="flex items-center gap-1.5 text-xs font-medium text-procare-bright-blue hover:text-procare-dark-blue border border-procare-bright-blue/30 hover:border-procare-bright-blue px-2.5 py-1 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" /></svg>
            Assign Note
          </button>
          <button
            type="button"
            onClick={() => onDelete(note.id)}
            className="text-gray-300 hover:text-red-400 transition-colors p-1 rounded"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
      <p className={`text-sm text-gray-700 whitespace-pre-wrap leading-relaxed ${!expanded && isLong ? 'line-clamp-4' : ''}`}>
        {note.content}
      </p>
      {isLong && (
        <button type="button" onClick={() => setExpanded(v => !v)} className="text-xs text-procare-bright-blue hover:underline mt-1.5">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

// ── Main QuickNotesSection ────────────────────────────────────────────────────
export function QuickNotesSection() {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [assigningNote, setAssigningNote] = useState<QuickNote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/quick-notes')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setNotes(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Optimistically prepend notes saved from FloatingNav's inline modal
  useEffect(() => {
    const handler = (e: Event) => {
      const note = (e as CustomEvent<QuickNote>).detail;
      setNotes(prev => prev.some(n => n.id === note.id) ? prev : [note, ...prev]);
      setExpanded(true);
    };
    window.addEventListener('quicknote:saved', handler);
    return () => window.removeEventListener('quicknote:saved', handler);
  }, []);

  const handleSaveNote = async (content: string) => {
    const res = await fetch('/api/quick-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const note = await res.json() as QuickNote;
      setNotes(prev => [note, ...prev]);
      setShowAddModal(false);
      setExpanded(true);
      toast.success('Note saved!');
    } else {
      toast.error('Failed to save note.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this quick note? This cannot be undone.')) return;
    const res = await fetch(`/api/quick-notes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setNotes(prev => prev.filter(n => n.id !== id));
    } else {
      toast.error('Failed to delete note.');
    }
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 text-left group"
        >
          <svg className="w-5 h-5 text-procare-bright-blue flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="text-lg font-semibold text-procare-dark-blue font-serif group-hover:text-procare-bright-blue transition-colors">
            Quick Notes
          </span>
          {notes.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-procare-bright-blue text-white text-[10px] font-bold leading-none">
              {notes.length}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-procare-bright-blue hover:text-procare-dark-blue border border-procare-bright-blue/30 hover:border-procare-bright-blue hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Quick Note
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="mt-4">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <p className="text-sm text-gray-400">Add a note now and assign it later.</p>
              <button type="button" onClick={() => setShowAddModal(true)} className="text-procare-bright-blue text-sm hover:underline mt-1">
                Add note →
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {notes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onDelete={handleDelete}
                  onAssign={() => setAssigningNote(note)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showAddModal && <AddNoteModal onClose={() => setShowAddModal(false)} onSave={handleSaveNote} />}
      {assigningNote && (
        <AssignNoteModal
          note={assigningNote}
          onClose={() => setAssigningNote(null)}
          onAssigned={id => { setNotes(prev => prev.filter(n => n.id !== id)); setAssigningNote(null); }}
        />
      )}
    </div>
  );
}

// Exported for use in FloatingNav (minimal inline quick-note form)
export function QuickNoteInlineModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const res = await fetch('/api/quick-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      const note = await res.json() as QuickNote;
      window.dispatchEvent(new CustomEvent('quicknote:saved', { detail: note }));
      toast.success('Quick note saved!');
      onClose();
    } else {
      toast.error('Failed to save note.');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-procare-dark-blue font-serif">Quick Note</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write a quick note…"
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-procare-bright-blue resize-none"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave(); }}
        />
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
