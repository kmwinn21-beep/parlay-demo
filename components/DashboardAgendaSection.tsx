'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hasNoStartTime, unscheduledLabel } from '@/lib/meetingTime';
import { AgendaDescription } from '@/components/AgendaDescription';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { MeetingNotesDrawer } from '@/components/MeetingNotesDrawer';
import { MeetingsTable, type Meeting } from '@/components/MeetingsTable';
import { useUserOptions } from '@/lib/useUserOptions';
import { useConfigColors } from '@/lib/useConfigColors';
import { useDrawerResize } from '@/lib/useDrawerResize';
import { KebabMenu } from '@/components/KebabMenu';

/** Same scale the follow-up count pills use, so a number reads the same way. */
const DAY_COUNT_STYLES: Record<number, string> = {
  1: 'text-gray-600 border-gray-300 bg-gray-100',
  2: 'text-green-600 border-green-300 bg-green-50',
  3: 'text-green-700 border-green-400 bg-green-100',
  4: 'text-green-800 border-green-500 bg-green-200',
  5: 'text-blue-600 border-blue-300 bg-blue-50',
  6: 'text-blue-700 border-blue-400 bg-blue-100',
  7: 'text-blue-800 border-blue-500 bg-blue-200',
};

/**
 * 'FRIDAY - AUG 14, 2026'. The sources spell their days differently — My
 * Agenda carries a sortable date, the uploaded agenda only its own label —
 * so anything unparseable is left exactly as it came.
 */
function formatDayBarLabel(raw: string, isoDate?: string): string {
  const d = isoDate ? new Date(`${isoDate.slice(0, 10)}T00:00:00`) : new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const rest = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${weekday} - ${rest}`;
}

/**
 * The day bar the meetings tab uses in conference details, so the agenda
 * groups read the same way. Full width — the rows below it run edge to edge
 * rather than sitting inside a card of their own.
 *
 * The chevron is a fixed width and the count is pushed right, so every bar's
 * date starts at the same x and every count sits in one column.
 */

/**
 * What a card wears, by the kind of thing it is.
 *
 * The same colours the agenda's type pills already use, as a block rather
 * than as a badge at the end of a line — the calendar's own idiom, so a
 * keynote reads the same whichever of the two somebody is looking at. `dot`
 * is the mark on the rail, which has to be the card's colour at 9px, so it
 * is the stronger of the pair.
 */
interface CardTone { card: string; dot: string }

const CARD_TONES: Record<string, CardTone> = {
  keynote:    { card: 'bg-purple-50 border-purple-200 text-purple-800',   dot: 'bg-purple-400' },
  workshop:   { card: 'bg-blue-50 border-blue-200 text-blue-800',         dot: 'bg-blue-400' },
  panel:      { card: 'bg-amber-50 border-amber-200 text-amber-800',      dot: 'bg-amber-400' },
  networking: { card: 'bg-green-50 border-green-200 text-green-800',      dot: 'bg-green-400' },
  reception:  { card: 'bg-pink-50 border-pink-200 text-pink-800',         dot: 'bg-pink-400' },
  social:     { card: 'bg-pink-50 border-pink-200 text-pink-800',         dot: 'bg-pink-400' },
  lunch:      { card: 'bg-orange-50 border-orange-200 text-orange-800',   dot: 'bg-orange-400' },
  breakfast:  { card: 'bg-orange-50 border-orange-200 text-orange-800',   dot: 'bg-orange-400' },
  dinner:     { card: 'bg-rose-50 border-rose-200 text-rose-800',         dot: 'bg-rose-400' },
  break:      { card: 'bg-gray-50 border-gray-200 text-gray-600',         dot: 'bg-gray-300' },
};

/** A meeting is yours rather than the conference's: a solid left edge says so. */
const MEETING_TONE: CardTone = {
  card: 'bg-sky-50 border-sky-200 border-l-[3px] border-l-sky-700 text-sky-900',
  dot: 'bg-sky-500',
};
const DEFAULT_TONE: CardTone = { card: 'bg-white border-gray-200 text-gray-700', dot: 'bg-gray-300' };

function cardTone(sessionType: string | null, isMeeting: boolean): CardTone {
  if (isMeeting) return MEETING_TONE;
  const key = (sessionType ?? '').toLowerCase();
  for (const [p, tone] of Object.entries(CARD_TONES)) { if (key.includes(p)) return tone; }
  return DEFAULT_TONE;
}

/** Today, as the agenda's own dates are written. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * One row: the time on a rail, a dot on the line, and the thing itself as a
 * card.
 *
 * The time was the first line of every row, in grey, at the same weight as a
 * label. On the rail it is a column you read down, and two items at the same
 * hour line up instead of saying the hour twice. The card carries everything
 * else, and its corner carries the controls that used to sit in a column of
 * their own at the end of the row.
 */
function AgendaRailRow({ time, until, untimed, tone, past, corner, children }: {
  time: string | null;
  until?: string | null;
  /** Booth hours and TBD have no point on the clock; the rail says which. */
  untimed?: string | null;
  tone: CardTone;
  /** Its moment has gone: still legible, but no longer one of the ones left. */
  past?: boolean;
  corner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2.5 px-3">
      <div className="w-[54px] flex-shrink-0 text-right pt-2">
        {untimed ? (
          /* "Booth Hours" over two lines in a 54px rail is a column of
             orphans; the first word carries it, and the card says the rest. */
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{untimed.split(' ')[0]}</span>
        ) : time ? (
          <>
            <span className="text-[10.5px] font-semibold text-gray-600 tabular-nums whitespace-nowrap">{time}</span>
            {until && <span className="block text-[9.5px] text-gray-400 tabular-nums">{until}</span>}
          </>
        ) : null}
      </div>
      <div className="relative w-[11px] flex-shrink-0" aria-hidden>
        <span className="absolute left-[5px] inset-y-0 w-px bg-gray-200" />
        <span className={`absolute left-[1px] top-[13px] w-[9px] h-[9px] rounded-full border-2 border-white ${tone.dot}`} />
      </div>
      <div
        data-agenda-past={past ? 'true' : undefined}
        className={`relative flex-1 min-w-0 my-1.5 rounded-lg border ${tone.card} transition-opacity ${
          past ? 'opacity-60' : 'opacity-100'}`}
      >
        {corner && <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">{corner}</div>}
        {children}
      </div>
    </div>
  );
}

/** The round control in a card's corner: + to add, − to take it back off. */
function CornerButton({ label, onClick, tone = 'outline', children }: {
  label: string;
  onClick: () => void;
  tone?: 'outline' | 'solid';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-[22px] h-[22px] flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${
        tone === 'solid'
          ? 'bg-green-600 text-white hover:bg-green-700'
          : 'border border-current bg-white/70 hover:bg-white'}`}
    >
      {children}
    </button>
  );
}

