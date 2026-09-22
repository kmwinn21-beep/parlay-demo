'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SuggestionGroupCard } from '@/components/SuggestionGroupCard';
import { groupSuggestions } from '@/lib/suggestions/group';
import { useSuggestionCatalog } from '@/lib/suggestions/useSuggestionCatalog';
import { useCollapsibleSection } from '@/lib/sectionExpansion';
import { useSuggestionReview, SuggestionActions } from '@/components/SuggestionReview';

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

  // The decisions themselves live in one place, so the queue on a record and
  // the queue on the dashboard cannot answer the same card differently.
  const { busyKey, review, openForm, modals } = useSuggestionReview(
    useCallback((ids: number[]) => {
      const done = new Set(ids);
      setSuggestions(prev => prev.filter(s => !done.has(s.id)));
    }, []),
  );

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
          Pending Review
        </h2>
        {/* Amber, matching the cards inside, so the count reads as the same
            thing whether the section is open or shut. */}
        <span className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
          {groups.length}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* True of both kinds. An activity card IS already saved — that is
              what Save for Later did — and has nothing editable on it, so the
              old wording was wrong on both counts for half of these. What is
              true either way is that the RECORD is untouched until confirmed. */}
          <p className="text-xs text-gray-400">
            Read from your notes. Nothing is added to the record until you confirm it,
            and anything editable can be changed first.
          </p>

          {groups.map((group, i) => (
            <SuggestionGroupCard
              key={group.key}
              index={i + 1}
              collapsible
              group={{ ...group, draft: { ...group.draft, ...(edits[group.key] ?? {}) } }}
              options={options}
              companies={companies}
              onChange={(field, value) => setField(group.key, field, value)}
            >
              <SuggestionActions
                group={group}
                review={review}
                openForm={openForm}
                busyKey={busyKey}
                draft={{ ...group.draft, ...(edits[group.key] ?? {}) }}
              />
            </SuggestionGroupCard>
          ))}
        </div>
      )}

      {modals}
    </div>
  );
}

