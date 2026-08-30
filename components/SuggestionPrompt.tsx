'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { type CompanyOption, type ConfigOption } from '@/components/VendorRelationshipFields';
import { SUGGESTION_TARGETS, getTarget } from '@/lib/suggestions/registry';
import { SuggestionFieldInput } from '@/components/SuggestionFieldInput';
import { NOTE_SAVED_EVENT, type NoteSavedDetail } from '@/lib/suggestions/announce';

interface Suggestion {
  id: number;
  target_key: string;
  payload: Record<string, unknown>;
  quote: string | null;
  confidence: string;
}

/** How long to wait for the extractor before giving up quietly. */
const POLL_MS = 1200;
const POLL_ATTEMPTS = 10;

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
  const [drafts, setDrafts] = useState<Record<number, Record<string, unknown>>>({});
  const [options, setOptions] = useState<Record<string, ConfigOption[]>>({});
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  // Ids already put in front of this user, so a second note on the same record
  // doesn't re-offer what is still sitting on screen or was just answered.
  const seen = useRef<Set<number>>(new Set());
  const polling = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  const loadOptions = useCallback(() => {
    const cats = new Set<string>();
    for (const t of SUGGESTION_TARGETS) for (const f of t.fields) if (f.optionCategory) cats.add(f.optionCategory);
    Array.from(cats).forEach(cat => {
      fetch(`/api/config?category=${cat}`)
        .then(r => (r.ok ? r.json() : []))
        .then((d: ConfigOption[]) => setOptions(prev => ({ ...prev, [cat]: Array.isArray(d) ? d : [] })))
        .catch(() => {});
    });
    fetch('/api/companies?limit=2000')
      .then(r => (r.ok ? r.json() : []))
      .then((d: CompanyOption[]) => setCompanies(Array.isArray(d) ? d.map(c => ({ id: c.id, name: c.name })) : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onSaved = async (e: Event) => {
      const detail = (e as CustomEvent<NoteSavedDetail>).detail;
      if (!detail?.entityId || polling.current) return;
      // Conference notes have no single record to attach anything to.
      if (detail.entityType !== 'attendee' && detail.entityType !== 'company') return;

      polling.current = true;
      loadOptions();
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
            setDrafts(Object.fromEntries(fresh.map(r => [r.id, { ...r.payload }])));
            return;
          }
        }
      } catch { /* the note is saved either way; this is upside */ } finally {
        polling.current = false;
      }
    };
    window.addEventListener(NOTE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(NOTE_SAVED_EVENT, onSaved);
  }, [loadOptions]);

  const review = async (id: number, action: 'accept' | 'dismiss') => {
    setBusyId(id);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, payload: drafts[id] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(err.error || 'Could not save that.');
        return;
      }
      toast.success(action === 'accept' ? 'Added to the record.' : 'Ignored.');
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  /** Left pending, so it waits in Suggested Updates on the record. */
  const later = (id: number) => setSuggestions(prev => prev.filter(s => s.id !== id));

  const setField = (id: number, key: string, value: unknown) =>
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  if (!mounted || suggestions.length === 0) return null;

  return createPortal(
    <>
      {/* No backdrop click-to-close: every card here is a decision, and
          dismissing the lot by missing a button would lose them silently.
          Review later is the deliberate way out. */}
      <div className="fixed inset-0 z-[95] bg-black/40" />
      <div className="fixed inset-0 z-[96] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg max-h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <h3 className="text-sm font-semibold text-brand-primary">
              {suggestions.length === 1 ? 'One thing from that note' : `${suggestions.length} things from that note`}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Nothing is saved until you confirm it. Change anything that isn&apos;t right first.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {suggestions.map(s => {
              const target = getTarget(s.target_key);
              if (!target) return null;
              const draft = drafts[s.id] ?? {};
              return (
                <div key={s.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{target.label}</p>
                    {s.confidence !== 'high' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200">
                        {s.confidence} confidence
                      </span>
                    )}
                  </div>

                  {s.quote && (
                    <p className="text-xs text-gray-600 italic border-l-2 border-amber-300 pl-2 mb-3">
                      “{s.quote}”
                    </p>
                  )}

                  <div className="space-y-2">
                    {target.fields.map(f => (
                      <SuggestionFieldInput
                        key={f.key}
                        field={f}
                        value={draft[f.key]}
                        options={f.optionCategory ? options[f.optionCategory] ?? [] : []}
                        companies={companies}
                        onChange={v => setField(s.id, f.key, v)}
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => review(s.id, 'accept')}
                      disabled={busyId === s.id}
                      className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                    >
                      {busyId === s.id ? 'Saving…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => later(s.id)}
                      disabled={busyId === s.id}
                      className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
                    >
                      Review later
                    </button>
                    <button
                      type="button"
                      onClick={() => review(s.id, 'dismiss')}
                      disabled={busyId === s.id}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2"
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              );
            })}
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
