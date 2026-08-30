'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { SuggestionGroupCard } from '@/components/SuggestionGroupCard';
import { groupSuggestions, payloadFor, type SuggestionGroup } from '@/lib/suggestions/group';
import { useSuggestionCatalog } from '@/lib/suggestions/useSuggestionCatalog';
import { NOTE_SAVED_EVENT, type NoteSavedDetail } from '@/lib/suggestions/announce';

interface Suggestion {
  id: number;
  target_key: string;
  payload: Record<string, unknown>;
  quote: string | null;
  confidence: string;
  source_note_content: string | null;
}

/** How long to wait for the extractor before giving up quietly. */
const POLL_MS = 1200;
const POLL_ATTEMPTS = 10;

/**
 * The note these came from, collapsed until asked for.
 *
 * Each card carries the sentence it was read from, which is enough most of the
 * time; this is for the times it isn't, and a quote needs its surroundings
 * before a decision can be made. Collapsed by default so it doesn't push the
 * decisions themselves below the fold.
 *
 * Declared at module scope, not inside the prompt: a component defined during a
 * render is a new type on every render, which remounts it and loses its open
 * state on each keystroke elsewhere in the form.
 */
function FullNote({ texts }: { texts: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">View Full Note</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {texts.map((t, i) => (
            // whitespace-pre-wrap: notes are written with line breaks that
            // carry meaning — a list of vendors is not one paragraph.
            <p key={i} className="text-xs text-gray-700 whitespace-pre-wrap border-l-2 border-gray-200 pl-2">
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What a note just said, offered while it's still fresh.
 *
 * Mounted once for the whole app and driven by an event, so every note-writing
 * flow gets this without knowing anything about it — and a flow added later
 * gets it by dispatching one line.
 *
 * Extraction runs after the note's response, so there is nothing to show at
 * the moment of saving; this polls for a few seconds and stays silent if
 * nothing turns up, which is the common case for a note that states no facts.
 */
export function SuggestionPrompt() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  // Ids already put in front of this user, so a second note on the same record
  // doesn't re-offer what is still sitting on screen or was just answered.
  const seen = useRef<Set<number>>(new Set());
  const polling = useRef(false);
  const { options, companies, load: loadCatalog } = useSuggestionCatalog(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onSaved = async (e: Event) => {
      const detail = (e as CustomEvent<NoteSavedDetail>).detail;
      if (!detail?.entityId || polling.current) return;
      // Conference notes have no single record to attach anything to.
      if (detail.entityType !== 'attendee' && detail.entityType !== 'company') return;

      polling.current = true;
      loadCatalog();
      try {
        for (let i = 0; i < POLL_ATTEMPTS; i++) {
          await new Promise(r => setTimeout(r, POLL_MS));
          const res = await fetch(
            `/api/suggestions?entity_type=${detail.entityType}&entity_id=${detail.entityId}`,
            { cache: 'no-store' },
          );
          if (!res.ok) continue;
          const rows: Suggestion[] = await res.json();
          const fresh = rows.filter(r => !seen.current.has(r.id));
          if (fresh.length > 0) {
            fresh.forEach(r => seen.current.add(r.id));
            setSuggestions(fresh);
            return;
          }
        }
      } catch { /* the note is saved either way; this is upside */ } finally {
        polling.current = false;
      }
    };
    window.addEventListener(NOTE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(NOTE_SAVED_EVENT, onSaved);
  }, [loadCatalog]);

  const groups = useMemo(() => groupSuggestions(suggestions), [suggestions]);

  const drop = (group: SuggestionGroup) => {
    const done = new Set(group.members.map(m => m.id));
    setSuggestions(prev => prev.filter(s => !done.has(s.id)));
  };

  const review = async (group: SuggestionGroup, action: 'accept' | 'dismiss') => {
    setBusyKey(group.key);
    const draft = { ...group.draft, ...(edits[group.key] ?? {}) };
    try {
      // One company is one decision, so every member of the group is answered
      // together — a half-applied group would leave the record inconsistent
      // with what the reviewer saw.
      for (const member of group.members) {
        const res = await fetch('/api/suggestions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: member.id, action, payload: payloadFor(member, draft) }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          toast.error(err.error || 'Could not save that.');
          return;
        }
      }
      toast.success(action === 'accept' ? 'Added to the record.' : 'Ignored.');
      drop(group);
    } finally {
      setBusyKey(null);
    }
  };

  /** Every suggestion here dismissed at once, and the prompt closed. */
  const ignoreAll = async () => {
    setBusyKey('__all__');
    const ids = suggestions.map(s => s.id);
    try {
      await Promise.allSettled(ids.map(id => fetch('/api/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'dismiss' }),
      })));
      toast.success(ids.length === 1 ? 'Ignored.' : `Ignored ${ids.length} suggestions.`);
      setSuggestions([]);
    } finally {
      setBusyKey(null);
    }
  };

  const setField = (key: string, field: string, value: unknown) =>
    setEdits(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  // The note behind these, for checking a quote in context. One prompt follows
  // one save, so this is normally a single note.
  const noteTexts = Array.from(new Set(
    suggestions.map(s => (s.source_note_content ?? '').trim()).filter(Boolean),
  ));

  if (!mounted || groups.length === 0) return null;

  return createPortal(
    <>
      {/* No backdrop click-to-close: every card here is a decision, and
          dismissing the lot by missing a button would lose them silently.
          Review later is the deliberate way out. */}
      <div className="fixed inset-0 z-[95] bg-black/40" />
      <div className="fixed inset-0 z-[96] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg max-h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-brand-primary">
                {groups.length === 1 ? '1 suggestion from that note' : `${groups.length} suggestions from that note`}
              </h3>
              <button
                type="button"
                onClick={ignoreAll}
                disabled={busyKey !== null}
                className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                {busyKey === '__all__' ? 'Ignoring…' : 'Ignore All'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Nothing is changed until you confirm.</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {noteTexts.length > 0 && <FullNote texts={noteTexts} />}
            {groups.map((group, i) => (
              <SuggestionGroupCard
                key={group.key}
                index={i + 1}
                group={{ ...group, draft: { ...group.draft, ...(edits[group.key] ?? {}) } }}
                options={options}
                companies={companies}
                onChange={(field, value) => setField(group.key, field, value)}
              >
                <button
                  type="button"
                  onClick={() => review(group, 'accept')}
                  disabled={busyKey === group.key}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {busyKey === group.key ? 'Saving…' : 'Confirm'}
                </button>
                {/* Left pending, so it waits in Suggested Updates on the record. */}
                <button
                  type="button"
                  onClick={() => drop(group)}
                  disabled={busyKey === group.key}
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  Review later
                </button>
                <button
                  type="button"
                  onClick={() => review(group, 'dismiss')}
                  disabled={busyKey === group.key}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2"
                >
                  Ignore
                </button>
              </SuggestionGroupCard>
            ))}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100 flex-shrink-0">
            <button
              type="button"
              onClick={() => setSuggestions([])}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Review all of these later
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
