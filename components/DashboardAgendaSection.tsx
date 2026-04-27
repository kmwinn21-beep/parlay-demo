'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';

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
}

function formatTime12h(time: string | null): string {
  if (!time) return '';
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
  try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
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

export function DashboardAgendaSection({ conferenceId, conferenceName }: { conferenceId: number; conferenceName: string }) {
  const [view, setView] = useState<'my' | 'full'>('my');
  const [days, setDays] = useState<AgendaDay[]>([]);
  const [myItems, setMyItems] = useState<MyItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullExpandedDays, setFullExpandedDays] = useState<Set<string>>(new Set());
  const [myExpandedDays, setMyExpandedDays] = useState<Set<string>>(new Set());
  const [myAgendaItemIds, setMyAgendaItemIds] = useState<Set<number>>(new Set());
  const [noteContents, setNoteContents] = useState<Map<string, string>>(new Map());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set());
  const [keyToMyItemId, setKeyToMyItemId] = useState<Map<string, number>>(new Map());

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
        const idMap = new Map<string, number>();
        for (const item of items) {
          const k = item.source_type === 'meeting' ? `meeting-${item.meeting_id}` : `agenda-${item.id}`;
          if (item.note_content) noteMap.set(k, item.note_content);
          idMap.set(k, item.id);
        }
        setNoteContents(noteMap);
        setKeyToMyItemId(idMap);
      }
    } finally { setLoading(false); }
  }, [conferenceId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

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
        if (!existingId && data.id) setKeyToMyItemId(prev => new Map(Array.from(prev).concat([[key, data.id]])));
      }
    } finally {
      setSavingNotes(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [conferenceId, keyToMyItemId]);

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
        title: attendeeName || 'Meeting', description: m.outcome ?? null, location: m.location,
        note_content: myItemRow?.note_content ?? null,
        attendee_id: m.attendee_id, company_id: m.company_id,
        attendee_name: attendeeName || null, attendee_title: m.attendee_title ?? null, company_name: m.company_name,
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
    <div className="space-y-3">
      {/* My Agenda / Full Agenda toggle */}
      <div className="flex justify-end">
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        <button onClick={() => setView('my')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${view === 'my' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>My Agenda</button>
        <button onClick={() => setView('full')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${view === 'full' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Full Agenda</button>
      </div>
      </div>

      {/* My Agenda */}
      {view === 'my' && (
        displayItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-8 text-center">
            <p className="text-xs font-medium text-gray-600">Nothing here yet</p>
            <p className="mt-1 text-xs text-gray-400">Your meetings and saved agenda items appear here.</p>
            <Link href={`/conferences/${conferenceId}`} className="mt-2 inline-block text-xs text-brand-secondary hover:underline">Go to conference →</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {myDayGroups.map(group => {
              const expanded = myExpandedDays.has(group.day_label);
              return (
                <div key={group.day_label} className="rounded-xl border border-brand-secondary bg-white overflow-hidden">
                  <button onClick={() => setMyExpandedDays(prev => { const s = new Set(prev); s.has(group.day_label) ? s.delete(group.day_label) : s.add(group.day_label); return s; })}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-blue-50/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {expanded ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />}
                      </svg>
                      <span className="text-xs font-semibold text-brand-primary">{group.day_label}</span>
                    </div>
                    <span className="text-xs text-gray-400">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-gray-200 border-t border-brand-secondary/30">
                      {group.items.map(item => {
                        const noteOpen = expandedNotes.has(item.key);
                        const saving = savingNotes.has(item.key);
                        const noteVal = noteContents.get(item.key) ?? item.note_content ?? '';
                        const meetingId = item.sourceType === 'meeting' ? item.sourceId : undefined;
                        const subtitle = item.sourceType === 'meeting' ? [item.attendee_title, item.company_name].filter(Boolean).join(' · ') : null;
                        return (
                          <div key={item.key}>
                            <div className="flex gap-3 px-4 py-2.5">
                              <div className="w-20 shrink-0 pt-0.5">
                                {item.start_time && <p className="text-xs text-gray-500 tabular-nums leading-snug">{formatTime12h(item.start_time)}</p>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <ExpandableItemText>
                                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                    {item.session_type && <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sessionBadgeClass(item.session_type)}`}>{item.session_type}</span>}
                                    <p className="text-xs font-medium text-gray-800 leading-snug">{item.title}</p>
                                  </div>
                                  {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
                                  {item.description && <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>}
                                  {item.location && (
                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                                      <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                      {item.location}
                                    </p>
                                  )}
                                </ExpandableItemText>
                                {!noteOpen && noteVal && <p className="mt-1 text-xs text-gray-400 italic line-clamp-1">{noteVal}</p>}
                              </div>
                              <div className="shrink-0 pl-1 pt-0.5">
                                <button onClick={() => setExpandedNotes(prev => { const s = new Set(prev); s.has(item.key) ? s.delete(item.key) : s.add(item.key); return s; })} className="text-xs text-gray-400 hover:text-brand-secondary transition-colors">{noteOpen ? 'Close' : 'Notes'}</button>
                              </div>
                            </div>
                            {noteOpen && (
                              <div className="px-4 pb-3 space-y-1.5">
                                <textarea value={noteVal} onChange={e => setNoteContents(prev => new Map(Array.from(prev).concat([[item.key, e.target.value]])))} onBlur={() => { const content = noteContents.get(item.key) ?? ''; void saveNote(item.key, content, meetingId); }} placeholder="Add notes…" rows={3} className="input-field resize-none w-full text-xs" />
                                <p className="text-xs text-gray-400">{saving ? 'Saving…' : noteVal ? 'Saved' : 'Notes save when you click away'}</p>
                              </div>
                            )}
                          </div>
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
          <div className="space-y-2">
            {days.map(day => {
              const expanded = fullExpandedDays.has(day.day_label);
              return (
                <div key={day.day_label} className="rounded-xl border border-brand-primary/30 bg-white overflow-hidden">
                  <button onClick={() => setFullExpandedDays(prev => { const s = new Set(prev); s.has(day.day_label) ? s.delete(day.day_label) : s.add(day.day_label); return s; })}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {expanded ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />}
                      </svg>
                      <span className="text-xs font-semibold text-brand-primary">{day.day_label}</span>
                    </div>
                    <span className="text-xs text-gray-400">{day.items.length} session{day.items.length !== 1 ? 's' : ''}</span>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-gray-200 border-t border-brand-primary/20">
                      {day.items.map(item => {
                        const inMyAgenda = myAgendaItemIds.has(item.id);
                        return (
                          <div key={item.id} className="flex gap-3 px-4 py-2.5">
                            <div className="w-20 shrink-0 pt-0.5">
                              {item.start_time && <p className="text-xs text-gray-500 tabular-nums">{formatTime12h(item.start_time)}</p>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <ExpandableItemText>
                                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                  {item.session_type && <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sessionBadgeClass(item.session_type)}`}>{item.session_type}</span>}
                                  <p className="text-xs font-medium text-gray-800 leading-snug">{item.title}</p>
                                </div>
                                {item.description && <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>}
                                {item.location && (
                                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                                    <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    {item.location}
                                  </p>
                                )}
                              </ExpandableItemText>
                            </div>
                            <div className="shrink-0 pl-1 pt-0.5">
                              {inMyAgenda ? (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                  Added
                                </span>
                              ) : (
                                <button onClick={() => void handleAddToMyAgenda(item, day.day_label)} title="Add to My Agenda" className="inline-flex items-center text-brand-secondary hover:text-brand-primary transition-colors">
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                </button>
                              )}
                            </div>
                          </div>
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
  );
}
