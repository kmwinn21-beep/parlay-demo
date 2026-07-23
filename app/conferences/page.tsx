'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BackButton } from '@/components/BackButton';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { ConferenceStageBadge } from '@/components/ConferenceStageBadge';
import { ConferenceKanbanBoard } from '@/components/ConferenceKanbanBoard';
import { ProgramConferenceCard, RepAvatarStack, TerritoryPill, ListStatusPill, type ProgramCardConference } from '@/components/ProgramConferenceCard';
import { computeConferenceStage, postConferenceDaysRemaining, type ConferenceStage } from '@/lib/conference-stage';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes?: string;
  internal_attendees?: string;
  created_at: string;
  attendee_count: number;
  is_historical?: number | null;
  post_conference_days?: number | null;
  stage_override?: string | null;
  series_id?: string | null;
  series_name?: string | null;
}

// Enriched shape returned by GET /api/conferences?enriched=1 — only used by
// the Program tab. Extends the base row with everything ProgramConferenceCard
// needs; ConferenceStage import above is reused so this stays in sync with
// the lib source of truth rather than redeclaring the union.
interface EnrichedConference extends ProgramCardConference {
  stage: ConferenceStage | null;
}

interface NeedsAttentionItem {
  type: 'missing_list' | 'unassigned_reps' | 'outreach_gap';
  conferenceId: number;
  conferenceName: string;
  message: string;
  urgency: 'high' | 'medium' | 'low';
  daysUntil: number | null;
}

interface TerritoryOption {
  id: number;
  name: string;
  color: string;
  assignedUserIds: number[];
}

function iconForAttentionType(type: NeedsAttentionItem['type']): string {
  if (type === 'missing_list') return 'ti-users';
  if (type === 'unassigned_reps') return 'ti-user-plus';
  if (type === 'outreach_gap') return 'ti-mail';
  return 'ti-alert-circle';
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.substring(0, 2).toUpperCase() || '';
}

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function parseLocation(loc: string): { city: string; state: string } {
  const p = loc.split(',').map((s) => s.trim());
  if (p.length >= 3) return { city: p[p.length - 2], state: p[p.length - 1] };
  if (p.length === 2) return { city: p[0], state: p[1] };
  return { city: loc, state: '' };
}

function addMonths(year: number, month: number, offset: number): [number, number] {
  let m = month + offset, y = year;
  while (m < 0)  { m += 12; y--; }
  while (m > 11) { m -= 12; y++; }
  return [y, m];
}

function cmpYM(a: [number, number], b: [number, number]) {
  return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];
}

