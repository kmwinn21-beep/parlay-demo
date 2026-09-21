/**
 * Did this note describe an interaction that already happened?
 *
 * One question, deliberately. Whether coffee at a booth counts as a touchpoint
 * or as a meeting depends on how a team uses those words, not on the sentence,
 * so this does not guess — the person who just wrote the note is asked. That
 * keeps the hard, subjective call with the only party who can make it, and
 * leaves this module with a job it can actually do reliably.
 *
 * ── What is hard here ────────────────────────────────────────────────────────
 *
 * Not "meeting" versus "touchpoint". The real discrimination is between an
 * interaction that HAPPENED and one somebody INTENDS:
 *
 *     "Had coffee with Kevin. They want to schedule a follow up meeting"
 *
 * Every conference note ends like that second clause. A scanner that reads the
 * word "meeting" anywhere fires on almost every note ever written, and a prompt
 * that appears when nothing happened costs a dismissal every single time — which
 * is worse than not having the feature.
 *
 * Three rules do the work, and they are not equally load-bearing.
 *
 * The first carries most of it: only PAST forms are listed as openers —
 * "grabbed coffee", never "grab coffee". An intention is expressed with an
 * infinitive, so most of them simply never match anything.
 *
 * The second is a veto on what sits immediately BEFORE a match, and it exists
 * for the cases English lets slip past the first: a passive "get" puts a past
 * participle after an intent marker, as in "want to get introduced to their
 * CFO". Mutation testing is what established that the veto is a second line of
 * defence rather than the primary one — deleting it broke only those cases.
 *
 * The third is that the veto looks BEFORE the match and no further than the
 * clause, which is what lets "Met with Kevin … want to schedule a follow up
 * meeting" still read as a meeting: "want to" governs "schedule", four words
 * later, and is not what matched. `scanForCompany` in ./noteScan.ts weighs the
 * words before a match the same way and for the same reason.
 *
 * ── Deliberately local, deliberately deterministic ───────────────────────────
 *
 * No model call. This runs on submit, in front of somebody standing on a
 * conference floor, and it decides whether a dialog appears in the next
 * hundred milliseconds. It also means it shares nothing with the vendor
 * extractor in ./extract.ts, which is a Haiku call behind a feature flag —
 * these two cannot break each other.
 *
 * Nothing here writes anything. The result opens a chooser the person answers.
 *
 * ── Calibration ──────────────────────────────────────────────────────────────
 *
 * The phrase lists below are drawn from two real examples and from variants
 * written to probe the edges, NOT from a corpus of this account's own notes.
 * They are a starting point to be tuned against what the Disregard button
 * reports back, and should be treated as such.
 */

/** A note's own record of where it came from, which is how a loop is avoided. */
export interface ScannableNote {
  content?: string | null;
  /** Set when the note was written by the Log Touchpoint form. */
  touchpoint_type?: string | null;
  /** 'meeting_note' when written by the meeting log. */
  note_type?: string | null;
  meeting_id?: number | null;
  /** Badge and business-card scans carry a parsed name, not prose. */
  tag?: string | null;
}

export interface ActivityHit {
  /** The words that matched, for the disclaimer to quote back. */
  phrase: string;
  /** Where they start in the note, so a caller can show the sentence. */
  index: number;
}

/**
 * Openers that describe an interaction in the past.
 *
 * Past forms only. "grabbed coffee" is a thing that happened; "grab coffee" is
 * a plan, and listing it would fire this on every note that ends with one.
 *
 * Ordered longest-first within each idea so the quoted phrase is the fullest
 * one — "sat down with" rather than the "sat down" inside it.
 */
