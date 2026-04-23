'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { TouchpointMap } from './TouchpointMap';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ConferenceOption { id: number; name: string; start_date: string; }
interface CompanyOption { id: number; name: string; }
interface AttendeeOption {
  id: number; first_name: string; last_name: string;
  title: string | null; company_name: string | null; company_id: number | null;
}

interface TimelineMeeting {
  id: number; meeting_date: string; meeting_time: string;
  location: string | null; scheduled_by: string | null;
  outcome: string | null; meeting_type: string | null;
}
interface TimelineNote { id: number; content: string; created_at: string; rep: string | null; }
interface TimelineFollowUp {
  id: number; next_steps: string | null; assigned_rep: string | null;
  completed: number | null; created_at: string;
}
interface TimelineSocial {
  social_event_id: number; rsvp_status: string;
  event_type: string | null; event_name: string | null; event_date: string | null;
}
interface Touchpoint {
  conference: { id: number; name: string; start_date: string; end_date: string; location: string; };
  details: { action: string | null; notes: string | null; next_steps: string | null; assigned_rep: string | null; completed: number | null; } | null;
  meetings: TimelineMeeting[];
  notes: TimelineNote[];
  followUps: TimelineFollowUp[];
  socialEvents: TimelineSocial[];
  depthScore: number;
}
interface TimelineData {
  attendee: {
    id: number; first_name: string; last_name: string; title: string | null;
    email: string | null; status: string | null; seniority: string | null;
    company_name: string | null; company_type: string | null; icp: string | null; wse: number | null;
  };
  touchpoints: Touchpoint[];
  healthScore: number;
  daysSinceLastTouch: number | null;
  totalTouchpoints: number;
  followUpCompletionRate: number | null;
  loggedTouchpoints: number;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 75) return '#34D399';
  if (s >= 50) return '#f59e0b';
  if (s >= 25) return '#f97316';
  return '#ef4444';
}

function scoreTier(s: number) {
  if (s >= 75) return 'Strong';
  if (s >= 50) return 'Warm';
  if (s >= 25) return 'Cooling';
  return 'Cold';
}

function fmtDateShort(d: string | null | undefined) {
  if (!d) return '—';
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  } catch { return d; }
}

// ── Compact Health Ring ────────────────────────────────────────────────────────

function SmallHealthRing({ score }: { score: number }) {
  const color = scoreColor(score);
  const r = 22; const cx = 28; const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="flex-shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(34,58,94,0.08)" strokeWidth={4} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`} />
      <text x={cx} y={cx - 2} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 11, fill: '#223A5E', fontWeight: 700, fontFamily: 'inherit' }}>{score}</text>
      <text x={cx} y={cx + 10} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 7, fill: '#475569', letterSpacing: 0.5, fontFamily: 'inherit' }}>HLTH</text>
    </svg>
  );
}

// ── Depth Arc (node overlay) ───────────────────────────────────────────────────

function DepthArc({ score, color }: { score: number; color: string }) {
  const r = 14; const cx = 18; const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" className="absolute inset-0 pointer-events-none">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={2.5}
        strokeOpacity={0.55} strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`} />
    </svg>
  );
}

// ── Searchable single-select dropdown ─────────────────────────────────────────

