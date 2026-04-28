'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgendaItem {
  id: number;
  start_time: string | null;
  end_time: string | null;
  session_type: string | null;
  title: string;
  description: string | null;
  location: string | null;
}

interface AgendaDay {
  day_label: string;
  items: AgendaItem[];
}

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

// Unified display item used in My Agenda column
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
  entity_note_ids: string | null;
  attendee_id: number | null;
  company_id: number | null;
  attendee_name: string | null;
  attendee_title: string | null;
  company_name: string | null;
  conference_name: string | null;
}

interface Props {
  conferenceId: number;
  conferenceName: string;
  userEmail: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseMinutes(time: string | null): number {
  if (!time) return 9999;
  const t = time.trim().toUpperCase();
  const pm = t.includes('PM');
  const am = t.includes('AM');
  const clean = t.replace(/[AP]M/, '').trim();
  const parts = clean.split(':').map(Number);
  let h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return h * 60 + m;
}

function formatMeetingDayLabel(meetingDate: string): string {
  try {
    return new Date(`${meetingDate}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch {
    return meetingDate;
  }
}

function parseDayToISO(label: string): string {
  try {
    const d = new Date(label);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch { /* fall through */ }
  return label;
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  keynote: 'bg-purple-100 text-purple-700',
  workshop: 'bg-blue-100 text-blue-700',
  panel: 'bg-amber-100 text-amber-700',
  break: 'bg-gray-100 text-gray-500',
  networking: 'bg-green-100 text-green-700',
  reception: 'bg-pink-100 text-pink-700',
  lunch: 'bg-orange-100 text-orange-700',
  breakfast: 'bg-orange-100 text-orange-700',
  dinner: 'bg-rose-100 text-rose-700',
  meeting: 'bg-sky-100 text-sky-700',
};

function sessionBadgeClass(type: string | null): string {
  if (!type) return '';
  const key = type.toLowerCase();
  for (const [pattern, cls] of Object.entries(SESSION_TYPE_COLORS)) {
    if (key.includes(pattern)) return cls;
  }
  return 'bg-gray-100 text-gray-600';
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AgendaTab({ conferenceId, conferenceName, userEmail }: Props) {
  // Full agenda
  const [days, setDays] = useState<AgendaDay[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [fullExpandedDays, setFullExpandedDays] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlPanelOpen, setUrlPanelOpen] = useState(false);

  // My agenda
  const [myItems, setMyItems] = useState<MyItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loadingMy, setLoadingMy] = useState(true);
  const [myExpandedDays, setMyExpandedDays] = useState<Set<string>>(new Set());

  // Set of agenda_item_ids in My Agenda (for checkmark display)
  const [myAgendaItemIds, setMyAgendaItemIds] = useState<Set<number>>(new Set());

  // Notes state
  const [noteContents, setNoteContents] = useState<Map<string, string>>(new Map());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set());
  // Maps display key → myItemId (needed when meeting note is first saved, creating a row)
  const [keyToMyItemId, setKeyToMyItemId] = useState<Map<string, number>>(new Map());

  const debounceRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchAgenda = useCallback(async () => {
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/agenda`);
      if (!res.ok) throw new Error();
      const data = await res.json() as { days: AgendaDay[] };
      setDays(data.days ?? []);
      setFullExpandedDays(new Set());
    } catch {
      // silent — scanError handles feedback
    } finally {
      setLoadingAgenda(false);
    }
  }, [conferenceId]);

  const fetchMyAgenda = useCallback(async () => {
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/my-agenda`);
      if (!res.ok) throw new Error();
      const data = await res.json() as { myItems: MyItem[]; meetings: MeetingRow[] };
      setMyItems(data.myItems ?? []);
      setMeetings(data.meetings ?? []);
      setMyAgendaItemIds(new Set(
        (data.myItems ?? []).filter(i => i.agenda_item_id != null).map(i => i.agenda_item_id!)
      ));
      // Seed note content from saved values
      setNoteContents(prev => {
        const next = new Map(prev);
        for (const item of (data.myItems ?? [])) {
          const k = item.source_type === 'meeting' ? `meeting-${item.meeting_id}` : `agenda-${item.id}`;
          if (!next.has(k) && item.note_content) next.set(k, item.note_content);
        }
        return next;
      });
      setKeyToMyItemId(prev => {
        const next = new Map(prev);
        for (const item of (data.myItems ?? [])) {
          const k = item.source_type === 'meeting' ? `meeting-${item.meeting_id}` : `agenda-${item.id}`;
          next.set(k, item.id);
        }
        return next;
      });
      // Expand all My Agenda days
      setMyExpandedDays(new Set());
    } catch { /* silent */ } finally {
      setLoadingMy(false);
    }
  }, [conferenceId]);

  useEffect(() => {
    void fetchAgenda();
    void fetchMyAgenda();
  }, [fetchAgenda, fetchMyAgenda]);

  // ── Scan handlers ────────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setScanError(null);
    const isPdf = file.type === 'application/pdf';
    const maxBytes = isPdf ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setScanError(`File is too large. ${isPdf ? 'PDFs' : 'Images'} must be under ${isPdf ? '20' : '10'} MB.`);
      return;
    }
    setScanning(true);
    try {
      const image_base64 = await fileToBase64(file);
      const media_type = file.type || 'image/jpeg';
      const res = await fetch(`/api/conferences/${conferenceId}/agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64, media_type }),
      });
      const data = await res.json() as { count?: number; error?: string };
      if (!res.ok) { setScanError(data.error ?? 'Failed to scan agenda'); return; }
      await fetchAgenda();
    } catch { setScanError('Failed to scan file. Please try again.'); }
    finally { setScanning(false); }
  }, [conferenceId, fetchAgenda]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const handleClear = useCallback(async () => {
    setConfirmClear(false);
    await fetch(`/api/conferences/${conferenceId}/agenda`, { method: 'DELETE' });
    setDays([]);
    setFullExpandedDays(new Set());
  }, [conferenceId]);

  const handleUrl = useCallback(async () => {
    setUrlError(null);
    const trimmed = urlInput.trim();
    if (!trimmed) { setUrlError('Please enter a URL.'); return; }
    try {
      const p = new URL(trimmed);
      if (p.protocol !== 'http:' && p.protocol !== 'https:') throw new Error();
    } catch { setUrlError('Please enter a valid URL.'); return; }
    setUrlPanelOpen(false);
    setUrlInput('');
    setScanError(null);
    setScanning(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json() as { count?: number; error?: string };
      if (!res.ok) { setScanError(data.error ?? 'Failed to import agenda from URL.'); return; }
      await fetchAgenda();
    } catch { setScanError('Failed to connect. Please try again.'); }
    finally { setScanning(false); }
  }, [conferenceId, fetchAgenda, urlInput]);

  // ── My Agenda handlers ───────────────────────────────────────────────────────

  const handleAddToMyAgenda = useCallback(async (item: AgendaItem, dayLabel: string) => {
    const res = await fetch(`/api/conferences/${conferenceId}/my-agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: 'agenda',
        agenda_item_id: item.id,
        day_label: dayLabel,
        start_time: item.start_time,
        end_time: item.end_time,
        session_type: item.session_type,
        title: item.title,
        description: item.description,
        location: item.location,
      }),
    });
    if (res.ok) {
      const data = await res.json() as { id: number };
      setMyAgendaItemIds(prev => new Set(Array.from(prev).concat(item.id)));
      setMyItems(prev => {
        if (prev.some(x => x.agenda_item_id === item.id)) return prev;
        return [...prev, {
          id: data.id, source_type: 'agenda', agenda_item_id: item.id, meeting_id: null,
          day_label: dayLabel, start_time: item.start_time, end_time: item.end_time,
          session_type: item.session_type, title: item.title,
          description: item.description, location: item.location,
          note_content: null, entity_note_ids: null,
          attendee_id: null, company_id: null, attendee_name: null, attendee_title: null,
          company_name: null, conference_name: conferenceName,
        }];
      });
    }
  }, [conferenceId, conferenceName]);

  const handleRemoveMyItem = useCallback(async (myItemId: number, agendaItemId: number | null) => {
    const res = await fetch(`/api/conferences/${conferenceId}/my-agenda/${myItemId}`, { method: 'DELETE' });
    if (res.ok) {
      setMyItems(prev => prev.filter(i => i.id !== myItemId));
      if (agendaItemId) setMyAgendaItemIds(prev => { const s = new Set(prev); s.delete(agendaItemId); return s; });
    }
  }, [conferenceId]);

  // ── Note save (debounced) ────────────────────────────────────────────────────

  const saveNote = useCallback(async (key: string, content: string, meetingId?: number) => {
    setSavingNotes(prev => new Set(Array.from(prev).concat(key)));
    try {
      const currentMyItemId = keyToMyItemId.get(key);
      const body: Record<string, unknown> = { note_content: content };
      if (currentMyItemId) {
        body.item_id = currentMyItemId;
      } else if (meetingId) {
        body.meeting_id = meetingId;
      }
      const res = await fetch(`/api/conferences/${conferenceId}/my-agenda/note`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json() as { id: number; entity_note_ids: string | null };
        // Update myItemId if newly created (meeting first save)
        if (!currentMyItemId && data.id) {
          setKeyToMyItemId(prev => new Map(Array.from(prev).concat([[key, data.id]])));
          // Patch meetings-based display items so they have the row id
          if (meetingId) {
            setMyItems(prev => {
              if (prev.some(x => x.meeting_id === meetingId)) return prev;
              return [...prev, {
                id: data.id, source_type: 'meeting', agenda_item_id: null,
                meeting_id: meetingId, day_label: '', start_time: null, end_time: null,
                session_type: 'Meeting', title: '', description: null, location: null,
                note_content: content, entity_note_ids: data.entity_note_ids,
                attendee_id: null, company_id: null, attendee_name: null, attendee_title: null,
                company_name: null, conference_name: conferenceName,
              }];
            });
          }
        }
      }
    } finally {
      setSavingNotes(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [conferenceId, conferenceName, keyToMyItemId]);

  const handleNoteChange = useCallback((key: string, value: string) => {
    setNoteContents(prev => new Map(Array.from(prev).concat([[key, value]])));
  }, []);

  const handleNoteBlur = useCallback((key: string, meetingId?: number) => {
    const existing = debounceRefs.current.get(key);
    if (existing) { clearTimeout(existing); debounceRefs.current.delete(key); }
    const content = noteContents.get(key) ?? '';
    void saveNote(key, content, meetingId);
  }, [saveNote, noteContents]);

  // ── FullAgendaItem ────────────────────────────────────────────────────────────

  function FullAgendaItem({ item, dayLabel }: { item: AgendaItem; dayLabel: string }) {
    const inMyAgenda = myAgendaItemIds.has(item.id);
    return (
      <div className="flex gap-3 px-4 py-3">
        <div className="w-20 sm:w-28 shrink-0 pt-0.5">
          {(item.start_time || item.end_time) && (
            <p className="text-xs text-gray-500 tabular-nums leading-snug">
              {item.start_time ?? ''}
              {item.start_time && item.end_time && <><br />–&nbsp;{item.end_time}</>}
              {!item.start_time && item.end_time ? item.end_time : ''}
            </p>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            {item.session_type && (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sessionBadgeClass(item.session_type)}`}>
                {item.session_type}
              </span>
            )}
            <p className="text-xs font-medium text-gray-800 leading-snug">{item.title}</p>
          </div>
          {item.description && <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>}
          {item.location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {item.location}
            </p>
          )}
        </div>
        <div className="shrink-0 pl-2 pt-0.5">
          {inMyAgenda ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Added
            </span>
          ) : (
            <button
              onClick={() => void handleAddToMyAgenda(item, dayLabel)}
              title="Add to My Agenda"
              className="inline-flex items-center text-brand-secondary hover:text-brand-primary transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── MyAgendaItemCard ──────────────────────────────────────────────────────────

  function MyAgendaItemCard({ item }: { item: DisplayItem }) {
    const noteOpen = expandedNotes.has(item.key);
    const saving = savingNotes.has(item.key);
    const noteVal = noteContents.get(item.key) ?? item.note_content ?? '';
    const meetingId = item.sourceType === 'meeting' ? item.sourceId : undefined;
    // For meeting subtitle: show attendee_title · company; for agenda: nothing
    const subtitle = item.sourceType === 'meeting'
      ? [item.attendee_title, item.company_name].filter(Boolean).join(' · ')
      : null;

    return (
      <div>
        {/* Main row — same layout as Full Agenda items */}
        <div className="flex gap-3 px-4 py-3">
          <div className="w-20 sm:w-28 shrink-0 pt-0.5">
            {(item.start_time || item.end_time) && (
              <p className="text-xs text-gray-500 tabular-nums leading-snug">
                {item.start_time ?? ''}
                {item.start_time && item.end_time && <><br />–&nbsp;{item.end_time}</>}
                {!item.start_time && item.end_time ? item.end_time : ''}
              </p>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              {item.session_type && (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sessionBadgeClass(item.session_type)}`}>
                  {item.session_type}
                </span>
              )}
              <p className="text-xs font-medium text-gray-800 leading-snug">{item.title}</p>
            </div>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
            {item.description && (
              <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
            )}
            {item.location && (
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {item.location}
              </p>
            )}
            {/* Note preview when panel is closed */}
            {!noteOpen && noteVal && (
              <p className="mt-1 text-xs text-gray-400 italic line-clamp-2">{noteVal}</p>
            )}
          </div>
          {/* Actions — no borders, text links */}
          <div className="shrink-0 flex flex-col items-end gap-1.5 pl-2 pt-0.5">
            <button
              onClick={() => setExpandedNotes(prev => {
                const s = new Set(prev);
                if (s.has(item.key)) s.delete(item.key); else s.add(item.key);
                return s;
              })}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-secondary transition-colors whitespace-nowrap"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {noteOpen ? 'Close' : 'Notes'}
            </button>
            {item.sourceType === 'agenda' && item.myItemId && (
              <button
                onClick={() => void handleRemoveMyItem(item.myItemId!, item.sourceId)}
                className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors whitespace-nowrap"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Notes panel — full width below the row */}
        {noteOpen && (
          <div className="px-4 pb-3 space-y-1.5">
            <textarea
              value={noteVal}
              onChange={e => handleNoteChange(item.key, e.target.value)}
              onBlur={() => handleNoteBlur(item.key, meetingId)}
              placeholder="Add notes…"
              rows={3}
              className="input-field resize-none w-full text-xs"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {saving ? 'Saving…' : noteVal ? 'Saved' : 'Notes save when you click away'}
              </p>
              {noteVal && !saving && (
                <button
                  onClick={() => handleNoteBlur(item.key, meetingId)}
                  className="text-xs font-medium text-brand-secondary hover:underline transition-colors"
                >
                  Save
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Build My Agenda display items ─────────────────────────────────────────────

  function buildDisplayItems(): DisplayItem[] {
    const items: DisplayItem[] = [];

    // Saved my_agenda rows (agenda items)
    for (const mi of myItems) {
      if (mi.source_type !== 'agenda') continue;
      const key = `agenda-${mi.id}`;
      items.push({
        key, myItemId: mi.id, sourceType: 'agenda', sourceId: mi.agenda_item_id ?? mi.id,
        day_label: mi.day_label, sort_date: parseDayToISO(mi.day_label),
        sort_minutes: parseMinutes(mi.start_time),
        start_time: mi.start_time, end_time: mi.end_time,
        session_type: mi.session_type, title: mi.title,
        description: mi.description, location: mi.location,
        note_content: mi.note_content, entity_note_ids: mi.entity_note_ids,
        attendee_id: mi.attendee_id, company_id: mi.company_id,
        attendee_name: mi.attendee_name, attendee_title: null, company_name: mi.company_name,
        conference_name: mi.conference_name,
      });
    }

    // Meetings (auto-populated) — avoid duplicating ones already added as my_agenda rows
    const meetingIdsWithRows = new Set(myItems.filter(i => i.source_type === 'meeting').map(i => i.meeting_id));
    for (const m of meetings) {
      const key = `meeting-${m.id}`;
      const dayLabel = formatMeetingDayLabel(m.meeting_date);
      const attendeeName = `${m.first_name} ${m.last_name}`.trim();
      const myItemRow = myItems.find(i => i.meeting_id === m.id);
      items.push({
        key, myItemId: myItemRow?.id ?? keyToMyItemId.get(key) ?? null,
        sourceType: 'meeting', sourceId: m.id,
        day_label: dayLabel, sort_date: m.meeting_date,
        sort_minutes: parseMinutes(m.meeting_time || null),
        start_time: m.meeting_time || null, end_time: null,
        session_type: 'Meeting', title: attendeeName || 'Meeting',
        description: m.outcome ?? null, location: m.location,
        note_content: myItemRow?.note_content ?? null,
        entity_note_ids: myItemRow?.entity_note_ids ?? null,
        attendee_id: m.attendee_id, company_id: m.company_id,
        attendee_name: attendeeName || null, attendee_title: m.attendee_title ?? null, company_name: m.company_name,
        conference_name: m.conference_name,
      });
    }
    // Remove duplicates if meeting already has a saved my_agenda row
    void meetingIdsWithRows; // suppress unused warning

    // Group by day, sort days by date, items within day by time
    return items;
  }

  function groupByDay(items: DisplayItem[]): { day_label: string; items: DisplayItem[] }[] {
    const map = new Map<string, DisplayItem[]>();
    const sortDate = new Map<string, string>();
    for (const item of items) {
      if (!map.has(item.day_label)) { map.set(item.day_label, []); sortDate.set(item.day_label, item.sort_date); }
      map.get(item.day_label)!.push(item);
    }
    const days = Array.from(map.entries()).map(([day_label, dayItems]) => ({
      day_label,
      sort_date: sortDate.get(day_label) ?? day_label,
      items: [...dayItems].sort((a, b) => a.sort_minutes - b.sort_minutes),
    }));
    days.sort((a, b) => a.sort_date.localeCompare(b.sort_date));
    return days;
  }

  // ── Render ─────────────────────────────────────────────────────────────────────

  const displayItems = buildDisplayItems();
  const myDayGroups = groupByDay(displayItems);
  const hasMyAgenda = displayItems.length > 0;

  if (loadingAgenda && loadingMy) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent mr-2" />
        Loading agenda…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden file inputs */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInputChange} />
      <input ref={fileRef} type="file" accept="image/*,image/heic,application/pdf" className="hidden" onChange={handleInputChange} />

      {/* Two-column layout — stacks on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── LEFT: Full Agenda ─────────────────────────────────────────── */}
        <div className="space-y-3 min-w-0">
          {/* Column header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-brand-primary font-serif">Full Agenda</h3>
            {days.length > 0 && !scanning && (
              <div className="flex items-center gap-2">
                <button onClick={() => cameraRef.current?.click()} className="inline-flex items-center gap-1.5  text-gray-500 hover:text-brand-secondary transition-colors">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Re-scan
                </button>
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-secondary transition-colors">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Upload Image / PDF
                </button>
                <button
                  onClick={() => { setUrlPanelOpen(prev => !prev); setUrlError(null); setScanError(null); }}
                  className={`inline-flex items-center gap-1.5 text-sm transition-colors ${urlPanelOpen ? 'text-brand-secondary font-medium' : 'text-gray-500 hover:text-brand-secondary'}`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  From Link
                </button>
                {confirmClear ? (
                  <div className="flex items-center gap-1">
                    <span className=" text-gray-500">Clear all?</span>
                    <button onClick={() => void handleClear()} className=" text-red-500 hover:underline font-medium">Yes</button>
                    <button onClick={() => setConfirmClear(false)} className=" text-gray-400 hover:underline">No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmClear(true)} className=" text-sm text-red-400 hover:text-red-600 transition-colors">Clear</button>
                )}
              </div>
            )}
          </div>

          {/* Inline URL panel — shown when agenda already exists */}
          {urlPanelOpen && days.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Import from URL</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setUrlError(null); }}
                  onKeyDown={e => e.key === 'Enter' && void handleUrl()}
                  placeholder="https://example.com/agenda"
                  className="input-field flex-1 text-sm"
                  autoFocus
                />
                <button
                  onClick={() => void handleUrl()}
                  disabled={!urlInput.trim()}
                  className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
                  </svg>
                  Scan
                </button>
              </div>
              {urlError && <p className="text-xs text-red-500">{urlError}</p>}
            </div>
          )}

          {scanError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2  text-red-700">
              <span className="flex-1">{scanError}</span>
              <button onClick={() => setScanError(null)} className="shrink-0 text-red-400 hover:text-red-600"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          )}
          {scanning && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2  text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent" />
              Scanning agenda…
            </div>
          )}

          {days.length === 0 && !scanning ? (
            /* Empty state — tabbed Upload File / From Link */
            <div className="rounded-xl border-2 border-dashed border-gray-200 overflow-hidden">
              {/* Tab switcher */}
              <div className="flex border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => { setUrlPanelOpen(false); setUrlError(null); }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${!urlPanelOpen ? 'bg-white text-gray-800' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => { setUrlPanelOpen(true); setScanError(null); }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${urlPanelOpen ? 'bg-white text-gray-800' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                  From Link
                </button>
              </div>
              <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
                {!urlPanelOpen ? (
                  <>
                    <div className="rounded-full bg-gray-50 p-3">
                      <svg className="h-6 w-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700">No agenda yet</p>
                      <p className="mt-1 text-gray-400">Upload a photo, screenshot, or PDF of the conference agenda</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button onClick={() => cameraRef.current?.click()} className="btn-secondary inline-flex items-center gap-1.5">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Take Photo
                      </button>
                      <button onClick={() => fileRef.current?.click()} className="btn-primary inline-flex items-center gap-1.5">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Upload
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-full bg-gray-50 p-3">
                      <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700">Paste the URL of the conference agenda page</p>
                      <p className="mt-1 text-gray-400">Works best when the full schedule is visible in the page HTML</p>
                    </div>
                    <div className="w-full max-w-sm space-y-2">
                      <input
                        type="url"
                        value={urlInput}
                        onChange={e => { setUrlInput(e.target.value); setUrlError(null); }}
                        onKeyDown={e => e.key === 'Enter' && void handleUrl()}
                        placeholder="https://example.com/agenda"
                        className="input-field w-full text-sm"
                        autoFocus
                      />
                      {urlError && <p className="text-xs text-red-500 text-left">{urlError}</p>}
                      <button
                        onClick={() => void handleUrl()}
                        disabled={!urlInput.trim()}
                        className="btn-primary w-full inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
                        </svg>
                        Scan Agenda
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Full agenda day sections — border brand-primary/30 */
            <div className="space-y-2">
              {days.map(day => (
                <div key={day.day_label} className="rounded-xl border border-brand-primary/30 bg-white overflow-hidden">
                  <button
                    onClick={() => setFullExpandedDays(prev => { const s = new Set(prev); s.has(day.day_label) ? s.delete(day.day_label) : s.add(day.day_label); return s; })}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {fullExpandedDays.has(day.day_label)
                          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />}
                      </svg>
                      <span className=" font-semibold text-sm text-brand-primary">{day.day_label}</span>
                    </div>
                    <span className=" text-sm text-gray-400">{day.items.length} session{day.items.length !== 1 ? 's' : ''}</span>
                  </button>
                  {fullExpandedDays.has(day.day_label) && (
                    <div className="divide-y divide-gray-100 border-t border-brand-primary/20">
                      {day.items.map(item => <FullAgendaItem key={item.id} item={item} dayLabel={day.day_label} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: My Agenda ──────────────────────────────────────────── */}
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-brand-primary font-serif">My Agenda</h3>
            {hasMyAgenda && (
              <span className="text-sm text-gray-400">
                {displayItems.length} item{displayItems.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {!hasMyAgenda ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
              <p className="text-xs font-medium text-gray-600">Nothing here yet</p>
              <p className="mt-1 text-xs text-gray-400">
                {days.length > 0
                  ? 'Click "+ My Agenda" on sessions to the left to add them here.'
                  : 'Upload an agenda to get started. Your scheduled meetings will appear here automatically.'}
              </p>
            </div>
          ) : (
            /* My Agenda day sections — border brand-secondary */
            <div className="space-y-2">
              {myDayGroups.map(group => (
                <div key={group.day_label} className="rounded-xl border border-brand-primary/30 bg-white overflow-hidden">
                  <button
                    onClick={() => setMyExpandedDays(prev => { const s = new Set(prev); s.has(group.day_label) ? s.delete(group.day_label) : s.add(group.day_label); return s; })}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-blue-50/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {myExpandedDays.has(group.day_label)
                          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />}
                      </svg>
                      <span className="text-sm font-semibold text-brand-primary">{group.day_label}</span>
                    </div>
                    <span className="text-sm text-gray-400">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                  </button>
                  {myExpandedDays.has(group.day_label) && (
                    <div className="divide-y divide-gray-100 border-t border-brand-secondary/30">
                      {group.items.map(item => <MyAgendaItemCard key={item.key} item={item} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