const PAST_INTERACTION = [
  // Met
  'met up with', 'met with', 'met briefly', 'sat down with', 'caught up with',
  // Shared something
  'had coffee', 'had a coffee', 'grabbed coffee', 'got coffee',
  'had lunch', 'grabbed lunch', 'had breakfast', 'had dinner', 'grabbed dinner',
  'had drinks', 'grabbed drinks', 'had a drink',
  // Talked
  'spoke with', 'spoke to', 'talked with', 'talked to', 'chatted with',
  'had a call with', 'had a chat', 'had a conversation', 'had a good conversation',
  'good conversation with', 'long conversation with',
  // Booth and floor
  'stopped by the booth', 'stopped by our booth', 'stopped by', 'swung by',
  'came by the booth', 'came by our booth', 'came by', 'dropped by',
  'visited the booth', 'visited our booth', 'at the booth with',
  // Ran into
  'ran into', 'bumped into',
  // Showed something
  'walked through', 'walked her through', 'walked him through', 'walked them through',
  'gave a demo', 'demoed', "demo'd", 'demoed for', 'showed her', 'showed him', 'showed them',
  // Introduced
  'introduced to', 'was introduced', 'connected with',
];

/**
 * Words that turn a following interaction into a plan, a hope, or a non-event.
 *
 * Checked only in the short window immediately before a match. Anywhere else in
 * the note and they are describing something other than what matched — which is
 * the normal case, because notes routinely record what happened and then what
 * is meant to happen next.
 */
const INTENT_BEFORE = /\b(?:want|wants|wanted|would like|hoping|hope|hopes|plan|plans|planning|going|will|need|needs|needed|should|could|let's|lets|looking|asked|agreed|try|trying|aiming|due|scheduled|schedule|set up|setting up|arrange|arranging|book|booking|to)\b[^.!?]{0,12}$/i;

/**
 * Words that say the interaction did NOT happen.
 *
 * "Never got to meet with Kevin" is not a meeting, and reads as one to anything
 * that only looks for the verb.
 */
const NEGATED_BEFORE = /\b(?:didn't|did not|dont|don't|couldn't|could not|never|unable|missed|no chance|failed|without|instead of|rather than|not)\b[^.!?]{0,20}$/i;

/** How far back to look. Long enough for "we are hoping to", short enough to stay in the clause. */
const LOOKBACK = 28;

/**
 * Whether a note should be read at all.
 *
 * Logging a touchpoint writes a note of its own, and so does logging a meeting.
 * Both of those notes describe an interaction — that is the whole point of them
 * — so scanning them would offer to log what was just logged, and accepting
 * would write another note, and so on. A note that already knows which activity
 * it came from is never scanned.
 *
 * Badge and card scans are skipped for the reason ./noteScan.ts skips them:
 * they hold a parsed name, not a sentence, and there is nothing to read.
 */
export function shouldScanNote(note: ScannableNote): boolean {
  if (!String(note.content ?? '').trim()) return false;
  if (String(note.touchpoint_type ?? '').trim()) return false;
  if (String(note.note_type ?? '').trim().toLowerCase() === 'meeting_note') return false;
  if (note.meeting_id != null) return false;
  if (String(note.tag ?? '').trim().toLowerCase() === 'card-badge') return false;
  return true;
}

/**
 * The interaction a note describes, if it describes one.
 *
 * Returns the phrase that matched rather than a verdict about what kind of
 * activity it was. The chooser asks that; this only says there is something
 * worth asking about.
 *
 * Null means say nothing — which is the right answer far more often than not,
 * and is always better than a dialog somebody has to dismiss.
 */
export function scanForActivity(text: string): ActivityHit | null {
  const haystack = String(text ?? '');
  if (!haystack.trim()) return null;
  const lower = haystack.toLowerCase();

  let best: ActivityHit | null = null;

  for (const phrase of PAST_INTERACTION) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(phrase, from);
      if (at < 0) break;
      from = at + 1;

      // A phrase has to start on a word boundary: "remet with" is not "met
      // with", and "welcomed" is not "comed".
      const prevChar = at > 0 ? lower[at - 1] : ' ';
      if (/[a-z0-9]/.test(prevChar)) continue;

      const before = haystack.slice(Math.max(0, at - LOOKBACK), at);
      if (INTENT_BEFORE.test(before)) continue;
      if (NEGATED_BEFORE.test(before)) continue;

      // The earliest surviving match: a note opens with what happened and
      // closes with what should happen next, so the first one is the event.
      if (!best || at < best.index) {
        best = { phrase: haystack.slice(at, at + phrase.length), index: at };
      }
    }
  }

  return best;
}
