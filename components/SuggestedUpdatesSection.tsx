'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { SuggestionGroupCard } from '@/components/SuggestionGroupCard';
import { groupSuggestions, payloadFor, type SuggestionGroup } from '@/lib/suggestions/group';
import { useSuggestionCatalog } from '@/lib/suggestions/useSuggestionCatalog';
import { useCollapsibleSection } from '@/lib/sectionExpansion';
import { NewMeetingModal } from '@/components/NewMeetingModal';
import { TouchpointQuickModal } from '@/components/DashboardActionCard';
import { getTarget } from '@/lib/suggestions/registry';

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

  /**
   * A deferred activity, and the form it is waiting on.
   *
   * Held while the modal is open so the suggestion can be marked accepted when
   * — and only when — that form actually saves. Closing it without saving
   * leaves the card exactly where it was, which is what makes Save for Later
   * safe to press twice.
   */
  const [logging, setLogging] = useState<
    { kind: 'meeting' | 'touchpoint'; group: SuggestionGroup; payload: Record<string, unknown> } | null
  >(null);

  /** The ids the chooser stored alongside the fields, for reopening in place. */
  const openForm = (kind: 'meeting' | 'touchpoint', group: SuggestionGroup) =>
    setLogging({ kind, group, payload: group.members[0]?.payload ?? {} });

  /**
   * The form saved, so the question it was asked about is answered.
   *
   * Deliberately does NOT close the modal. Both forms stay mounted after a
   * successful save to offer a follow-on step — a calendar invite for a
   * meeting, "Log w/ Note" for a touchpoint — so unmounting here would take
   * that away. Closing is the modal's own business; this only records that
   * the suggestion no longer needs asking.
   */
  const onLogged = async (group: SuggestionGroup) => {
    await review(group, 'accept');
  };

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

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
              {/* A deferred activity asks the same question it asked when the
                  note was saved — Meeting, Touchpoint or neither — because
                  deferring a question should present that question later, not
                  something the reader has to work back to. There is no fourth
                  button: it is already saved. */}
              {isActivity(group) ? (
                <>
                  <button
                    type="button"
                    onClick={() => openForm('meeting', group)}
                    disabled={busyKey === group.key}
                    className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                  >
                    Meeting
                  </button>
                  <button
                    type="button"
                    onClick={() => openForm('touchpoint', group)}
                    disabled={busyKey === group.key}
                    className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                  >
                    Touchpoint
                  </button>
                  <button
                    type="button"
                    onClick={() => review(group, 'dismiss')}
                    disabled={busyKey === group.key}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2"
                  >
                    {busyKey === group.key ? 'Saving…' : 'Disregard'}
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
            </SuggestionGroupCard>
          ))}
        </div>
      )}

      {/* Opens on Log, as the chooser does: the note said it had happened. */}
      {logging?.kind === 'meeting' && (
        <NewMeetingModal
          isOpen
          onClose={() => setLogging(null)}
          onSuccess={() => void onLogged(logging.group)}
          defaultMode="log"
          prefillCompanyId={num(logging.payload.company_id)}
          prefillAttendeeId={num(logging.payload.attendee_id)}
          defaultConferenceId={num(logging.payload.conference_id)}
        />
      )}
      {logging?.kind === 'touchpoint' && (
        <TouchpointQuickModal
          onClose={() => setLogging(null)}
          onLogged={() => void onLogged(logging.group)}
          defaultCompanyId={num(logging.payload.company_id) ?? null}
          defaultAttendeeId={num(logging.payload.attendee_id) ?? null}
          defaultConferenceId={num(logging.payload.conference_id) ?? null}
        />
      )}
    </div>
  );
}

/** A group is an activity when every target in it opens a form. */
function isActivity(group: SuggestionGroup): boolean {
  return group.members.length > 0
    && group.members.every(m => getTarget(m.target_key)?.write === 'open_form');
}