function AgendaDayBar({ label, count, expanded, onToggle }: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const countStyle = DAY_COUNT_STYLES[count] ?? 'text-red-700 border-red-500 bg-red-100';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="w-full flex items-center gap-2 text-left pl-4 pr-6 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
    >
      <svg
        className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider truncate">{label}</span>
      <span
        title={`${count} item${count === 1 ? '' : 's'}`}
        className={`ml-auto flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-bold ${countStyle}`}
      >
        {count}
      </span>
    </button>
  );
}

interface AgendaItem {
  id: number;
  start_time: string | null;
  end_time: string | null;
  session_type: string | null;
  title: string;
  description: string | null;
  location: string | null;
}

interface AgendaDay { day_label: string; items: AgendaItem[]; }

interface MyItem {
  id: number;
  source_type: string;
  agenda_item_id: number | null;
  meeting_id: number | null;
  day_label: string;
  start_time: string | null;
  end_time: string | null;
  session_type: string | null;
  title: string;
  description: string | null;
  location: string | null;
  note_content: string | null;
  entity_note_ids: string | null;
  attendee_id: number | null;
  company_id: number | null;
  attendee_name: string | null;
  attendee_title: string | null;
  company_name: string | null;
  conference_name: string | null;
}

interface MeetingRow {
  id: number;
  attendee_id: number;
  conference_id: number;
  meeting_date: string;
  meeting_time: string;
  location: string | null;
  outcome: string | null;
  meeting_type: string | null;
  first_name: string;
  last_name: string;
  attendee_title: string | null;
  company_id: number | null;
  company_name: string | null;
  conference_name: string;
}

interface DisplayItem {
  key: string;
  myItemId: number | null;
  sourceType: 'agenda' | 'meeting';
  sourceId: number;
  day_label: string;
  sort_date: string;
  sort_minutes: number;
  start_time: string | null;
  end_time: string | null;
  session_type: string | null;
  title: string;
  description: string | null;
  location: string | null;
  note_content: string | null;
  attendee_id: number | null;
  company_id: number | null;
  attendee_name: string | null;
  attendee_title: string | null;
  company_name: string | null;
  meeting_status: string | null;
}

