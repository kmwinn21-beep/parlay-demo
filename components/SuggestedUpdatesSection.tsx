'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { SuggestionGroupCard } from '@/components/SuggestionGroupCard';
import { groupSuggestions, payloadFor, type SuggestionGroup } from '@/lib/suggestions/group';
import { useSuggestionCatalog } from '@/lib/suggestions/useSuggestionCatalog';
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
 * Grouped by the company it names, so one company is one decision however many
 * targets it feeds. Every field is editable before it's accepted — the value
 * written is whatever is on screen when the button is pressed, not what was
 * proposed. The quote sits above them so the judgment can be made against the
 * words in the note rather than on trust.
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
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Collapsed by default: these are optional, and the count pill says how many
  // are waiting without the block pushing the record's own fields down.
  const [expanded, setExpanded] = useCollapsibleSection(false);
  const { options, companies } = useSuggestionCatalog();

  const load = useCallback(async () => {
    const res = await fetch(`/api/suggestions?entity_type=${entityType}&entity_id=${entityId}`, { cache: 'no-store' });
    const rows: Suggestion[] = res.ok ? await res.json() : [];
    setSuggestions(rows);
    setLoaded(true);
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => groupSuggestions(suggestions), [suggestions]);

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
      toast.success(action === 'accept' ? 'Added to the record.' : 'Dismissed.');
      const done = new Set(group.members.map(m => m.id));
      setSuggestions(prev => prev.filter(s => !done.has(s.id)));
    } finally {
      setBusyKey(null);
    }
  };

  const setField = (key: string, field: string, value: unknown) =>
    setEdits(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  if (!loaded || groups.length === 0) return null;

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
          {groups.length}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-400">
            Read from your notes. Nothing is saved until you accept it, and you can change
            any value first.
          </p>

          {groups.map(group => (
            <SuggestionGroupCard
              key={group.key}
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
                {busyKey === group.key ? 'Saving…' : 'Accept'}
              </button>
              <button
                type="button"
                onClick={() => review(group, 'dismiss')}
                disabled={busyKey === group.key}
                className="text-xs text-gray-500 hover:text-gray-700 px-2"
              >
                Dismiss
              </button>
            </SuggestionGroupCard>
          ))}
        </div>
      )}
    </div>
  );
}