function toYM(d: string): [number, number] {
  const dt = new Date(d + 'T00:00:00');
  return [dt.getFullYear(), dt.getMonth()];
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function mFirst(y: number, m: number) { return `${y}-${pad2(m + 1)}-01`; }
function mLast(y: number, m: number) {
  return `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`;
}
function buildDS(y: number, m: number, d: number) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

function localDateStr(dt: Date) {
  return buildDS(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function confDatesInMonth(confs: Conference[], y: number, m: number): Set<string> {
  const set = new Set<string>();
  const first = mFirst(y, m), last = mLast(y, m);
  for (const c of confs) {
    const effEnd = c.end_date || c.start_date;
    if (c.start_date > last || effEnd < first) continue;
    const os = c.start_date < first ? first : c.start_date;
    const oe = effEnd > last ? last : effEnd;
    const dt = new Date(os + 'T00:00:00'), end = new Date(oe + 'T00:00:00');
    while (dt <= end) { set.add(localDateStr(dt)); dt.setDate(dt.getDate() + 1); }
  }
  return set;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function getConfStage(conf: Conference) {
  if (conf.is_historical) return null;
  try {
    return computeConferenceStage({
      start_date: conf.start_date,
      end_date: conf.end_date,
      post_conference_days: conf.post_conference_days ?? null,
      stage_override: conf.stage_override ?? null,
    });
  } catch {
    return null;
  }
}

function ConferenceCard({ conf }: { conf: Conference }) {
  const router = useRouter();
  const stage = getConfStage(conf);
  const daysRemaining = stage === 'post_conference'
    ? postConferenceDaysRemaining({ end_date: conf.end_date, post_conference_days: conf.post_conference_days ?? null })
    : undefined;

  return (
    <Link
      href={`/conferences/${conf.id}`}
      className="card p-3 hover:shadow-md transition-all hover:border-brand-secondary border border-transparent group flex flex-col"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <h4 className="text-md font-semibold text-brand-primary group-hover:text-brand-secondary font-serif leading-snug line-clamp-2">
              {conf.name}
            </h4>
            {stage && <ConferenceStageBadge stage={stage} daysRemaining={daysRemaining} />}
          </div>
          <div className="mt-1.5 space-y-0.5">
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span className="truncate">
                {formatDate(conf.start_date)}
                {conf.end_date && conf.end_date !== conf.start_date ? ` – ${formatDate(conf.end_date)}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span className="truncate">{conf.location}</span>
            </div>
            {conf.series_id && conf.series_name && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/conference-series/${conf.series_id}`); }}
                  className="text-xs text-brand-secondary hover:underline"
                >
                  Part of {conf.series_name}
                </button>
              </div>
            )}
          </div>
          {conf.internal_attendees && (
            <div className="flex flex-wrap gap-1 mt-3">
              {conf.internal_attendees.split(',').filter(Boolean).map((u, i) => (
                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-gray-300 bg-gray-50 text-xs text-gray-600">
                  {getInitials(u.trim())}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          {conf.attendee_count === 0 ? (
            <div className="flex flex-col items-center px-1.5 py-1 min-w-[44px]">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z"/>
              </svg>
              <p className="text-[9px] text-amber-600 font-medium text-center leading-tight mt-0.5">Awaiting</p>
            </div>
          ) : (
            <div className="text-brand-primary rounded-xl px-2 py-1.5 text-center min-w-[44px]">
              <p className="text-base font-bold font-serif leading-none">{conf.attendee_count}</p>
              <p className="text-[9px] text-brand-primary leading-none mt-0.5">attend.</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function MonthCalendar({ year, month, dates, selected, onPick, today }: {
  year: number; month: number; dates: Set<string>;
  selected: string | null; onPick: (d: string) => void; today: string;
}) {
  const fdow = new Date(year, month, 1).getDay();
  const dim  = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < fdow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xl font-semibold text-brand-primary text-center mb-2 font-serif">
        {MONTH_NAMES[month]} {year}
      </p>
      <div className="grid grid-cols-7">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1 select-none">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const ds = buildDS(year, month, day);
          const isConf = dates.has(ds), isSel = selected === ds, isToday = ds === today;
          return (
            <div key={ds} className="flex items-center justify-center py-0.5">
              <button
                type="button"
                onClick={() => isConf && onPick(ds)}
                disabled={!isConf}
                className={[
                  'w-7 h-7 rounded-full text-xs font-medium transition-colors flex items-center justify-center select-none',
                  isSel   ? 'bg-brand-primary text-white' :
                  isConf  ? 'bg-brand-secondary/20 text-brand-primary hover:bg-brand-secondary hover:text-white cursor-pointer' :
                  isToday ? 'border border-brand-secondary text-brand-secondary cursor-default' :
                            'text-gray-500 cursor-default',
                ].join(' ')}
              >{day}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function ConferencesPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = searchParams.get('view') ?? 'program';
  const now          = new Date();
  const todayStr     = buildDS(now.getFullYear(), now.getMonth(), now.getDate());
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  // Data
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [isLoading, setIsLoading]     = useState(true);

  // Program tab — separate data source (?enriched=1), fetched lazily on first
  // activation and cached; the Calendar/By Stage views keep using the plain
  // `conferences` state above untouched.
  const [programConfs, setProgramConfs]           = useState<EnrichedConference[]>([]);
  const [needsAttention, setNeedsAttention]        = useState<NeedsAttentionItem[]>([]);
  const [programLoaded, setProgramLoaded]          = useState(false);
  const [programLoading, setProgramLoading]        = useState(false);
  const [territories, setTerritories]              = useState<TerritoryOption[]>([]);
  const [territoriesLoaded, setTerritoriesLoaded]  = useState(false);
  const [programToggle, setProgramToggle]          = useState<'upcoming' | 'active' | 'past'>('upcoming');
  const [programRepFilter, setProgramRepFilter]           = useState<string>('');
  const [programTerritoryFilter, setProgramTerritoryFilter] = useState<string>('');
  const [programYearFilter, setProgramYearFilter]  = useState<string>('');
  const [showAllAttention, setShowAllAttention]    = useState(false);
  const [programLayout, setProgramLayout]          = useState<'grid' | 'list'>('grid');

  // Read the stored layout preference on mount only (SSR-safe — localStorage
  // isn't available during server render, so this can't run in the initial
  // useState initializer).
  useEffect(() => {
    const stored = localStorage.getItem('parlay-conferences-layout');
    if (stored === 'grid' || stored === 'list') setProgramLayout(stored);
  }, []);

  useEffect(() => {
    if (view !== 'program' || programLoaded) return;
    setProgramLoading(true);
    fetch('/api/conferences?enriched=1')
      .then(r => r.json())
      .then((data: { conferences: EnrichedConference[]; needsAttention: NeedsAttentionItem[] }) => {
        setProgramConfs(data.conferences ?? []);
        setNeedsAttention(data.needsAttention ?? []);
        setProgramLoaded(true);
      })
      .finally(() => setProgramLoading(false));
  }, [view, programLoaded]);

  useEffect(() => {
    if (view !== 'program' || territoriesLoaded) return;
    fetch('/api/admin/territories')
      .then(r => r.ok ? r.json() : { territories: [] })
      .then((data: { territories: TerritoryOption[] }) => {
        setTerritories(data.territories ?? []);
        setTerritoriesLoaded(true);
      })
      .catch(() => setTerritoriesLoaded(true));
  }, [view, territoriesLoaded]);

  // Filter pane
  const [filtersOpen, setFiltersOpen]                         = useState(false);
  const [filterYear, setFilterYear]                           = useState('');
  const [filterMonth, setFilterMonth]                         = useState('');
  const [filterCity, setFilterCity]                           = useState('');
  const [filterState, setFilterState]                         = useState('');
  const [filterDateFrom, setFilterDateFrom]                   = useState('');
  const [filterDateTo, setFilterDateTo]                       = useState('');
  const [filterInternalAttendees, setFilterInternalAttendees] = useState<string[]>([]);
  const [filterStage, setFilterStage]                         = useState('');

  // Calendar
  const [calExpanded, setCalExpanded] = useState<boolean | null>(null);
  const [calAnchor, setCalAnchor]     = useState<[number, number]>([currentYear, currentMonth]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Month section expand state; key = "Y-M" (0-based month)
  const [monthExpanded, setMonthExpanded] = useState<Record<string, boolean>>({});

  // Responsive: track mobile breakpoint for calendar bounds
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Init: detect desktop vs mobile for calendar default
  useEffect(() => { setCalExpanded(window.innerWidth >= 1024); }, []);

  // Load conferences
  useEffect(() => {
    fetch('/api/conferences')
      .then((r) => r.json())
      .then((data: Conference[]) => {
        const sorted = [...data].sort((a, b) => a.start_date.localeCompare(b.start_date));
        setConferences(sorted);
        if (sorted.length === 0) return;
        const minYM     = toYM(sorted[0].start_date);
        const maxEndYM  = toYM(sorted[sorted.length - 1].end_date);
        const isMobileNow = window.innerWidth < 1024;
        const maxAnchor = addMonths(maxEndYM[0], maxEndYM[1], isMobileNow ? 0 : -2);
        let [y, m] = [currentYear, currentMonth];
        if (cmpYM([y, m], minYM)     < 0) [y, m] = minYM;
        if (cmpYM([y, m], maxAnchor) > 0) [y, m] = maxAnchor;
        setCalAnchor([y, m]);
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived filter options
  const years  = useMemo(() => Array.from(new Set(conferences.map((c) => new Date(c.start_date + 'T00:00:00').getFullYear().toString()))).sort((a, b) => Number(b) - Number(a)), [conferences]);
  const cities = useMemo(() => Array.from(new Set(conferences.map((c) => parseLocation(c.location).city).filter(Boolean))).sort(), [conferences]);
  const states = useMemo(() => Array.from(new Set(conferences.map((c) => parseLocation(c.location).state).filter(Boolean))).sort(), [conferences]);
  const internalAttendeeOptions = useMemo(() => {
    const s = new Set<string>();
    conferences.forEach((c) => (c.internal_attendees || '').split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => s.add(v)));
    return Array.from(s).sort();
  }, [conferences]);

  // ── Program tab derived state ──────────────────────────────────────────────
  const programRepOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of programConfs) for (const rep of c.assignedReps) map.set(rep.userId, rep.displayName);
    return Array.from(map.entries()).map(([userId, displayName]) => ({ userId, displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [programConfs]);

  const programYearOptions = useMemo(
    () => Array.from(new Set(programConfs.map(c => new Date(c.start_date + 'T00:00:00').getFullYear().toString()))).sort((a, b) => Number(b) - Number(a)),
    [programConfs]
  );

  const programStageFiltered = useMemo(() => {
    let list = programConfs.filter(c => {
      if (programToggle === 'upcoming') return c.stage === 'planning';
      if (programToggle === 'active') return c.stage === 'in_progress' || c.stage === 'post_conference';
      return c.stage === 'closed';
    });
    if (programYearFilter) {
      list = list.filter(c => new Date(c.start_date + 'T00:00:00').getFullYear().toString() === programYearFilter);
    }
    if (programRepFilter) {
      const repId = Number(programRepFilter);
      list = list.filter(c => c.assignedReps.some(r => r.userId === repId));
    }
    if (programTerritoryFilter) {
      const territory = territories.find(t => String(t.id) === programTerritoryFilter);
      if (territory) {
        list = list.filter(c => c.assignedReps.some(r => territory.assignedUserIds.includes(r.userId)));
      }
    }
    // Upcoming: soonest first (fewest days remaining -> most), left to right.
    if (programToggle === 'upcoming') {
      list = [...list].sort((a, b) => a.start_date.localeCompare(b.start_date));
    }
    return list;
  }, [programConfs, programToggle, programYearFilter, programRepFilter, programTerritoryFilter, territories]);

  const programCounts = useMemo(() => ({
    upcoming: programConfs.filter(c => c.stage === 'planning').length,
    active: programConfs.filter(c => c.stage === 'in_progress' || c.stage === 'post_conference').length,
    past: programConfs.filter(c => c.stage === 'closed').length,
  }), [programConfs]);

  const visibleAttention = showAllAttention ? needsAttention : needsAttention.slice(0, 4);

  const programAllConferencesForConflicts = useMemo(
    () => programConfs.map(c => ({ conferenceId: c.id, name: c.name, startDate: c.start_date, assignedReps: c.assignedReps })),
    [programConfs]
  );

  const handleProgramRepsUpdated = (conferenceId: number, reps: EnrichedConference['assignedReps']) => {
    setProgramConfs(prev => prev.map(c => c.id === conferenceId ? { ...c, assignedReps: reps } : c));
  };

  // Calendar derived
  const calMonths  = useMemo(() => ([0, 1, 2] as const).map((o) => addMonths(calAnchor[0], calAnchor[1], o)), [calAnchor]);
  const windowStart = useMemo(() => mFirst(calMonths[0][0], calMonths[0][1]), [calMonths]);
  const windowEnd   = useMemo(() => mLast(calMonths[2][0], calMonths[2][1]),  [calMonths]);

  const [calMinYM, calMaxYM] = useMemo((): [[number, number] | null, [number, number] | null] => {
    if (!conferences.length) return [null, null];
    let mn: [number, number] | null = null, mx: [number, number] | null = null;
    for (const c of conferences) {
      const s = toYM(c.start_date), e = toYM(c.end_date);
      if (!mn || cmpYM(s, mn) < 0) mn = s;
      if (!mx || cmpYM(e, mx) > 0) mx = e;
    }
    return [mn, mx ? addMonths(mx[0], mx[1], isMobile ? 0 : -2) : null];
  }, [conferences, isMobile]);

  const canGoLeft  = calMinYM ? cmpYM(calAnchor, calMinYM) > 0 : false;
  const canGoRight = calMaxYM ? cmpYM(calAnchor, calMaxYM) < 0 : false;

  const handleCalLeft  = () => { if (canGoLeft)  { setCalAnchor((a) => addMonths(a[0], a[1], -1)); setSelectedDate(null); } };
  const handleCalRight = () => { if (canGoRight) { setCalAnchor((a) => addMonths(a[0], a[1],  1)); setSelectedDate(null); } };
  const handleDatePick = (ds: string) => setSelectedDate((p) => (p === ds ? null : ds));

  // Filtered conference list
  const filteredConferences = useMemo(() => conferences.filter((c) => {
    if (c.start_date > windowEnd   || c.end_date < windowStart)    return false;
    if (filterYear  && new Date(c.start_date + 'T00:00:00').getFullYear().toString() !== filterYear)  return false;
    if (filterMonth && (new Date(c.start_date + 'T00:00:00').getMonth() + 1).toString() !== filterMonth) return false;
    const { city, state } = parseLocation(c.location);
    if (filterCity  && city.toLowerCase()  !== filterCity.toLowerCase())  return false;
    if (filterState && state.toLowerCase() !== filterState.toLowerCase()) return false;
    if (filterDateFrom || filterDateTo) {
      const sIn = (!filterDateFrom || c.start_date >= filterDateFrom) && (!filterDateTo || c.start_date <= filterDateTo);
      const eIn = (!filterDateFrom || c.end_date   >= filterDateFrom) && (!filterDateTo || c.end_date   <= filterDateTo);
      if (!sIn && !eIn) return false;
    }
    if (filterInternalAttendees.length > 0) {
      const atts = (c.internal_attendees || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!filterInternalAttendees.some((fa) => atts.includes(fa))) return false;
    }
    if (filterStage) {
      if (c.is_historical) {
        if (filterStage !== 'historical') return false;
      } else {
        try {
          const stage = computeConferenceStage({
            start_date: c.start_date,
            end_date: c.end_date,
            post_conference_days: c.post_conference_days ?? null,
            stage_override: c.stage_override ?? null,
          });
          if (stage !== filterStage) return false;
        } catch {
          if (filterStage !== 'historical') return false;
        }
      }
    }
    if (selectedDate && (c.start_date > selectedDate || c.end_date < selectedDate)) return false;
    return true;
  }), [conferences, windowStart, windowEnd, filterYear, filterMonth, filterCity, filterState,
       filterDateFrom, filterDateTo, filterInternalAttendees, filterStage, selectedDate]);

  // Group into the 3 calendar months
  const grouped = useMemo(() => calMonths.map(([y, m], idx) => ({
    year: y, month: m,
    conferences: filteredConferences.filter((c) => {
      const sym = toYM(c.start_date);
      return idx === 0 ? cmpYM(sym, [y, m]) <= 0 : cmpYM(sym, [y, m]) === 0;
    }),
  })), [calMonths, filteredConferences]);

  // Calendar date highlight sets (use ALL conferences for visual)
  const calDateSets = useMemo(() => {
    const sets = calMonths.map(([y, m]) => confDatesInMonth(conferences, y, m));
    return sets;
  }, [calMonths, conferences]);

  const hasFilters = !!(filterYear || filterMonth || filterCity || filterState ||
    filterDateFrom || filterDateTo || filterInternalAttendees.length || filterStage || selectedDate);

  const clearFilters = () => {
    setFilterYear(''); setFilterMonth(''); setFilterCity(''); setFilterState('');
    setFilterDateFrom(''); setFilterDateTo(''); setFilterInternalAttendees([]); setFilterStage(''); setSelectedDate(null);
  };

  const isMonthExpanded = (y: number, m: number) => {
    const k = `${y}-${m}`;
    return k in monthExpanded ? monthExpanded[k] : true;
  };
  const toggleMonth = (y: number, m: number) =>
    setMonthExpanded((p) => ({ ...p, [`${y}-${m}`]: !isMonthExpanded(y, m) }));

  const totalFiltered = filteredConferences.length;

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackButton />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary font-serif">Conferences</h1>
          <p className="text-sm text-gray-500">
            {totalFiltered} of {conferences.length} conference{conferences.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/conferences/new" className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
          </svg>
          New Conference
        </Link>
      </div>

      {/* ── Tab navigation ── */}
      {!isLoading && conferences.length > 0 && (
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6" aria-label="Conference views">
            <button
              type="button"
              onClick={() => router.push('/conferences')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                view === 'program'
                  ? 'border-brand-secondary text-brand-secondary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Program
            </button>
            <button
              type="button"
              onClick={() => router.push('/conferences?view=calendar')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                view === 'calendar'
                  ? 'border-brand-secondary text-brand-secondary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => router.push('/conferences?view=by-stage')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                view === 'by-stage'
                  ? 'border-brand-secondary text-brand-secondary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              By Stage
            </button>
          </nav>
        </div>
      )}

      {/* ── Program view ── */}
      {view === 'program' && (
        <div className="space-y-4">
          {programLoading && !programLoaded ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {visibleAttention.length > 0 && (
                <div className="card space-y-3">
                  <div className="flex items-center gap-2">
                    <i className="ti ti-alert-circle text-gray-400" style={{ fontSize: 14 }} aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Needs Attention</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                      {needsAttention.length} item{needsAttention.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {visibleAttention.map((item, i) => (
                      <div
                        key={`${item.type}-${item.conferenceId}-${i}`}
                        onClick={() => router.push(`/conferences/${item.conferenceId}`)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                          background: item.urgency === 'high' ? 'var(--bg-warning, #FFFBEB)' : 'var(--bg-accent, #EFF6FF)',
                          border: `0.5px solid ${item.urgency === 'high' ? 'var(--border-warning, #FDE68A)' : 'var(--border-accent, #BFDBFE)'}`,
                        }}
                      >
                        <i
                          className={`ti ${iconForAttentionType(item.type)}`}
                          style={{ color: item.urgency === 'high' ? 'var(--text-warning, #B45309)' : 'var(--text-accent, #1D4ED8)', flexShrink: 0, marginTop: 1 }}
                          aria-hidden="true"
                        />
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 500, margin: 0, color: item.urgency === 'high' ? 'var(--text-warning, #B45309)' : 'var(--text-accent, #1D4ED8)' }}>
                            {item.message}
                          </p>
                          <p style={{ fontSize: 11, margin: '1px 0 0', opacity: .8, color: item.urgency === 'high' ? 'var(--text-warning, #B45309)' : 'var(--text-accent, #1D4ED8)' }}>
                            {item.conferenceName}{item.daysUntil !== null ? ` · in ${item.daysUntil} days` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {needsAttention.length > 4 && (
                    <button type="button" onClick={() => setShowAllAttention(v => !v)} className="text-xs text-brand-secondary hover:underline">
                      {showAllAttention ? 'Show fewer' : `View all ${needsAttention.length} items`}
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                    {([
                      { key: 'upcoming', label: 'Upcoming', count: programCounts.upcoming },
                      { key: 'active', label: 'Active', count: programCounts.active },
                      { key: 'past', label: 'Past', count: programCounts.past },
                    ] as const).map((t, i) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setProgramToggle(t.key)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                          programToggle === t.key ? 'bg-brand-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {t.label} {t.count}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', border: '0.5px solid var(--border, #E5E7EB)', borderRadius: 8, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => { setProgramLayout('grid'); localStorage.setItem('parlay-conferences-layout', 'grid'); }}
                      style={{
                        padding: '5px 9px', border: 'none', cursor: 'pointer',
                        background: programLayout === 'grid' ? '#223A5E' : 'transparent',
                        color: programLayout === 'grid' ? '#fff' : 'var(--text-secondary, #6B7280)',
                      }}
                      title="Grid view"
                      aria-label="Grid view"
                    >
                      <i className="ti ti-layout-grid" style={{ fontSize: 14 }} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setProgramLayout('list'); localStorage.setItem('parlay-conferences-layout', 'list'); }}
                      style={{
                        padding: '5px 9px', border: 'none', borderLeft: '0.5px solid var(--border, #E5E7EB)', cursor: 'pointer',
                        background: programLayout === 'list' ? '#223A5E' : 'transparent',
                        color: programLayout === 'list' ? '#fff' : 'var(--text-secondary, #6B7280)',
                      }}
                      title="List view"
                      aria-label="List view"
                    >
                      <i className="ti ti-list" style={{ fontSize: 14 }} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select value={programYearFilter} onChange={e => setProgramYearFilter(e.target.value)} className="input-field text-sm">
                    <option value="">All years</option>
                    {programYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={programRepFilter} onChange={e => setProgramRepFilter(e.target.value)} className="input-field text-sm">
                    <option value="">All reps</option>
                    {programRepOptions.map(r => <option key={r.userId} value={r.userId}>{r.displayName}</option>)}
                  </select>
                  <select value={programTerritoryFilter} onChange={e => setProgramTerritoryFilter(e.target.value)} className="input-field text-sm min-w-[170px] pr-8">
                    <option value="">All territories</option>
                    {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              {programStageFiltered.length === 0 ? (
                <div className="card text-center py-10">
                  <p className="text-gray-500 text-sm">No conferences in this group.</p>
                </div>
              ) : programLayout === 'list' ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12 }}>
                    <colgroup>
                      <col style={{ width: 200 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 160 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ borderBottom: '0.5px solid var(--border, #E5E7EB)' }}>
                        {['Conference', 'Dates', 'Stage', 'Territory', 'Reps', 'Outreach', 'List status'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {programStageFiltered.map((conf, i) => (
                        <tr
                          key={conf.id}
                          onClick={() => router.push(`/conferences/${conf.id}`)}
                          style={{
                            borderBottom: '0.5px solid var(--border, #E5E7EB)',
                            cursor: 'pointer',
                            background: i % 2 === 1 ? 'var(--surface-1, #F9FAFB)' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--text-primary, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {conf.name}
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-secondary, #6B7280)' }}>
                            {formatDate(conf.start_date)}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {conf.stage && (
                              <ConferenceStageBadge
                                stage={conf.stage}
                                daysRemaining={conf.stage === 'post_conference' ? postConferenceDaysRemaining({ end_date: conf.end_date, post_conference_days: conf.post_conference_days ?? null }) : undefined}
                              />
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <TerritoryPill conference={conf} territories={territories} />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <RepAvatarStack reps={conf.assignedReps} />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {conf.outreachProgress
                              ? `${conf.outreachProgress.assigned} / ${conf.outreachProgress.total}`
                              : <span style={{ color: 'var(--text-muted, #9CA3AF)' }}>—</span>
                            }
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <ListStatusPill hasAttendeeList={conf.hasAttendeeList} attendeeCount={conf.attendeeCount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                  {programStageFiltered.map(c => (
                    <ProgramConferenceCard
                      key={c.id}
                      conference={c}
                      territories={territories}
                      planYear={currentYear}
                      allConferences={programAllConferencesForConflicts}
                      onRepsUpdated={handleProgramRepsUpdated}
                    />
                  ))}
                  {programToggle === 'upcoming' && (
                    <Link
                      href="/conferences/new"
                      className="card border-2 border-dashed border-gray-200 hover:border-brand-secondary flex flex-col items-center justify-center text-gray-400 hover:text-brand-secondary transition-colors py-8"
                    >
                      <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="text-xs font-medium">Add conference</span>
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── By Stage view ── */}
      {!isLoading && view === 'by-stage' && (
        <ConferenceKanbanBoard conferences={conferences} />
      )}

      {/* ── Filter pane ── */}
      {!isLoading && view === 'calendar' && conferences.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-brand-primary"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
              </svg>
              Filters{hasFilters ? ' (active)' : ''}
              <svg className={`w-3 h-3 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-brand-secondary hover:underline">Clear all</button>
            )}
          </div>

          <div className={`${filtersOpen ? 'grid' : 'hidden'} grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3`}>
            <div>
              <label className="label text-xs">Year</label>
              <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="input-field text-sm">
                <option value="">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Month</label>
              <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="input-field text-sm">
                <option value="">All months</option>
                {MONTH_NAMES.map((n, i) => <option key={i} value={(i + 1).toString()}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">City</label>
              <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="input-field text-sm">
                <option value="">All cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">State</label>
              <select value={filterState} onChange={(e) => setFilterState(e.target.value)} className="input-field text-sm">
                <option value="">All states</option>
                {states.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Date From</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="input-field text-sm"/>
            </div>
            <div>
              <label className="label text-xs">Date To</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="input-field text-sm"/>
            </div>
            <div className="col-span-2 lg:col-span-2">
              <MultiSelectDropdown
                label="Internal Attendees"
                options={internalAttendeeOptions}
                values={filterInternalAttendees}
                onChange={setFilterInternalAttendees}
                placeholder="All attendees"
                emptyMessage="No internal attendees found."
              />
            </div>
            <div>
              <label className="label text-xs">Stage</label>
              <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="input-field text-sm">
                <option value="">All stages</option>
                <option value="planning">Planning</option>
                <option value="in_progress">In Progress</option>
                <option value="post_conference">Post-Conference</option>
                <option value="closed">Closed</option>
                <option value="historical">Historical</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Calendar section ── */}
      {!isLoading && view === 'calendar' && conferences.length > 0 && calExpanded !== null && (
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <button
              type="button"
              onClick={() => setCalExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-semibold text-brand-primary hover:text-brand-secondary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              Calendar
              <svg className={`w-3 h-3 transition-transform ${calExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            {selectedDate && (
              <button onClick={() => setSelectedDate(null)} className="text-xs text-brand-secondary hover:underline">
                Showing {selectedDate} — clear
              </button>
            )}
          </div>

          {calExpanded && (
            <div className="flex items-start gap-1 mt-3">
              {/* Left chevron */}
              <button
                type="button"
                onClick={handleCalLeft}
                disabled={!canGoLeft}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0 mt-6"
                aria-label="Previous month"
              >
                <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>

              {/* 3 calendars — mobile shows only first */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {calMonths.map(([y, m], idx) => (
                  <div key={`${y}-${m}`} className={idx === 0 ? '' : 'hidden lg:block'}>
                    <MonthCalendar
                      year={y} month={m}
                      dates={calDateSets[idx]}
                      selected={selectedDate}
                      onPick={handleDatePick}
                      today={todayStr}
                    />
                  </div>
                ))}
              </div>

              {/* Right chevron */}
              <button
                type="button"
                onClick={handleCalRight}
                disabled={!canGoRight}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0 mt-6"
                aria-label="Next month"
              >
                <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full"/>
        </div>
      )}

      {/* ── Empty state (no conferences at all) ── */}
      {!isLoading && conferences.length === 0 && (
        <div className="card text-center py-16">
          <svg className="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <h2 className="text-lg font-semibold text-gray-700 mb-2 font-serif">No conferences yet</h2>
          <p className="text-sm text-gray-400 mb-6">Create your first conference to start tracking attendees.</p>
          <Link href="/conferences/new" className="btn-primary inline-block">Add Your First Conference</Link>
        </div>
      )}

      {/* ── No results after filtering ── */}
      {!isLoading && view === 'calendar' && conferences.length > 0 && totalFiltered === 0 && (
        <div className="card text-center py-10">
          <p className="text-gray-500 text-sm">No conferences in this period match the current filters.</p>
          <button onClick={clearFilters} className="mt-3 text-brand-secondary text-sm hover:underline">Clear filters</button>
        </div>
      )}

      {/* ── Month sections ── */}
      {!isLoading && view === 'calendar' && conferences.length > 0 && [...grouped].reverse().map(({ year, month, conferences: mc }) => {
        const exp = isMonthExpanded(year, month);
        return (
          <div key={`${year}-${month}`}>
            <button
              type="button"
              onClick={() => toggleMonth(year, month)}
              className="flex items-center gap-3 w-full text-left mb-3"
            >
              <h2 className="text-lg font-bold text-brand-primary font-serif whitespace-nowrap">
                {MONTH_NAMES[month]} {year}
                <span className="ml-2 text-sm font-normal text-gray-500">({mc.length})</span>
              </h2>
              <div className="flex-1 h-px bg-gray-200"/>
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${exp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            {exp && (
              mc.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No conferences this month.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {mc.map((conf) => <ConferenceCard key={conf.id} conf={conf}/>)}
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ConferencesPage() {
  return (
    <Suspense fallback={null}>
      <ConferencesPageContent />
    </Suspense>
  );
}
