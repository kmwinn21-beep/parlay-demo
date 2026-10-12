/**
 * Cutting one floor note into the several notes it is really made of.
 *
 * A note relayed from the floor is often a dozen leads in one message — a rep
 * or a region, then who was spoken to, then what they asked for, repeated down
 * the page. Filed as one note it can only land on one record, and the
 * extraction that runs on assignment (see app/api/quick-notes/[id]/route.ts)
 * reads every vendor in it against that one company. So a note about eleven
 * accounts does not merely fail to file ten of them: it proposes their vendors
 * as the eleventh's.
 *
 * Split into eleven notes, each lands where it belongs and the machinery that
 * already exists does the rest — the same assign modal, the same company and
 * attendee matching, the same extraction, now with one company to resolve to.
 *
 * ── Why this is indices and not strings ────────────────────────────────────
 *
 * Everything here describes a cut as a POSITION in the original. A segment is
 * a [start, end) pair, and the pieces are taken by slicing. Nothing rewrites,
 * reflows or re-types the note, which makes losing a sentence or quietly
 * rewording one structurally impossible rather than merely unlikely.
 *
 * That matters most for the thing not built yet. If a model is ever asked to
 * place the cuts, it returns positions and `reassembles` checks them — and a
 * split whose pieces do not rebuild the original character for character is
 * thrown away before anyone sees it.
 *
 * ── And why it does not use the company list ───────────────────────────────
 *
 * Detection runs on every note in the list, on a phone, at a conference. It
 * reads the note's SHAPE and nothing else: no fetch, no model, no waiting, and
 * correct in a lift with no signal. The company list is loaded by the assign
 * modal, and that is where the names actually get matched — this only has to
 * decide whether to offer the split at all.
 */

export interface NoteSegment {
  /** Index in the original where this piece begins. */
  start: number;
  /** Index in the original where it ends, exclusive. */
  end: number;
  /** The piece itself — `original.slice(start, end)`, never anything else. */
  text: string;
}

/** The dash that separates a floor note's fields, in the spellings it is written. */
const FIELD_SEP = /\s+-\s*|\s*-\s+|\s+·\s*|\s*\|\s*/;

/** A run of blank lines: where one lead ends and the next begins. */
const BLANK_RUN = /\n[ \t]*(?:\n[ \t]*)+/g;

/**
 * Does this read as the opening of a lead?
 *
 * A lead opens with a name or a place — "Mike V", "Paul", "Henri/Dan",
 * "Minnesota", "Care Initiatives" — and then runs through dash-separated
 * fields. So: a head of one to three words, every one of them capitalised, in
 * front of at least one more field.
 *
 * The capitalisation is what earns its place. Prose uses the same dashes —
 * "From yesterday - we are going to be here until Weds - so if you can reach
 * out" has the shape exactly, and is not a lead. Its head carries a lowercase
 * word, and no name or region does.
 */
export function looksLikeLead(segment: string): boolean {
  return leadHead(segment) !== null;
}

/**
 * A lead's opening field — the rep, or the region, it is addressed to.
 *
 * Null when the segment does not open like a lead at all, which is what
 * `looksLikeLead` is asking. Shared so that the test deciding whether to offer
 * a split and the scan deciding who a follow-up belongs to can never disagree
 * about where the head ends.
 */
export function leadHead(segment: string): string | null {
  const line = segment.trim().split('\n')[0]?.trim() ?? '';
  if (!line) return null;
  const fields = line.split(FIELD_SEP).map(f => f.trim()).filter(Boolean);
  if (fields.length < 2) return null;

  const head = fields[0];
  if (head.includes('@')) return null;
  // A slash joins two names into one head — "Henri/Dan", "Kristy/Amy".
  const parts = head.split(/[\s/]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return null;
  return parts.every(w => /^[A-Z]/.test(w)) ? head : null;
}

/** A lead's fields after the head, in order, as the note writes them. */
export function leadFields(segment: string): string[] {
  const line = segment.trim().split('\n')[0]?.trim() ?? '';
  return line.split(FIELD_SEP).map(f => f.trim()).filter(Boolean).slice(1);
}

/**
 * Where the cuts go, read from the note's own punctuation.
 *
 * Blank lines first, because that is how a relayed thread is written and it
 * needs no interpretation at all. A note typed as consecutive lines with no
 * blank between them falls through to the second rule: cut before any line
 * that opens like a lead, which is the same test the pill uses.
 *
 * Always starts at 0 — the first segment begins where the note does.
 */
export function autoBreaks(text: string): number[] {
  const breaks = [0];

  BLANK_RUN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLANK_RUN.exec(text)) !== null) {
    const at = m.index + m[0].length;
    if (at > 0 && at < text.length) breaks.push(at);
  }

  if (breaks.length > 2) return breaks;

  /*
   * No blank lines to go on. Cut before each line that opens like a lead —
   * but only when that finds several, since one or two is just a note with a
   * dash in it.
   */
  const lineBreaks = [0];
  let at = 0;
  for (const line of text.split('\n')) {
    if (at > 0 && looksLikeLead(line)) lineBreaks.push(at);
    at += line.length + 1;
  }
  return lineBreaks.length > 2 ? lineBreaks : breaks;
}