function SearchDropdown<T extends { id: number; name?: string; label?: string }>({
  placeholder, options, selected, onSelect, onClear, loading,
  getLabel,
}: {
  placeholder: string;
  options: T[];
  selected: T | null;
  onSelect: (item: T) => void;
  onClear: () => void;
  loading?: boolean;
  getLabel: (item: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = q.trim()
    ? options.filter(o => getLabel(o).toLowerCase().includes(q.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button type="button"
        onClick={() => { setOpen(v => !v); setQ(''); }}
        className="input-field w-full text-left flex items-center justify-between gap-2 text-sm"
      >
        <span className={selected ? 'text-gray-800 truncate' : 'text-gray-400 truncate'}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {loading && <span className="w-3 h-3 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />}
          {selected && (
            <span onMouseDown={e => { e.stopPropagation(); onClear(); setOpen(false); }}
              className="text-gray-400 hover:text-gray-600 text-xs px-1">✕</span>
          )}
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              className="input-field w-full text-sm" placeholder="Search…" />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0
              ? <div className="px-3 py-2 text-sm text-gray-400">No results</div>
              : filtered.map(o => (
                <button key={o.id} type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selected?.id === o.id ? 'bg-blue-50 text-brand-primary font-medium' : 'text-gray-700'}`}
                  onClick={() => { onSelect(o); setOpen(false); setQ(''); }}>
                  {getLabel(o)}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attendee multiselect dropdown ─────────────────────────────────────────────

const MAX_ATTENDEES = 10;

function AttendeeMultiselect({ options, selected, onToggle, loading, searchValue, onSearchChange }: {
  options: AttendeeOption[];
  selected: AttendeeOption[];
  onToggle: (a: AttendeeOption) => void;
  loading: boolean;
  searchValue: string;
  onSearchChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = searchValue.trim()
    ? options.filter(o =>
        `${o.first_name} ${o.last_name}`.toLowerCase().includes(searchValue.toLowerCase()) ||
        (o.company_name ?? '').toLowerCase().includes(searchValue.toLowerCase())
      )
    : options;

  const selectedIds = new Set(selected.map(a => a.id));

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="input-field w-full text-left flex items-center justify-between gap-2 text-sm min-h-[38px]">
        <span className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selected.length === 0
            ? <span className="text-gray-400">Select attendees…</span>
            : selected.map(a => (
              <span key={a.id} className="inline-flex items-center gap-1 bg-brand-secondary/10 text-brand-primary text-xs px-2 py-0.5 rounded-full">
                {a.first_name} {a.last_name}
                <span onMouseDown={e => { e.stopPropagation(); onToggle(a); }}
                  className="hover:text-red-500 ml-0.5">✕</span>
              </span>
            ))}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {loading && <span className="w-3 h-3 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />}
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[260px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={searchValue} onChange={e => onSearchChange(e.target.value)}
              className="input-field w-full text-sm" placeholder="Search attendees…" />
          </div>
          {selected.length >= MAX_ATTENDEES && (
            <div className="px-3 py-1.5 text-xs text-amber-600 bg-amber-50 border-b border-amber-100">
              Max {MAX_ATTENDEES} attendees selected
            </div>
          )}
          <div className="overflow-y-auto">
            {filtered.length === 0
              ? <div className="px-3 py-2 text-sm text-gray-400">{loading ? 'Loading…' : 'No attendees found'}</div>
              : filtered.map(a => {
                const checked = selectedIds.has(a.id);
                const disabled = !checked && selected.length >= MAX_ATTENDEES;
                return (
                  <button key={a.id} type="button" disabled={disabled}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 disabled:opacity-40 ${checked ? 'bg-blue-50' : ''}`}
                    onClick={() => onToggle(a)}>
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center
                      ${checked ? 'bg-brand-secondary border-brand-secondary' : 'border-gray-300'}`}>
                      {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800 truncate">{a.first_name} {a.last_name}</div>
                      {a.company_name && <div className="text-xs text-gray-400 truncate">{a.company_name}</div>}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Card container with chevron navigation ────────────────────────────────────

function CardCarousel({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [update]);

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {canLeft && (
        <button onClick={() => scroll(-1)} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10
          w-7 h-7 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center
          hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
        {children}
      </div>
      {canRight && (
        <button onClick={() => scroll(1)} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10
          w-7 h-7 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center
          hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── AttendeeCard ───────────────────────────────────────────────────────────────

function AttendeeCard({ data, onRemove }: { data: TimelineData; onRemove: () => void }) {
  const { attendee, touchpoints, healthScore, totalTouchpoints, followUpCompletionRate, loggedTouchpoints } = data;
  const [selectedIdx, setSelectedIdx] = useState<number | null>(touchpoints.length > 0 ? touchpoints.length - 1 : null);
  const [showTpMap, setShowTpMap] = useState(false);
  const tpBtnRef = useRef<HTMLDivElement>(null);
  const hColor = scoreColor(healthScore);
  const selectedTp = selectedIdx !== null ? touchpoints[selectedIdx] ?? null : null;

  const avatarLetter = (attendee.first_name?.[0] ?? '').toUpperCase();

  return (
    <div className="card flex-shrink-0 flex flex-col gap-3 relative" style={{ width: 360, minWidth: 360 }}>
      {/* Remove button */}
      <button onClick={onRemove} className="absolute top-3 right-3 text-gray-300 hover:text-gray-500 transition-colors text-xs">✕</button>

      {/* Header */}
      <div className="flex items-start gap-3 pr-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-primary font-bold font-serif text-lg flex-shrink-0"
          style={{ background: `${hColor}22` }}>
          {avatarLetter}
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/attendees/${attendee.id}`}
            className="font-semibold text-brand-primary hover:text-brand-secondary transition-colors leading-tight block font-serif">
            {attendee.first_name} {attendee.last_name}
          </Link>
          <div className="text-xs text-gray-500 leading-snug mt-0.5">
            {attendee.title && <span>{attendee.title}</span>}
            {attendee.title && attendee.company_name && <span> · </span>}
            {attendee.company_name && (
              <Link href={`/companies`} className="hover:text-brand-secondary transition-colors">
                {attendee.company_name}
              </Link>
            )}
          </div>
        </div>
        <SmallHealthRing score={healthScore} />
      </div>

      {/* Health tier + ICP badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: hColor, background: `${hColor}18`, border: `1px solid ${hColor}35` }}>
          {scoreTier(healthScore)}
        </span>
        {attendee.icp === 'Yes' && (
          <span className="badge-green text-xs px-2 py-0.5">ICP</span>
        )}
        {attendee.status && (
          <span className="badge-gray text-xs px-2 py-0.5">
            {attendee.status.split(',').map(s => s.trim()).join(', ')}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg p-2 text-center" style={{ background: '#F1F5F9', border: '1px solid rgba(34,58,94,0.07)' }}>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">Conferences</div>
          <div className="text-base font-bold font-serif leading-none mt-0.5" style={{ color: '#223A5E' }}>{totalTouchpoints}</div>
        </div>
        <div ref={tpBtnRef} className="relative">
          <button
            type="button"
            onClick={() => setShowTpMap(prev => !prev)}
            className="w-full rounded-lg p-2 text-center hover:bg-blue-50 transition-colors cursor-pointer"
            style={{ background: '#F1F5F9', border: '1px solid rgba(34,58,94,0.07)' }}
          >
            <div className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">Touchpoints</div>
            <div className="text-base font-bold font-serif leading-none mt-0.5" style={{ color: '#223A5E' }}>{loggedTouchpoints}</div>
          </button>
          <TouchpointMap
            attendeeId={attendee.id}
            open={showTpMap}
            onClose={() => setShowTpMap(false)}
            anchorRef={tpBtnRef as React.RefObject<HTMLElement>}
          />
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: '#F1F5F9', border: '1px solid rgba(34,58,94,0.07)' }}>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">Follow-ups</div>
          <div className="text-base font-bold font-serif leading-none mt-0.5" style={{ color: '#223A5E' }}>{followUpCompletionRate !== null ? `${followUpCompletionRate}%` : '—'}</div>
        </div>
      </div>

      {/* Timeline nodes */}
      {touchpoints.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2">Conference History</div>
          <div className="flex items-center gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {touchpoints.map((tp, i) => {
              const isActive = selectedIdx === i;
              const dColor = scoreColor(tp.depthScore);
              const hasMeeting = tp.meetings.length > 0;
              const hasSocial = tp.socialEvents.some(e => e.rsvp_status === 'attending');
              return (
                <div key={tp.conference.id} className="flex items-center">
                  {i > 0 && <div className="w-3 h-px bg-gray-200 flex-shrink-0" />}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <button onClick={() => setSelectedIdx(isActive ? null : i)}
                      className="relative w-9 h-9 rounded-full flex items-center justify-center transition-all"
                      style={{
                        background: isActive ? `${dColor}14` : '#F1F5F9',
                        border: `2px solid ${isActive ? dColor : 'rgba(34,58,94,0.14)'}`,
                        boxShadow: isActive ? `0 0 10px ${dColor}44` : '0 1px 3px rgba(34,58,94,0.07)',
                      }}>
                      <DepthArc score={tp.depthScore} color={dColor} />
                      <span className="text-[10px] font-bold relative z-10" style={{ color: isActive ? dColor : '#3A506B' }}>
                        {tp.depthScore}
                      </span>
                      {hasMeeting && <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-brand-primary border border-white" />}
                      {hasSocial && <div className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-white" />}
                    </button>
                    <div className="text-[9px] text-gray-400 text-center max-w-[56px] leading-tight">
                      <div>{fmtDateShort(tp.conference.start_date)}</div>
                      <div className="text-gray-400 break-words leading-tight" style={{ fontSize: 8 }}>
                        {tp.conference.name}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-400 text-center py-4">No conference history</div>
      )}

      {/* Detail panel */}
      {selectedTp && <CardDetail tp={selectedTp} />}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RelationshipTimeline() {
  const [allConferences, setAllConferences] = useState<ConferenceOption[]>([]);
  const [allCompanies, setAllCompanies] = useState<CompanyOption[]>([]);
  const [attendeeOptions, setAttendeeOptions] = useState<AttendeeOption[]>([]);
  const [selectedConference, setSelectedConference] = useState<ConferenceOption | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption | null>(null);
  const [selectedAttendees, setSelectedAttendees] = useState<AttendeeOption[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeeOptionsLoading, setAttendeeOptionsLoading] = useState(false);
  const [cardDataMap, setCardDataMap] = useState<Record<number, TimelineData>>({});
  const [loadingCards, setLoadingCards] = useState<Set<number>>(new Set());

  // Load conferences + companies on mount
  useEffect(() => {
    fetch('/api/conferences?nav=1').then(r => r.ok ? r.json() : [])
      .then((rows: ConferenceOption[]) => setAllConferences(rows));
    fetch('/api/companies?minimal=1').then(r => r.ok ? r.json() : [])
      .then((rows: Array<{ id: number; name: string }>) => setAllCompanies(rows));
  }, []);

  // Load attendee options when conference/company/search changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedConference) params.set('conference_id', String(selectedConference.id));
    if (selectedCompany) params.set('company_id', String(selectedCompany.id));
    if (attendeeSearch.trim()) params.set('search', attendeeSearch.trim());
    params.set('limit', '50');
    setAttendeeOptionsLoading(true);
    fetch(`/api/attendees?${params.toString()}`).then(r => r.ok ? r.json() : [])
      .then((rows: Array<Record<string, unknown>>) => setAttendeeOptions(rows.map(r => ({
        id: Number(r.id), first_name: String(r.first_name ?? ''), last_name: String(r.last_name ?? ''),
        title: r.title ? String(r.title) : null,
        company_name: r.company_name ? String(r.company_name) : null,
        company_id: r.company_id ? Number(r.company_id) : null,
      }))))
      .catch(() => setAttendeeOptions([]))
      .finally(() => setAttendeeOptionsLoading(false));
  }, [selectedConference, selectedCompany, attendeeSearch]);

  // Load timeline data for newly selected attendees
  useEffect(() => {
    for (const a of selectedAttendees) {
      if (cardDataMap[a.id] || loadingCards.has(a.id)) continue;
      setLoadingCards(prev => new Set(prev).add(a.id));
      fetch(`/api/attendees/${a.id}/timeline`).then(r => r.ok ? r.json() : null)
        .then((d: TimelineData | null) => {
          if (d) setCardDataMap(prev => ({ ...prev, [a.id]: d }));
        })
        .finally(() => setLoadingCards(prev => { const n = new Set(prev); n.delete(a.id); return n; }));
    }
  }, [selectedAttendees, cardDataMap, loadingCards]);

  const toggleAttendee = useCallback((a: AttendeeOption) => {
    setSelectedAttendees(prev => {
      const exists = prev.find(x => x.id === a.id);
      if (exists) return prev.filter(x => x.id !== a.id);
      if (prev.length >= MAX_ATTENDEES) return prev;
      return [...prev, a];
    });
  }, []);

  const removeAttendee = useCallback((id: number) => {
    setSelectedAttendees(prev => prev.filter(a => a.id !== id));
  }, []);

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 min-w-0">
          <label className="label text-xs">Conference</label>
          <SearchDropdown
            placeholder="All conferences"
            options={allConferences}
            selected={selectedConference}
            onSelect={setSelectedConference}
            onClear={() => setSelectedConference(null)}
            getLabel={c => c.name}
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="label text-xs">Company</label>
          <SearchDropdown
            placeholder="All companies"
            options={allCompanies}
            selected={selectedCompany}
            onSelect={setSelectedCompany}
            onClear={() => setSelectedCompany(null)}
            getLabel={c => c.name}
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="label text-xs">Attendees <span className="text-gray-400 font-normal">(up to {MAX_ATTENDEES})</span></label>
          <AttendeeMultiselect
            options={attendeeOptions}
            selected={selectedAttendees}
            onToggle={toggleAttendee}
            loading={attendeeOptionsLoading}
            searchValue={attendeeSearch}
            onSearchChange={setAttendeeSearch}
          />
        </div>
      </div>

      {/* Cards */}
      {selectedAttendees.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">
          Select one or more attendees above to view their relationship timelines.
        </div>
      ) : (
        <CardCarousel>
          {selectedAttendees.map(a => {
            const data = cardDataMap[a.id];
            const isLoading = loadingCards.has(a.id);
            if (isLoading || !data) {
              return (
                <div key={a.id} className="card flex-shrink-0 flex items-center justify-center" style={{ width: 360, minWidth: 360, minHeight: 200 }}>
                  <div className="animate-spin w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full" />
                </div>
              );
            }
            return <AttendeeCard key={a.id} data={data} onRemove={() => removeAttendee(a.id)} />;
          })}
        </CardCarousel>
      )}
    </div>
  );
}

// ── Card detail panel ──────────────────────────────────────────────────────────

function ExpandableNote({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 120;
  const isLong = content.length > LIMIT;
  return (
    <div className="py-1 border-t border-gray-100">
      <div className="text-gray-600 leading-relaxed text-xs">
        {expanded || !isLong ? content : `${content.slice(0, LIMIT).trimEnd()}…`}
      </div>
      {isLong && (
        <button onClick={() => setExpanded(v => !v)}
          className="text-brand-secondary text-[10px] font-medium mt-0.5 hover:underline">
          {expanded ? 'Show less' : 'See more'}
        </button>
      )}
    </div>
  );
}

function CardDetail({ tp }: { tp: Touchpoint }) {
  const dColor = scoreColor(tp.depthScore);
  const attending = tp.socialEvents.filter(e => e.rsvp_status === 'attending');

  return (
    <div className="rounded-lg p-3 space-y-2 border border-gray-100 bg-gray-50 text-xs">
      {/* Conference name + depth */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={`/conferences/${tp.conference.id}`}
            className="font-semibold text-brand-primary hover:text-brand-secondary transition-colors leading-tight block font-serif text-sm">
            {tp.conference.name}
          </Link>
          <div className="text-[10px] text-gray-400 mt-0.5">{tp.conference.location} · {fmtDateShort(tp.conference.start_date)}</div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ color: dColor, background: `${dColor}18`, border: `1px solid ${dColor}35` }}>
          {tp.depthScore}
        </span>
      </div>

      {/* Meetings */}
      {tp.meetings.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">Meetings</div>
          {tp.meetings.map(m => (
            <div key={m.id} className="flex items-center gap-1.5 py-1 border-t border-gray-100">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0" />
              <span className="font-medium text-gray-700">{m.meeting_type || 'Meeting'}</span>
              {m.outcome && <span className="text-gray-400 truncate">— {m.outcome}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Social events */}
      {attending.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">Events</div>
          {attending.map(e => (
            <div key={e.social_event_id} className="flex items-center gap-1.5 py-1 border-t border-gray-100">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span className="font-medium text-gray-700">{e.event_name || e.event_type || 'Social Event'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {tp.notes.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">Notes</div>
          {tp.notes.map(n => (
            <ExpandableNote key={n.id} content={n.content} />
          ))}
        </div>
      )}

      {/* Follow-ups */}
      {tp.followUps.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">Follow-ups</div>
          {tp.followUps.map(f => (
            <div key={f.id} className="flex items-center gap-1.5 py-1 border-t border-gray-100">
              <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${f.completed ? 'bg-emerald-400 border-emerald-400' : 'border-gray-300'}`}>
                {f.completed ? <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : null}
              </div>
              <span className={`truncate ${f.completed ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>{f.next_steps || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
