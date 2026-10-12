'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { autoBreaks, looksLikeLead, reassembles, segmentsFrom } from '@/lib/noteSplit';

interface SplitableNote { id: number; content: string }

/**
 * Where to cut a floor note that is really several.
 *
 * One screen, not two. The flow this replaces asked "split or keep?" and then
 * "auto or manual?" before showing anything — three decisions to reach a
 * result. The split costs nothing to compute, so it is simply shown, and both
 * other answers are buttons on it: keep it whole, or move the cuts yourself.
 *
 * Every cut is a POSITION in the note, and the pieces are slices of it. There
 * is no state here holding rewritten text, so no amount of clicking can lose a
 * sentence or change a word — see lib/noteSplit.
 */
export function SplitNoteModal({ note, onClose, onKeepWhole, onSplit }: {
  note: SplitableNote;
  onClose: () => void;
  /** Hand the note to the ordinary assign flow, uncut. */
  onKeepWhole: () => void;
  /** The notes the split created, in the order they were cut. */
  onSplit: (notes: unknown[]) => void;
}) {
  /*
   * Only the start of a line can be a cut. Blank lines are not shown — there
   * is nothing in them to read — but their offsets still count, so a cut
   * proposed at the start of a paragraph lands on a line that is on screen.
   */
  const lines = useMemo(() => {
    const out: { text: string; start: number }[] = [];
    let at = 0;
    for (const raw of note.content.split('\n')) {
      if (raw.trim()) out.push({ text: raw, start: at });
      at += raw.length + 1;
    }
    return out;
  }, [note.content]);

  const [breaks, setBreaks] = useState<number[]>(() => {
    const auto = autoBreaks(note.content);
    const valid = new Set(lines.map(l => l.start).concat(0));
    return auto.filter(b => valid.has(b));
  });

  const segments = useMemo(() => segmentsFrom(note.content, breaks), [note.content, breaks]);

  /*
   * A piece that does not open like a lead is proposed for the bin rather than
   * silently dropped — the covering note at the top of a relayed thread is the
   * usual one, and it is addressed to everybody and about nobody. The tick is
   * right there to put it back.
   *
   * Held by OFFSET, not by position in the list. Keyed by position, every
   * adjustment to a cut renumbers the pieces underneath it and the bin comes
   * to mean something else — which in practice meant moving one cut quietly
   * put the covering note back in. An offset survives an edit somewhere else,
   * and when a piece is merged away its offset simply stops matching.
   */
  const [dropped, setDropped] = useState<Set<number>>(() => {
    const segs = segmentsFrom(note.content, autoBreaks(note.content));
    return new Set(segs.filter(s => !looksLikeLead(s.text)).map(s => s.start));
  });

  const [saving, setSaving] = useState(false);

  const toggleBreak = (at: number) => {
    setBreaks(prev => (prev.includes(at) ? prev.filter(b => b !== at) : [...prev, at].sort((a, b) => a - b)));
  };

  const clearBreaks = () => { setBreaks([0]); setDropped(new Set()); };

  const segmentOf = (start: number) => {
    let i = 0;
    for (let s = 0; s < segments.length; s++) if (segments[s].start <= start) i = s;
    return i;
  };

  const keep = segments.map((s, i) => ({ s, i })).filter(({ s }) => !dropped.has(s.start) && s.text.trim().length > 0);
  const whole = reassembles(note.content, segments);
  const canSplit = keep.length >= 2 && whole && !saving;

  const handleSplit = async () => {
    if (!canSplit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quick-notes/${note.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /*
         * Offsets are what this screen holds, because they survive a cut being
         * moved. The route speaks in positions in the list, so they are turned
         * back into indices here, against the very segments shown — the two
         * cannot disagree, because they are computed from the same breaks that
         * are being sent.
         */
        body: JSON.stringify({
          breaks,
          drop: segments.map((s, i) => (dropped.has(s.start) ? i : -1)).filter(i => i >= 0),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to split note.');
      }
      const { notes } = await res.json() as { notes: unknown[] };
      toast.success(`Split into ${notes.length} notes.`);
      onSplit(notes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to split note.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className="modal-sheet-mobile bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto flex flex-col p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-brand-primary font-serif">This note covers several accounts</h3>
            <p className="text-xs text-gray-500 mt-1">
              Split it and each lead comes back into the queue as its own note, filed the way any other note is filed.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded flex-shrink-0" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-gray-500">
            {keep.length} note{keep.length === 1 ? '' : 's'} · tap a line to cut above it
          </p>
          <button
            type="button"
            onClick={clearBreaks}
            className="text-xs font-medium text-brand-secondary hover:underline"
          >
            Clear the cuts
          </button>
        </div>

        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
          {lines.map((line, i) => {
            const isBreak = breaks.includes(line.start);
            const seg = segmentOf(line.start);
            const isDropped = dropped.has(segments[seg].start);
            return (
              <div key={line.start}>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleBreak(line.start)}
                    className="w-full flex items-center gap-2 px-3 py-1 group"
                    aria-label={isBreak ? 'Join to the piece above' : 'Cut above this line'}
                  >
                    <span className={`flex-1 h-px ${isBreak ? 'bg-brand-secondary' : 'bg-gray-100 group-hover:bg-gray-300'}`} />
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border transition-colors ${
                      isBreak
                        ? 'bg-blue-50 text-brand-secondary border-blue-200'
                        : 'bg-white text-gray-300 border-gray-200 group-hover:text-gray-500 group-hover:border-gray-300'
                    }`}>
                      {isBreak ? 'cut' : 'join'}
                    </span>
                    <span className={`flex-1 h-px ${isBreak ? 'bg-brand-secondary' : 'bg-gray-100 group-hover:bg-gray-300'}`} />
                  </button>
                )}
                <div className={`flex gap-3 px-3 py-2 ${isDropped ? 'bg-gray-50' : ''}`}>
                  <span className={`flex-shrink-0 w-6 text-[11px] font-bold pt-0.5 ${isDropped ? 'text-gray-300' : 'text-brand-secondary'}`}>
                    {isDropped ? '—' : keep.findIndex(k => k.i === seg) + 1}
                  </span>
                  <p className={`flex-1 min-w-0 text-[13px] leading-relaxed break-words ${isDropped ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-700'}`}>
                    {line.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDropped(prev => {
                      const next = new Set(prev);
                      const key = segments[seg].start;
                      if (next.has(key)) next.delete(key); else next.add(key);
                      return next;
                    })}
                    className="flex-shrink-0 text-[10px] font-medium text-gray-400 hover:text-brand-secondary self-start pt-0.5"
                  >
                    {isDropped ? 'keep' : 'skip'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/*
          Stated rather than assumed. The pieces are slices taken at sorted
          offsets, so they rebuild the note by construction — but this is the
          gate anything else placing the cuts has to pass, and the server runs
          it again before writing a row.
        */}
        <p className={`text-xs mt-3 flex items-center gap-1.5 ${whole ? 'text-green-700' : 'text-red-600'}`}>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={whole ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} />
          </svg>
          {whole
            ? 'The pieces rebuild the note exactly — nothing is reworded or lost.'
            : 'These cuts do not rebuild the note. Nothing will be written.'}
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
          <button type="button" onClick={onKeepWhole} className="btn-secondary text-sm">Keep as one note</button>
          <button type="button" onClick={handleSplit} disabled={!canSplit} className="btn-primary text-sm">
            {saving ? 'Splitting…' : `Create ${keep.length} notes`}
          </button>
        </div>
      </div>
    </div>
  );
}
