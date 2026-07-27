'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { MentionTextarea } from '../MentionTextarea';
import { useUserOptions } from '@/lib/useUserOptions';
import { type PlanNote, type PlanNoteSection } from './types';

export const SECTION_LABELS: Record<PlanNoteSection, string> = {
  deadlines: 'Deadlines',
  registration: 'Registration',
  booth: 'Booth',
  sponsorship: 'Sponsorship',
  speaking: 'Speaking',
  travel: 'Travel',
  hosted: 'Hosted Events',
  shipping: 'Shipping',
  postshow: 'Post-show',
  files: 'Files',
};

function formatNoteTimestamp(iso: string): string {
  const d = new Date(iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

export function NoteCard({ note, showSectionPill }: { note: PlanNote; showSectionPill?: boolean }) {
  return (
    <div className="border border-gray-100 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-secondary/10 text-brand-secondary">
          {note.userName}
        </span>
        <span className="text-[10px] text-gray-400">{formatNoteTimestamp(note.createdAt)}</span>
        {showSectionPill && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
            {SECTION_LABELS[note.section]}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{note.body}</p>
    </div>
  );
}

// Absolutely positioned within ConferencePlanLogisticsDrawer's body wrapper
// (the flex-1 overflow-y-auto div, itself already positioned right below the
// header/context-strip/tab bar) — so this naturally spans exactly "below the
// header tab buttons" to the bottom of the drawer without needing to measure
// anything.
export function AllSectionNotesDrawer({
  section, notes, onClose,
}: {
  section: PlanNoteSection;
  notes: PlanNote[];
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-20 bg-white flex flex-col"
      style={{ animation: 'planNotesSlideUp 0.2s ease-out' }}
    >
      <style>{`@keyframes planNotesSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-700">{SECTION_LABELS[section]} Notes</p>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {notes.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">No notes yet.</p>
        ) : (
          notes.map(n => <NoteCard key={n.id} note={n} />)
        )}
      </div>
    </div>
  );
}

// Submit box + latest note + "Show All Notes" for one drawer tab's section.
// `notes` is the drawer's full, unfiltered list (already sorted newest-first
// by the API) — filtered down to this section here so every tab shares one
// fetch instead of each issuing its own. The "Show All Notes" sub-drawer
// itself is NOT rendered here — it needs to be absolutely positioned against
// ConferencePlanLogisticsDrawer's body wrapper (so it spans exactly "below
// the tab bar" regardless of which tab/how deep this component is nested),
// so onShowAll just tells the parent drawer which section to show.
export function PlanSectionNotes({
  conferenceId, planYear, section, notes, onNoteCreated, onShowAll,
}: {
  conferenceId: number;
  planYear: number;
  section: PlanNoteSection;
  notes: PlanNote[];
  onNoteCreated: (note: PlanNote) => void;
  onShowAll: (section: PlanNoteSection) => void;
}) {
  const userOptions = useUserOptions();
  const [draft, setDraft] = useState('');
  const [taggedUserIds, setTaggedUserIds] = useState<number[]>([]);
  const [posting, setPosting] = useState(false);

  const sectionNotes = notes.filter(n => n.section === section);
  const latest = sectionNotes[0] ?? null;

  const handleMentionAdd = (configId: number) => {
    setTaggedUserIds(prev => prev.includes(configId) ? prev : [...prev, configId]);
  };

  const handleSubmit = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/notes?year=${planYear}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, body, taggedUsers: taggedUserIds.length > 0 ? taggedUserIds.join(',') : null }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as PlanNote;
      onNoteCreated(created);
      setDraft('');
      setTaggedUserIds([]);
    } catch {
      toast.error('Failed to add note');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</p>
      <MentionTextarea
        value={draft}
        onChange={setDraft}
        onMentionAdd={handleMentionAdd}
        userOptions={userOptions}
        rows={2}
        placeholder="Add a note… (type @ to mention a user)"
        className="input-field text-xs w-full py-1.5 resize-none"
      />
      <div className="flex justify-end">
        <button type="button" onClick={handleSubmit} disabled={posting || !draft.trim()} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
          {posting ? 'Posting…' : 'Submit'}
        </button>
      </div>

      {latest && <NoteCard note={latest} />}

      {sectionNotes.length > 1 && (
        <button
          type="button"
          onClick={() => onShowAll(section)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-secondary hover:text-brand-primary transition-colors"
        >
          Show All Notes
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-secondary text-white text-[10px] font-bold">
            {sectionNotes.length}
          </span>
        </button>
      )}
    </div>
  );
}
