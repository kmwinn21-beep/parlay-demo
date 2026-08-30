'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { type CompanyOption, type ConfigOption } from '@/components/VendorRelationshipFields';
import { SUGGESTION_TARGETS, getTarget } from '@/lib/suggestions/registry';
import { SuggestionFieldInput } from '@/components/SuggestionFieldInput';
import { useCollapsibleSection } from '@/lib/sectionExpansion';

interface Suggestion {
  id: number;
  source_note_id: number | null;
  target_key: string;
  entity_type: string;
  entity_id: number;
  payload: Record<string, unknown>;
  quote: string | null;
  confidence: string;
}

/**
 * What a note said that isn't recorded yet, offered for confirmation.
 *
 * Every row is editable before it's accepted — the value written is whatever
 * is on screen when the button is pressed, not what was proposed. The quote
 * sits under each one so the judgment can be made against the words in the
 * note rather than on trust.
 *
 * Nothing here has been written anywhere. Dismissing costs nothing and doesn't
 * silence the same fact from a later note, because what a note describes keeps
 * changing.
 */
export function SuggestedUpdatesSection({ entityType, entityId }: {
  entityType: 'company' | 'attendee';
  entityId: number;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Record<string, unknown>>>({});
  const [options, setOptions] = useState<Record<string, ConfigOption[]>>({});
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Collapsed by default: these are optional, and the count pill says how many
  // are waiting without the block pushing the record's own fields down.
  const [expanded, setExpanded] = useCollapsibleSection(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/suggestions?entity_type=${entityType}&entity_id=${entityId}`, { cache: 'no-store' });
    const rows: Suggestion[] = res.ok ? await res.json() : [];
    setSuggestions(rows);
    setDrafts(Object.fromEntries(rows.map(r => [r.id, { ...r.payload }])));
    setLoaded(true);
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  // Only the categories the registry actually uses.
  useEffect(() => {
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
      toast.success(action === 'accept' ? 'Added to the record.' : 'Dismissed.');
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const setField = (id: number, key: string, value: unknown) =>
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  if (!loaded || suggestions.length === 0) return null;

  return (
    <div className="card">
      <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-2 w-full text-left">
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <h2 className="text-base font-semibold text-brand-primary font-serif truncate">
          Suggested Updates
        </h2>
        {/* Amber, matching the cards inside, so the count reads as the same
            thing whether the section is open or shut. */}
        <span className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
          {suggestions.length}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-400">
            Read from your notes. Nothing is saved until you accept it, and you can change
            any value first.
          </p>

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

                {/* The words this came from — the reason to believe it, and the
                    quickest way to spot one that's wrong. */}
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

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => review(s.id, 'accept')}
                    disabled={busyId === s.id}
                    className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                  >
                    {busyId === s.id ? 'Saving…' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    onClick={() => review(s.id, 'dismiss')}
                    disabled={busyId === s.id}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