/**
 * The pieces a set of cuts makes.
 *
 * Contiguous and exhaustive by construction: every character of the original
 * is in exactly one segment, so the pieces always rebuild it.
 */
export function segmentsFrom(text: string, breaks: number[]): NoteSegment[] {
  const starts = Array.from(new Set(breaks.filter(b => Number.isInteger(b) && b >= 0 && b < text.length)))
    .sort((a, b) => a - b);
  if (starts.length === 0 || starts[0] !== 0) starts.unshift(0);

  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    return { start, end, text: text.slice(start, end) };
  });
}

/**
 * Do these pieces rebuild the note, character for character?
 *
 * True by construction for anything `segmentsFrom` produced, and that is the
 * point of checking it anyway: it is the gate any other source of cuts has to
 * pass. Called on the server before a single note is written, so a split can
 * never drop a sentence or hand back a tidied-up paraphrase of one.
 */
export function reassembles(text: string, segments: NoteSegment[]): boolean {
  if (segments.length === 0) return text.length === 0;
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  let at = 0;
  for (const s of sorted) {
    if (s.start !== at) return false;
    if (s.end < s.start || s.end > text.length) return false;
    if (s.text !== text.slice(s.start, s.end)) return false;
    at = s.end;
  }
  return at === text.length;
}

/**
 * Which note each piece goes to.
 *
 * One entry per piece: the index of its group's FIRST piece, or -1 to throw it
 * away. A piece on its own holds its own index.
 *
 * One number per piece is what keeps the guarantee. A piece cannot be in two
 * notes, because it has one number; it cannot be in none, because it has one
 * number. Grouping by lists of indices allows both, and would need checking
 * for both.
 */
export type Assignment = number[];

export interface NoteGroup {
  /** The index of the first piece, which is also the group's id. */
  leader: number;
  members: NoteSegment[];
}

/** Every piece its own note — what a fresh split starts as. */
export function ownGroups(count: number): Assignment {
  return Array.from({ length: count }, (_, i) => i);
}

/**
 * Is this a legal assignment?
 *
 * The rule that matters is the last one: a piece named as a leader has to lead
 * itself. It forbids chains (A joined to B joined to C), which would otherwise
 * need following and could loop, and it forbids a group whose leader has been
 * thrown away.
 */
export function validAssignment(segments: NoteSegment[], assign: Assignment): boolean {
  if (!Array.isArray(assign) || assign.length !== segments.length) return false;
  for (const v of assign) {
    if (!Number.isInteger(v)) return false;
    if (v !== -1 && (v < 0 || v >= segments.length)) return false;
  }
  return assign.every(v => v === -1 || assign[v] === v);
}

/**
 * The notes an assignment makes, in the order the note wrote them.
 *
 * Groups are ordered by their first piece and members by their position, so a
 * joined note reads down the page the way the original did — the reader is
 * checking it against a note they have in front of them.
 */
export function groupsFrom(segments: NoteSegment[], assign: Assignment): NoteGroup[] {
  const groups: NoteGroup[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (assign[i] !== i) continue;
    const members = segments.filter((_, j) => assign[j] === i);
    if (members.some(m => m.text.trim())) groups.push({ leader: i, members });
  }
  return groups;
}

/**
 * The text a group becomes.
 *
 * Each piece keeps its own words exactly. Two pieces that were not neighbours
 * cannot be one continuous slice of the note, so they are separated by a blank
 * line — the one place a new note is not byte-for-byte a span of the old one,
 * and the reason `reassembles` checks the PIECES rather than the result.
 */
export function groupText(group: NoteGroup): string {
  return group.members.map(m => m.text.trim()).filter(Boolean).join('\n\n');
}

export interface MultiAccountResult {
  /** How many pieces the note would be cut into. */
  segments: number;
  /** How many of those open like a lead. */
  leads: number;
  /** Whether to offer the split at all. */
  isMulti: boolean;
}

/**
 * Three, not two.
 *
 * Two lead-shaped lines is a note someone wrote with a dash in it as often as
 * it is two accounts, and a pill that cries wolf on ordinary notes gets
 * ignored on the one that matters. Three is where the shape stops happening
 * by accident.
 */
const MIN_LEADS = 3;

/** Below this a note is one thought, whatever punctuation it happens to carry. */
const MIN_LENGTH = 200;

/**
 * Is this note about several accounts?
 *
 * Deliberately cheap: it runs on every note in the list, every render, and
 * bails on length before doing anything at all. Nothing is stored — a note
 * edited from eleven leads down to one stops being tagged the moment it is
 * saved, with no field to go stale.
 */
export function detectMultiAccount(text: string): MultiAccountResult {
  const none = { segments: 0, leads: 0, isMulti: false };
  if (!text || text.length < MIN_LENGTH) return none;

  const segments = segmentsFrom(text, autoBreaks(text));
  if (segments.length < MIN_LEADS) return none;

  const leads = segments.filter(s => looksLikeLead(s.text)).length;
  return { segments: segments.length, leads, isMulti: leads >= MIN_LEADS };
}