function formatTime12h(time: string | null): string {
  if (!time) return '';
  const unscheduled = unscheduledLabel(time);
  if (unscheduled) return unscheduled;
  const t = time.trim().toUpperCase();
  if (t.includes('AM') || t.includes('PM')) return t; // already 12h
  const parts = time.trim().split(':').map(Number);
  let h = parts[0] ?? 0; const m = parts[1] ?? 0;
  const suffix = h < 12 ? 'AM' : 'PM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

function parseMinutes(time: string | null): number {
  if (!time) return 9999;
  // Booth-hours meetings have no slot — park them at the end of the day.
  if (hasNoStartTime(time)) return 9998;
  const t = time.trim().toUpperCase();
  const pm = t.includes('PM'); const am = t.includes('AM');
  const clean = t.replace(/[AP]M/, '').trim();
  const parts = clean.split(':').map(Number);
  let h = parts[0] ?? 0; const m = parts[1] ?? 0;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return h * 60 + m;
}

function formatMeetingDayLabel(d: string): string {
  try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

function parseDayToISO(label: string): string {
  try { const d = new Date(label); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); } catch { /**/ }
  return label;
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  keynote: 'bg-purple-100 text-purple-700', workshop: 'bg-blue-100 text-blue-700',
  panel: 'bg-amber-100 text-amber-700', break: 'bg-gray-100 text-gray-500',
  networking: 'bg-green-100 text-green-700', reception: 'bg-pink-100 text-pink-700',
  lunch: 'bg-orange-100 text-orange-700', breakfast: 'bg-orange-100 text-orange-700',
  dinner: 'bg-rose-100 text-rose-700', meeting: 'bg-sky-100 text-sky-700',
};

const MEETING_STATUS_CLASSES: Record<string, string> = {
  held: 'bg-green-100 text-green-700',
  scheduled: 'bg-sky-100 text-sky-700',
  'no-show': 'bg-red-100 text-red-600',
  'no show': 'bg-red-100 text-red-600',
  cancelled: 'bg-red-100 text-red-600',
  rescheduled: 'bg-amber-100 text-amber-700',
};

function meetingStatusPill(status: string | null) {
  if (!status) return null;
  const key = status.toLowerCase();
  const cls = MEETING_STATUS_CLASSES[key] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

function sessionBadgeClass(type: string | null): string {
  if (!type) return '';
  const key = type.toLowerCase();
  for (const [p, cls] of Object.entries(SESSION_TYPE_COLORS)) { if (key.includes(p)) return cls; }
  return 'bg-gray-100 text-gray-600';
}

function ExpandableItemText({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 2);
  }, []);

  return (
    <>
      <div ref={ref} className={expanded ? '' : 'line-clamp-4'}>
        {children}
      </div>
      {overflow && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-1 text-xs text-brand-secondary hover:underline focus:outline-none"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  );
}

export function DashboardAgendaSection({
  conferenceId, conferenceName, view, onViewChange, conferenceStart = null, conferenceEnd = null,
}: {
  conferenceId: number;
  conferenceName: string;
  view: 'my' | 'full';
  onViewChange: (v: 'my' | 'full') => void;
  /** The conference's own dates: what has passed only means anything while
   *  it is on. Left out, nothing fades. */
  conferenceStart?: string | null;
  conferenceEnd?: string | null;
}) {
  const { panelStyle: notePanelStyle, handleResizeStart: noteResizeStart } = useDrawerResize(560);

  const [days, setDays] = useState<AgendaDay[]>([]);
  const [myItems, setMyItems] = useState<MyItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullExpandedDays, setFullExpandedDays] = useState<Set<string>>(new Set());
  const [myExpandedDays, setMyExpandedDays] = useState<Set<string>>(new Set());
  const [myAgendaItemIds, setMyAgendaItemIds] = useState<Set<number>>(new Set());
  const [noteContents, setNoteContents] = useState<Map<string, string>>(new Map());
  const [savedNoteContents, setSavedNoteContents] = useState<Map<string, string>>(new Map());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set());
  const [notetakerMeetingId, setNotetakerMeetingId] = useState<number | null>(null);
  const [keyToMyItemId, setKeyToMyItemId] = useState<Map<string, number>>(new Map());
  // Inline panel unsaved-changes prompt
  const [pendingCloseKey, setPendingCloseKey] = useState<string | null>(null);
  // Expand drawer
  const [noteDrawerItem, setNoteDrawerItem] = useState<DisplayItem | null>(null);
  /** Whose meeting card is open in the sheet inside this drawer. */
  const [meetingCardId, setMeetingCardId] = useState<number | null>(null);
  /**
   * The conference's meetings in full, for that card.
   *
   * The agenda's own copy of a meeting is the handful of fields a row needs;
   * the card wants everything — the rep ids, the guests, the length, the
   * company's type. Fetched once, and only when somebody first asks for a
   * card, since most of the time nobody does.
   */
  const [fullMeetings, setFullMeetings] = useState<Meeting[]>([]);
  const userOptions = useUserOptions();
  const colorMaps = useConfigColors();
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [drawerDraft, setDrawerDraft] = useState('');
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerDiscardPrompt, setDrawerDiscardPrompt] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [agendaRes, myRes] = await Promise.all([
        fetch(`/api/conferences/${conferenceId}/agenda`),
        fetch(`/api/conferences/${conferenceId}/my-agenda`),
      ]);
      if (agendaRes.ok) {
        const data = await agendaRes.json() as { days: AgendaDay[] };
        setDays(data.days ?? []);
      }
      if (myRes.ok) {
        const data = await myRes.json() as { myItems: MyItem[]; meetings: MeetingRow[] };
        const items = data.myItems ?? [];
        setMyItems(items);
        setMeetings(data.meetings ?? []);
        setMyAgendaItemIds(new Set(items.filter(i => i.agenda_item_id != null).map(i => i.agenda_item_id!)));
        const noteMap = new Map<string, string>();
        const savedMap = new Map<string, string>();
        const idMap = new Map<string, number>();
        for (const item of items) {
          const k = item.source_type === 'meeting' ? `meeting-${item.meeting_id}` : `agenda-${item.id}`;
          if (item.note_content) noteMap.set(k, item.note_content);
          savedMap.set(k, item.note_content ?? '');
          idMap.set(k, item.id);
        }
        setNoteContents(noteMap);
        setSavedNoteContents(savedMap);
        setKeyToMyItemId(idMap);
      }
    } finally { setLoading(false); }
  }, [conferenceId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (meetingCardId == null || fullMeetings.length > 0) return;
    fetch(`/api/meetings?conference_id=${conferenceId}`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Meeting[]) => setFullMeetings(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [meetingCardId, conferenceId, fullMeetings.length]);

  useEffect(() => {
    if (meetingCardId == null || actionOptions.length > 0) return;
    fetch('/api/config?category=action')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { value: string }[]) => setActionOptions(Array.isArray(rows) ? rows.map(r => r.value) : []))
      .catch(() => {});
  }, [meetingCardId, actionOptions.length]);

  // Nothing to show a card for once the conference changes under it.
  useEffect(() => { setMeetingCardId(null); setFullMeetings([]); }, [conferenceId]);

  const handleAddToMyAgenda = useCallback(async (item: AgendaItem, dayLabel: string) => {
    const res = await fetch(`/api/conferences/${conferenceId}/my-agenda`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_type: 'agenda', agenda_item_id: item.id, day_label: dayLabel, start_time: item.start_time, end_time: item.end_time, session_type: item.session_type, title: item.title, description: item.description, location: item.location }),
    });
    if (res.ok) {
      const data = await res.json() as { id: number };
      setMyAgendaItemIds(prev => new Set(Array.from(prev).concat(item.id)));
      setMyItems(prev => prev.some(x => x.agenda_item_id === item.id) ? prev : [...prev, {
        id: data.id, source_type: 'agenda', agenda_item_id: item.id, meeting_id: null,
        day_label: dayLabel, start_time: item.start_time, end_time: item.end_time,
        session_type: item.session_type, title: item.title, description: item.description,
        location: item.location, note_content: null, entity_note_ids: null,
        attendee_id: null, company_id: null, attendee_name: null, attendee_title: null,
        company_name: null, conference_name: conferenceName,
      }]);
    }
  }, [conferenceId, conferenceName]);

  /**
   * Off the agenda again.
   *
   * The row is dropped before the request answers: on a list somebody is
   * tidying, a tick that takes a second to disappear reads as a click that
   * did not land, and the worst case is a refresh bringing it back. A
   * meeting is not something that was added, so nothing offers to remove it.
   */
  const handleRemoveFromMyAgenda = useCallback(async (myItemId: number, agendaItemId: number) => {
    setMyItems(prev => prev.filter(x => x.id !== myItemId));
    setMyAgendaItemIds(prev => { const next = new Set(prev); next.delete(agendaItemId); return next; });
    const res = await fetch(`/api/conferences/${conferenceId}/my-agenda/${myItemId}`, { method: 'DELETE' });
    if (!res.ok) void fetchAll();
  }, [conferenceId, fetchAll]);

  const saveNote = useCallback(async (key: string, content: string, meetingId?: number) => {
    setSavingNotes(prev => new Set(Array.from(prev).concat(key)));
    try {
      const existingId = keyToMyItemId.get(key);
      const body: Record<string, unknown> = { note_content: content };
      if (existingId) body.item_id = existingId;
      else if (meetingId) body.meeting_id = meetingId;
      const res = await fetch(`/api/conferences/${conferenceId}/my-agenda/note`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json() as { id: number };
        setSavedNoteContents(prev => new Map(Array.from(prev).concat([[key, content]])));
        setNoteContents(prev => new Map(Array.from(prev).concat([[key, content]])));
        if (!existingId && data.id) setKeyToMyItemId(prev => new Map(Array.from(prev).concat([[key, data.id]])));
      }
    } finally {
      setSavingNotes(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [conferenceId, keyToMyItemId]);

  /*
   * Whether an item's moment has gone, which fades its card.
   *
   * The same rule the meetings calendar uses, for the same reason: during a
   * conference half the agenda is history by lunchtime, and a list that says
   * so in the same voice as the half still to come is a list you have to
   * read with a watch in your other hand.
   *
   * Only while the conference is on. Before it nothing has passed; after it
   * everything has, and a view where every card is faded has lost a channel
   * rather than gained one. Booth hours and TBD pass with their day and not
   * before — parseMinutes parks them at 9998, past any real time of day, so
   * they only fade once the day itself is behind.
   */
  const today = todayIso();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const conferenceRunning = conferenceStart != null && conferenceEnd != null
    && today >= conferenceStart && today <= conferenceEnd;
  const isPastItem = (item: DisplayItem): boolean => {
    if (!conferenceRunning) return false;
    if (item.sort_date !== today) return item.sort_date < today;
    return item.sort_minutes < nowMinutes;
  };
  /** The same question of a full-agenda row, whose date is still a label. */
  const isPastAgendaItem = (dayLabel: string, startTime: string | null): boolean => {
    if (!conferenceRunning) return false;
    const date = parseDayToISO(dayLabel);
    if (date !== today) return date < today;
    return parseMinutes(startTime) < nowMinutes;
  };

  function buildDisplayItems(): DisplayItem[] {
    const items: DisplayItem[] = [];
    for (const mi of myItems) {
      if (mi.source_type !== 'agenda') continue;
      items.push({
        key: `agenda-${mi.id}`, myItemId: mi.id, sourceType: 'agenda', sourceId: mi.agenda_item_id ?? mi.id,
        day_label: mi.day_label, sort_date: parseDayToISO(mi.day_label), sort_minutes: parseMinutes(mi.start_time),
        start_time: mi.start_time, end_time: mi.end_time, session_type: mi.session_type,
        title: mi.title, description: mi.description, location: mi.location, note_content: mi.note_content,
        attendee_id: null, company_id: null, attendee_name: null, attendee_title: null, company_name: null,
        meeting_status: null,
      });
    }
    for (const m of meetings) {
      const key = `meeting-${m.id}`;
      const dayLabel = formatMeetingDayLabel(m.meeting_date);
      const attendeeName = `${m.first_name} ${m.last_name}`.trim();
      const myItemRow = myItems.find(i => i.meeting_id === m.id);
      items.push({
        key, myItemId: myItemRow?.id ?? keyToMyItemId.get(key) ?? null, sourceType: 'meeting', sourceId: m.id,
        day_label: dayLabel, sort_date: m.meeting_date, sort_minutes: parseMinutes(m.meeting_time || null),
        start_time: m.meeting_time || null, end_time: null, session_type: 'Meeting',
        title: attendeeName || 'Meeting', description: null, location: m.location,
        note_content: myItemRow?.note_content ?? null,
        attendee_id: m.attendee_id, company_id: m.company_id,
        attendee_name: attendeeName || null, attendee_title: m.attendee_title ?? null, company_name: m.company_name,
        meeting_status: m.outcome ?? 'Scheduled',
      });
    }
    return items;
  }

  function groupByDay(items: DisplayItem[]): { day_label: string; sort_date: string; items: DisplayItem[] }[] {
    const map = new Map<string, DisplayItem[]>();
    const sortDate = new Map<string, string>();
    for (const item of items) {
      if (!map.has(item.day_label)) { map.set(item.day_label, []); sortDate.set(item.day_label, item.sort_date); }
      map.get(item.day_label)!.push(item);
    }
    return Array.from(map.entries()).map(([day_label, dayItems]) => ({
      day_label, sort_date: sortDate.get(day_label) ?? day_label,
      items: [...dayItems].sort((a, b) => a.sort_minutes - b.sort_minutes),
    })).sort((a, b) => a.sort_date.localeCompare(b.sort_date));
  }

  const displayItems = buildDisplayItems();
  const myDayGroups = groupByDay(displayItems);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent mr-2" />
        <span className="text-sm">Loading agenda…</span>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-3">
      {/* My Agenda */}
      {view === 'my' && (
        displayItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-8 text-center">
            <p className="text-xs font-medium text-gray-600">Nothing here yet</p>
            <p className="mt-1 text-xs text-gray-400">Your meetings and saved agenda items appear here.</p>
            <Link href={`/conferences/${conferenceId}`} className="mt-2 inline-block text-xs text-brand-secondary hover:underline">Go to conference →</Link>
          </div>
        ) : (
          <div>
            {myDayGroups.map(group => {
              const expanded = myExpandedDays.has(group.day_label);
              return (
                <div key={group.day_label} className="bg-white">
                  <AgendaDayBar
                    label={formatDayBarLabel(group.day_label, group.sort_date)}
                    count={group.items.length}
                    expanded={expanded}
                    onToggle={() => setMyExpandedDays(prev => { const s = new Set(prev); s.has(group.day_label) ? s.delete(group.day_label) : s.add(group.day_label); return s; })}
                  />
                  {expanded && (
                    <div className="py-1">
                      {group.items.map(item => {
                        const isMeeting = item.sourceType === 'meeting';
                        const noteOpen = expandedNotes.has(item.key);
                        const saving = savingNotes.has(item.key);
                        const savedVal = savedNoteContents.get(item.key) ?? item.note_content ?? '';
                        const currentVal = noteContents.get(item.key) ?? item.note_content ?? '';
                        const isDirty = currentVal !== savedVal;
                        const subtitle = isMeeting ? [item.attendee_title, item.company_name].filter(Boolean).join(' · ') : null;
                        const tone = cardTone(item.session_type, isMeeting);
                        const untimed = item.start_time ? unscheduledLabel(item.start_time) : null;
                        return (
                          <AgendaRailRow
                            key={item.key}
                            time={untimed ? null : formatTime12h(item.start_time)}
                            until={!untimed && item.end_time ? formatTime12h(item.end_time) : null}
                            untimed={untimed}
                            tone={tone}
                            past={isPastItem(item)}
                            corner={
                              <>
                                {/* Off the agenda again, in the same corner the
                                    full agenda's + sits in. A meeting is not
                                    something you added, so there is nothing to
                                    take away. */}
                                {!isMeeting && item.myItemId != null && (
                                  <CornerButton
                                    label="Remove from My Agenda"
                                    onClick={() => void handleRemoveFromMyAgenda(item.myItemId as number, item.sourceId)}
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 12H5" />
                                    </svg>
                                  </CornerButton>
                                )}
                                <KebabMenu
                                  title="Item actions"
                                  items={isMeeting
                                    ? [{ label: 'Notes', onClick: () => setNotetakerMeetingId(item.sourceId) }]
                                    : [
                                        {
                                          label: noteOpen ? 'Close notes' : 'Notes',
                                          onClick: () => {
                                            if (noteOpen) {
                                              if (isDirty) {
                                                setPendingCloseKey(item.key);
                                              } else {
                                                setPendingCloseKey(null);
                                                setExpandedNotes(prev => { const s = new Set(prev); s.delete(item.key); return s; });
                                              }
                                            } else {
                                              setPendingCloseKey(null);
                                              setExpandedNotes(prev => { const s = new Set(prev); s.add(item.key); return s; });
                                            }
                                          },
                                        },
                                        {
                                          label: 'Expand notes',
                                          onClick: () => {
                                            setNoteDrawerItem(item);
                                            setDrawerDraft(currentVal);
                                            setDrawerDiscardPrompt(false);
                                          },
                                        },
                                      ]}
                                />
                              </>
                            }
                          >
                            <div className="p-2.5 pr-14">
                              {/* A meeting opens its own card, the one the
                                  calendar opens — so the title is the way in
                                  rather than a line of text beside a chevron. */}
                              {isMeeting ? (
                                <button
                                  type="button"
                                  onClick={() => setMeetingCardId(item.sourceId)}
                                  className="block w-full text-left"
                                >
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-semibold leading-snug">{item.title}</span>
                                    {meetingStatusPill(item.meeting_status)}
                                  </span>
                                  {subtitle && <span className="mt-0.5 block text-[11px] opacity-80">{subtitle}</span>}
                                </button>
                              ) : (
                                <ExpandableItemText>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="text-xs font-semibold leading-snug">{item.title}</p>
                                    {item.session_type && <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${sessionBadgeClass(item.session_type)}`}>{item.session_type}</span>}
                                  </div>
                                </ExpandableItemText>
                              )}
                              {!noteOpen && currentVal && !isMeeting && <p className="mt-1 text-[11px] opacity-70 italic line-clamp-1">{currentVal}</p>}
                            </div>
                            {item.description && <AgendaDescription text={item.description} className="px-2.5 pb-1.5 -mt-1" />}
                            {item.location && <AgendaDescription text={item.location} icon={<svg className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} className="px-2.5 pb-2 -mt-1" />}
                            {noteOpen && !isMeeting && (
                              <div className="px-2.5 pb-3 space-y-1.5">
                                <textarea
                                  value={currentVal}
                                  onChange={e => setNoteContents(prev => new Map(Array.from(prev).concat([[item.key, e.target.value]])))}
                                  placeholder="Add notes…"
                                  rows={3}
                                  className="input-field resize-none w-full text-xs"
                                />
                                {pendingCloseKey === item.key ? (
                                  <div className="flex items-center justify-between py-1.5 px-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-xs text-amber-700">Unsaved changes</p>
                                    <div className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await saveNote(item.key, currentVal, undefined);
                                          setPendingCloseKey(null);
                                          setExpandedNotes(prev => { const s = new Set(prev); s.delete(item.key); return s; });
                                        }}
                                        className="text-xs font-semibold text-brand-secondary hover:underline"
                                      >Save &amp; Exit</button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setNoteContents(prev => { const m = new Map(prev); m.set(item.key, savedVal); return m; });
                                          setPendingCloseKey(null);
                                          setExpandedNotes(prev => { const s = new Set(prev); s.delete(item.key); return s; });
                                        }}
                                        className="text-xs text-gray-500 hover:underline"
                                      >Discard</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end">
                                    <button
                                      type="button"
                                      onClick={() => void saveNote(item.key, currentVal, undefined)}
                                      disabled={!isDirty || saving}
                                      className="text-xs font-medium text-brand-secondary hover:underline disabled:opacity-40 transition-colors"
                                    >
                                      {saving ? 'Saving…' : 'Save'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </AgendaRailRow>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Full Agenda */}
      {view === 'full' && (
        days.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-8 text-center">
            <p className="text-xs font-medium text-gray-600">No agenda uploaded</p>
            <p className="mt-1 text-xs text-gray-400">Upload an agenda image from the conference detail page.</p>
            <Link href={`/conferences/${conferenceId}`} className="mt-2 inline-block text-xs text-brand-secondary hover:underline">Go to conference →</Link>
          </div>
        ) : (
          <div>
            {days.map(day => {
              const expanded = fullExpandedDays.has(day.day_label);
              return (
                <div key={day.day_label} className="bg-white">
                  <AgendaDayBar
                    label={formatDayBarLabel(day.day_label)}
                    count={day.items.length}
                    expanded={expanded}
                    onToggle={() => setFullExpandedDays(prev => { const s = new Set(prev); s.has(day.day_label) ? s.delete(day.day_label) : s.add(day.day_label); return s; })}
                  />
                  {expanded && (
                    <div className="py-1">
                      {day.items.map(item => {
                        const inMyAgenda = myAgendaItemIds.has(item.id);
                        const tone = cardTone(item.session_type, false);
                        const untimed = item.start_time ? unscheduledLabel(item.start_time) : null;
                        const myItemId = myItems.find(x => x.agenda_item_id === item.id)?.id ?? null;
                        return (
                          <AgendaRailRow
                            key={item.id}
                            time={untimed ? null : formatTime12h(item.start_time)}
                            until={!untimed && item.end_time ? formatTime12h(item.end_time) : null}
                            untimed={untimed}
                            tone={tone}
                            past={isPastAgendaItem(day.day_label, item.start_time)}
                            corner={inMyAgenda ? (
                              /* Already yours: the same green check it has
                                 today, and pressing it takes it back off. */
                              <CornerButton
                                label="Remove from My Agenda"
                                tone="solid"
                                onClick={() => { if (myItemId != null) void handleRemoveFromMyAgenda(myItemId, item.id); }}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                </svg>
                              </CornerButton>
                            ) : (
                              <CornerButton
                                label="Add to My Agenda"
                                onClick={() => void handleAddToMyAgenda(item, day.day_label)}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 5v14m7-7H5" />
                                </svg>
                              </CornerButton>
                            )}
                          >
                            <div className="p-2.5 pr-9">
                              <ExpandableItemText>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="text-xs font-semibold leading-snug">{item.title}</p>
                                  {item.session_type && <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${sessionBadgeClass(item.session_type)}`}>{item.session_type}</span>}
                                </div>
                              </ExpandableItemText>
                            </div>
                            {item.location && <AgendaDescription text={item.location} icon={<svg className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} className="px-2.5 pb-2 -mt-1" />}
                          </AgendaRailRow>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
    <MeetingNotesDrawer meetingId={notetakerMeetingId} onClose={() => setNotetakerMeetingId(null)} />

    {/* ── The meeting's own card, from the bottom of this drawer ──

        The same card the calendar's popup shows — renderMobileCard, through
        MeetingsTable's cardsOnly — so it keeps its notes button, its kebab,
        its outcome pill and its inline edit rather than being a second,
        poorer copy. It rises inside the drawer rather than over the page,
        because the agenda it came from is the thing to go back to. */}
    {meetingCardId != null && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-0 w-full sm:w-[560px] z-[78] flex flex-col justify-end pointer-events-none" style={{ top: 0 }}>
        <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={() => setMeetingCardId(null)} aria-hidden />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Meeting details"
          data-agenda-meeting-sheet
          className="pointer-events-auto relative max-h-[70%] flex flex-col overflow-hidden rounded-t-2xl border-t border-gray-200 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)]"
        >
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <p className="flex-1 text-sm font-semibold text-brand-primary font-serif">Meeting</p>
            <button
              type="button"
              onClick={() => setMeetingCardId(null)}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 bg-gray-50">
            {(() => {
              const meeting = fullMeetings.find(m => m.id === meetingCardId);
              if (!meeting) {
                return (
                  <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-400">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent" />
                    Loading the meeting…
                  </div>
                );
              }
              return (
                <MeetingsTable
                  cardsOnly
                  tableName="conference_meetings"
                  meetings={[meeting]}
                  actionOptions={actionOptions}
                  colorMap={colorMaps.action || {}}
                  userOptions={userOptions}
                  onOutcomeChange={async (meetingId, outcome) => {
                    setFullMeetings(prev => prev.map(m => (m.id === meetingId ? { ...m, outcome } : m)));
                    await fetch(`/api/meetings/${meetingId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ outcome }),
                    });
                    void fetchAll();
                  }}
                />
              );
            })()}
          </div>
        </div>
      </div>,
      document.body,
    )}
    {/* Note Expand Drawer */}
    {noteDrawerItem && typeof document !== 'undefined' && createPortal(
      // Above the dashboard Agenda drawer (z-[70]) — this section now renders
      // inside it, and at z-50 the note editor landed behind the drawer.
      <div className="fixed inset-0 z-[75] flex items-end sm:items-stretch sm:justify-end">
        <div className="absolute inset-0 bg-black/40" onClick={() => {
          const drawerSavedVal = savedNoteContents.get(noteDrawerItem.key) ?? noteDrawerItem.note_content ?? '';
          if (drawerDraft !== drawerSavedVal) {
            setDrawerDiscardPrompt(true);
          } else {
            setNoteDrawerItem(null);
          }
        }} />
        <div
          className="drawer-mobile-responsive relative flex flex-col bg-white w-full sm:w-[560px] h-[90vh] sm:h-full shadow-2xl rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none"
          style={notePanelStyle}
        >
          <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={noteResizeStart}>
            <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
          </div>
          {/* Header */}
          <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{noteDrawerItem.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {noteDrawerItem.start_time && (
                  <span className="text-xs text-gray-400">
                    {noteDrawerItem.start_time}{noteDrawerItem.end_time ? ` – ${noteDrawerItem.end_time}` : ''}
                  </span>
                )}
                {noteDrawerItem.session_type && (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sessionBadgeClass(noteDrawerItem.session_type)}`}>
                    {noteDrawerItem.session_type}
                  </span>
                )}
                <span className="text-xs text-gray-400">{noteDrawerItem.day_label}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={async () => {
                  setDrawerSaving(true);
                  const drawerMeetingId = noteDrawerItem.sourceType === 'meeting' ? noteDrawerItem.sourceId : undefined;
                  await saveNote(noteDrawerItem.key, drawerDraft, drawerMeetingId);
                  setDrawerSaving(false);
                  setDrawerDiscardPrompt(false);
                  setNoteDrawerItem(null);
                }}
                disabled={drawerSaving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {drawerSaving ? 'Saving…' : 'Save & Exit'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const drawerSavedVal = savedNoteContents.get(noteDrawerItem.key) ?? noteDrawerItem.note_content ?? '';
                  if (drawerDraft !== drawerSavedVal) {
                    setDrawerDiscardPrompt(true);
                  } else {
                    setNoteDrawerItem(null);
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors whitespace-nowrap"
              >
                Discard &amp; Exit
              </button>
              <button
                type="button"
                onClick={() => {
                  const drawerSavedVal = savedNoteContents.get(noteDrawerItem.key) ?? noteDrawerItem.note_content ?? '';
                  if (drawerDraft !== drawerSavedVal) {
                    setDrawerDiscardPrompt(true);
                  } else {
                    setNoteDrawerItem(null);
                  }
                }}
                className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {/* Discard prompt bar */}
          {drawerDiscardPrompt && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex-shrink-0">
              <p className="text-xs text-amber-700 font-medium">You have unsaved changes.</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    setDrawerSaving(true);
                    const drawerMeetingId = noteDrawerItem.sourceType === 'meeting' ? noteDrawerItem.sourceId : undefined;
                    await saveNote(noteDrawerItem.key, drawerDraft, drawerMeetingId);
                    setDrawerSaving(false);
                    setDrawerDiscardPrompt(false);
                    setNoteDrawerItem(null);
                  }}
                  className="text-xs font-semibold text-brand-secondary hover:underline"
                >Save &amp; Exit</button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerDiscardPrompt(false);
                    setNoteDrawerItem(null);
                  }}
                  className="text-xs text-gray-500 hover:underline"
                >Discard &amp; Exit</button>
              </div>
            </div>
          )}
          {/* Note textarea */}
          <textarea
            value={drawerDraft}
            onChange={e => setDrawerDraft(e.target.value)}
            placeholder="Add session notes…"
            className="flex-1 p-4 resize-none border-0 outline-none text-sm text-gray-700 placeholder:text-gray-400 bg-white"
          />
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
