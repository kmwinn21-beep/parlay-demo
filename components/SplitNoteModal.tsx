'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  type Assignment, autoBreaks, groupsFrom, looksLikeLead, reassembles, segmentsFrom, validAssignment,
} from '@/lib/noteSplit';

interface SplitableNote { id: number; content: string }

/**
 * Where to cut a floor note that is really several, and which cuts belong
 * together.
 *
 * One screen, not two. The flow this replaces asked "split or keep?" and then
 * "auto or manual?" before showing anything — three decisions to reach a
 * result. The split costs nothing to compute, so it is simply shown, and both
 * other answers are buttons on it: keep it whole, or move the cuts yourself.
 *
 * Neighbours are joined with the rails between them. The same account turning
 * up twice with other leads in between is joined instead — by dragging one
 * piece onto the other, or from the piece's own "join" list, which is the
 * version that works one-handed and with a keyboard. The drag is the shortcut,
 * not the mechanism.
 *
 * Nothing here holds rewritten text. Cuts are POSITIONS, pieces are slices,
 * and the grouping is one number per piece — so no amount of clicking can lose
 * a sentence or change a word. See lib/noteSplit.
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
   * Membership and discarding are two different facts, and they are held
   * apart.
   *
   * They started as one map, where throwing a note away overwrote which pieces
   * belonged to it. Skipping a joined note then took both halves, correctly —
   * and keeping it again gave back only one, because the join had been
   * destroyed on the way through. Two pieces of state, and skip and keep are
   * each other's opposite again.
   *
   * Both are keyed by where a piece STARTS rather than by its position in the
   * list. Keyed by position, every adjustment to a cut renumbers the pieces
   * underneath it and the grouping comes to mean something else. An offset
   * survives an edit somewhere else, and when a piece is merged away its
   * offset simply stops matching.
   */
  /** Member's start offset → its note's first piece's start offset. */
  const [groupOf, setGroupOf] = useState<Map<number, number>>(() => new Map());
  /**
   * The first-piece offsets of notes that will not be created.
   *
   * A piece that does not open like a lead starts here rather than being
   * silently dropped — the covering note at the top of a relayed thread is the
   * usual one, addressed to everybody and about nobody. "keep" is right there
   * to put it back.
   */
  const [skipped, setSkipped] = useState<Set<number>>(() => {
    const segs = segmentsFrom(note.content, autoBreaks(note.content));
    return new Set(segs.filter(s => !looksLikeLead(s.text)).map(s => s.start));
  });

  const [saving, setSaving] = useState(false);
  const [joinMenuFor, setJoinMenuFor] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  /**
   * The grouping as the server wants it: one number per piece.
   *
   * Rebuilt from the offsets on every render rather than stored, so it cannot
   * drift from the cuts it describes. Anything that no longer resolves — a
   * leader whose offset was merged away — falls back to the piece being its
   * own note, which is always legal.
   */
  const leaderIndex = useMemo(() => {
    const indexOfStart = new Map(segments.map((s, i) => [s.start, i]));
    const first = segments.map((s, i) => {
      const held = groupOf.get(s.start);
      if (held === undefined) return i;
      const leader = indexOfStart.get(held);
      return leader === undefined ? i : leader;
    });
    // A piece can only follow a leader that leads itself — no chains to walk,
    // and no loops to walk them into.
    return first.map((v, i) => (first[v] === v ? v : i));
  }, [segments, groupOf]);

  const assign: Assignment = useMemo(
    () => leaderIndex.map(l => (skipped.has(segments[l].start) ? -1 : l)),
    [leaderIndex, skipped, segments],
  );

  const groups = useMemo(() => groupsFrom(segments, assign), [segments, assign]);

  /**
   * Pieces that a joined note reaches over without containing.
   *
   * They get a dashed rail, so the span between two halves of one note is
   * visible without suggesting the lines in between belong to it. Computed
   * once over the groups rather than asked per line, which is where the first
   * version of this turned into four nested searches.
   */
  const spannedBy = useMemo(() => {
    const out = new Set<number>();
    for (let i = 0; i < segments.length; i++) {
      if (assign[i] !== i) continue;
      const members = segments.map((_, j) => j).filter(j => assign[j] === i);
      if (members.length < 2) continue;
      for (let k = members[0] + 1; k < members[members.length - 1]; k++) {
        if (assign[k] !== i) out.add(k);
      }
    }
    return out;
  }, [segments, assign]);
  /** Which note number each piece lands in, 1-based, or null when discarded. */
  const noteNumberOf = useMemo(() => {
    const byLeader = new Map(groups.map((g, i) => [g.leader, i + 1]));
    return segments.map((_, i) => (assign[i] < 0 ? null : byLeader.get(assign[i]) ?? null));
  }, [segments, assign, groups]);

  const whole = reassembles(note.content, segments) && validAssignment(segments, assign);
  const canSplit = groups.length >= 2 && whole && !saving;

  const toggleBreak = (at: number) => {
    setBreaks(prev => (prev.includes(at) ? prev.filter(b => b !== at) : [...prev, at].sort((a, b) => a - b)));
    setJoinMenuFor(null);
  };

  const clearBreaks = () => { setBreaks([0]); setGroupOf(new Map()); setSkipped(new Set()); setJoinMenuFor(null); };

  const segmentOf = (start: number) => {
    let i = 0;
    for (let s = 0; s < segments.length; s++) if (segments[s].start <= start) i = s;
    return i;
  };

  /** Every piece in the same note as this one, discarded or not. */
  const membersOf = (i: number) => segments.filter((_, j) => leaderIndex[j] === leaderIndex[i]);

  /**
   * Put one note's pieces into another's.
   *
   * The whole group moves, not just the piece that was dragged — otherwise
   * joining a note that already had two pieces in it would silently leave one
   * behind.
   */
  const joinInto = (from: number, to: number) => {
    const target = leaderIndex[to];
    if (target === leaderIndex[from]) return;
    const moving = membersOf(from).map(s => s.start);
    const targetStart = segments[target].start;
    setGroupOf(prev => {
      const next = new Map(prev);
      for (const start of moving) next.set(start, targetStart);
      return next;
    });
    setJoinMenuFor(null);
  };

  /**
   * Take one piece back out into a note of its own.
   *
   * The first piece of a note holds no entry — the others point AT it — so
   * removing its entry did nothing at all, and "separate" on the top half of a
   * joined pair was a dead button. When the piece leaving is the one the
   * others point at, the next one along takes over, so the rest stay together
   * rather than scattering into notes of their own.
   */
  const separate = (i: number) => {
    const others = segments.map((_, j) => j).filter(j => leaderIndex[j] === leaderIndex[i] && j !== i);
    setGroupOf(prev => {
      const next = new Map(prev);
      next.delete(segments[i].start);
      if (leaderIndex[i] === i && others.length > 0) {
        const heir = segments[others[0]].start;
        next.delete(heir);
        for (const j of others.slice(1)) next.set(segments[j].start, heir);
      }
      return next;
    });
    setJoinMenuFor(null);
  };

  /**
   * Skip, or keep, the whole note this piece belongs to.
   *
   * The note, not the piece: a joined note is one decision, and taking half of
   * one away would leave the other half claiming to be two pieces.
   */
  const toggleSkip = (i: number) => {
    const key = segments[leaderIndex[i]].start;
    setSkipped(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setJoinMenuFor(null);
  };

  const handleSplit = async () => {
    if (!canSplit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quick-notes/${note.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /*
         * Positions and a grouping. The server reads the note itself and does
         * the slicing, so nothing here can reword a line or lose one.
         */
        body: JSON.stringify({ breaks, assign }),
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
      {/*
        The list scrolls, not the sheet.

        Both were true before: the sheet scrolled AND the list carried
        overflow-hidden for its rounded corners. As a flex child with no
        min-h-0 the list was then squashed to whatever was left over and clipped
        its own contents, so a note long enough to overflow simply lost its
        last few leads with no way to reach them. Pinning the header and the
        buttons also keeps "Create N notes" on screen, which is the thing a
        reader is scrolling towards.
      */}
      <div
        className="modal-sheet-mobile bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4 flex-shrink-0">
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

        <div className="flex items-center justify-between gap-3 mb-3 flex-shrink-0">
          <p className="text-xs text-gray-500">
            {groups.length} note{groups.length === 1 ? '' : 's'} · cut between lines, or join two that belong together
          </p>
          <button type="button" onClick={clearBreaks} className="text-xs font-medium text-brand-secondary hover:underline">
            Clear the cuts
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-lg">
          {lines.map((line, i) => {
            const seg = segmentOf(line.start);
            const number = noteNumberOf[seg];
            const isDropped = number === null;
            const joined = assign.filter(v => v === assign[seg]).length > 1;
            const isBreak = breaks.includes(line.start);
            const isDragTarget = dragOver === seg && dragging !== null && assign[dragging] !== assign[seg];
            const spanned = spannedBy.has(seg);

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

                <div
                  draggable={!isDropped}
                  onDragStart={e => { setDragging(seg); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragging(null); setDragOver(null); }}
                  onDragOver={e => { if (dragging !== null && !isDropped) { e.preventDefault(); setDragOver(seg); } }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragging !== null && !isDropped) joinInto(dragging, seg);
                    setDragging(null); setDragOver(null);
                  }}
                  className={`flex gap-2 px-3 py-2 transition-colors ${
                    isDragTarget ? 'bg-amber-50 ring-2 ring-amber-500 ring-inset'
                      : isDropped ? 'bg-gray-50'
                        : joined ? 'bg-amber-50/40 border-l-[3px] border-amber-700'
                          : ''
                  } ${dragging === seg ? 'opacity-40' : ''}`}
                >
                  {/* The grip.
                      Shipped without one, which made a row that can be dragged
                      look exactly like a row that cannot — and "I don't see
                      any way to join" was the entirely correct reading. */}
                  <span
                    className={`flex-shrink-0 pt-1 ${isDropped ? 'text-gray-200' : 'text-gray-300 cursor-grab'}`}
                    aria-hidden="true"
                  >
                    <svg className="w-3 h-4" viewBox="0 0 12 16" fill="currentColor">
                      <circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" />
                      <circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" />
                      <circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" />
                    </svg>
                  </span>
                  {/* The rail: solid for a piece in a joined note, dashed where
                      such a note merely spans this line. */}
                  <span
                    className={`flex-shrink-0 w-2 self-stretch ${
                      joined ? 'border-l-2 border-amber-700'
                        : spanned ? 'border-l-2 border-dashed border-amber-300'
                          : ''}`}
                    aria-hidden="true"
                  />
                  <span className={`flex-shrink-0 w-5 text-[11px] font-bold pt-0.5 ${
                    isDropped ? 'text-gray-300' : joined ? 'text-amber-800' : 'text-brand-secondary'
                  }`}>
                    {isDropped ? '—' : number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] leading-relaxed break-words ${
                      isDropped ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-700'
                    }`}>
                      {line.text}
                    </p>
                    {joined && !isDropped && (
                      <p className="text-[11px] font-medium text-amber-800 mt-1">
                        Note {number} · {assign.filter(v => v === assign[seg]).length} pieces
                      </p>
                    )}

                    {/* The actions, as controls you can see.
                        These were two words of 10px grey in the right margin,
                        which is how a feature ships and nobody finds it. */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={() => toggleSkip(seg)}
                        className="inline-flex items-center min-h-[30px] px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[11px] font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
                      >
                        {isDropped ? 'Keep' : 'Skip'}
                      </button>
                      {!isDropped && (joined ? (
                        <button
                          type="button"
                          onClick={() => separate(seg)}
                          className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-md border border-amber-300 bg-amber-50 text-[11px] font-medium text-amber-800 hover:border-amber-500 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          Separate
                        </button>
                      ) : groups.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setJoinMenuFor(joinMenuFor === seg ? null : seg)}
                          className={`inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                            joinMenuFor === seg
                              ? 'border-brand-secondary bg-blue-50 text-brand-secondary'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-brand-secondary hover:text-brand-secondary'
                          }`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
                          </svg>
                          Join to another note
                        </button>
                      ))}
                    </div>

                    {joinMenuFor === seg && (
                      <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-1.5 bg-gray-50">
                          Join this into…
                        </p>
                        {groups.filter(g => g.leader !== assign[seg]).map((g, gi) => {
                          const n = groups.findIndex(x => x.leader === g.leader) + 1;
                          return (
                            <button
                              key={g.leader}
                              type="button"
                              onClick={() => joinInto(seg, g.leader)}
                              className={`w-full text-left px-3 py-2 text-[12px] text-gray-700 hover:bg-blue-50 ${gi > 0 ? 'border-t border-gray-100' : ''}`}
                            >
                              <span className="font-bold text-brand-secondary mr-2">{n}</span>
                              <span className="text-gray-600">{g.members[0].text.trim().slice(0, 52)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );
          })}
        </div>

        {/*
          Stated rather than assumed. Two things have to hold: the pieces tile
          the note character for character, and every piece carries exactly one
          note number. The server checks both again before writing a row.
        */}
        <p className={`text-xs mt-3 flex items-center gap-1.5 flex-shrink-0 ${whole ? 'text-green-700' : 'text-red-600'}`}>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={whole ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} />
          </svg>
          {whole
            ? 'Every line lands in exactly one note — nothing is reworded or lost.'
            : 'These cuts do not account for the whole note. Nothing will be written.'}
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5 flex-shrink-0">
          <button type="button" onClick={onKeepWhole} className="btn-secondary text-sm">Keep as one note</button>
          <button type="button" onClick={handleSplit} disabled={!canSplit} className="btn-primary text-sm">
            {saving ? 'Splitting…' : `Create ${groups.length} notes`}
          </button>
        </div>
      </div>
    </div>
  );
}
