/**
 * Reading a floor note against what the account already holds.
 *
 * Deliberately local and deliberately deterministic — no model call. A floor
 * note is triaged in bulk at a conference, often on a phone with bad wifi, and
 * a modal that stalls while something is asked of an API is worse than one
 * that fills in nothing. This runs on lists the modal has already loaded, so
 * the fields are populated by the time it opens, and it keeps working when
 * extraction is switched off.
 *
 * Everything here is a suggestion the person confirms. Nothing matched here is
 * written anywhere on its own.
 */
import { leadFields, leadHead } from '@/lib/noteSplit';

export interface ScannableAttendee {
  id: number;
  first_name: string;
  last_name: string;
  company_id?: number | null;
  company_name?: string | null;
}

export interface ScannableCompany {
  id: number;
  name: string;
}

/** Case, punctuation and spacing are all noise when matching a name. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Words too common to identify anything. "Health", "Senior" and "Care" appear
 * in a large share of company names in this industry, so a note mentioning
 * health would otherwise match half the account.
 */
const WEAK_WORDS = new Set([
  'health', 'healthcare', 'senior', 'seniors', 'living', 'care', 'group', 'the',
  'and', 'llc', 'inc', 'corp', 'company', 'communities', 'community', 'services',
  'service', 'management', 'partners', 'systems', 'solutions', 'enterprises',
  'holdings', 'medical', 'center', 'centers', 'home', 'homes',
]);

/** A word that would identify a company on its own. */
function isStrong(w: string): boolean {
  return w.length >= 4 && !WEAK_WORDS.has(w);
}

/**
 * Where each letter of the squashed text came from, so a match found without
 * punctuation can still be located in the sentence it was written in.
 */
function squashWithMap(s: string): { sq: string; map: number[] } {
  let sq = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i].toLowerCase();
    if (c >= 'a' && c <= 'z') { sq += c; map.push(i); }
    else if (c >= '0' && c <= '9') { sq += c; map.push(i); }
  }
  return { sq, map };
}

/**
 * "…from Mission", "…at Mission" — the company someone was spoken to *from*.
 * Must be the word immediately before the name, so "follow up with her" can't
 * claim whatever happens to come later in the sentence.
 */
const SUBJECT_BEFORE = /\b(?:from|at|with|w\/|for)\s*$/i;

/**
 * Language that marks the company as something the subject *uses*, not who
 * they are: "they use Advent Health", "switching to Yardi". A note's second
 * half is usually a list of vendors, and none of them is the company the note
 * is about.
 */
const VENDOR_BEFORE = /\b(?:use|uses|using|used|on|onto|vendor|vendors|provider|providers|partner|partners|implemented|implementing|switching|switched|evaluating|considering|piloting|running|through|via)\b[^.]{0,24}$/i;

/** "…Lesley as one of their service providers" — the marker trails the name. */
const VENDOR_AFTER = /^[^.]{0,50}\b(?:as (?:one of )?(?:their|the)|is their|are their)\b[^.]{0,30}\b(?:vendor|provider|partner|service|system|platform|ehr|erp|crm)/i;

const SUBJECT_BONUS = 40;
const FIRST_SENTENCE_BONUS = 15;
const VENDOR_PENALTY = 120;

/**
 * The company a note is *about*.
 *
 * Conference notes have a shape: who was spoken to and where they are from,
 * then what they said — and what they said is usually a list of other
 * companies they buy from. Matching on names alone reads those vendors as the
 * subject, so this weighs where in the sentence a name appears and what sits
 * either side of it: right after "from" is who they are, right after "they
 * use" is who they buy from.
 *
 * Scored on evidence, never on how long a company's name happens to be.
 */
export function scanForCompany<T extends ScannableCompany>(text: string, companies: T[]): T | null {
  const { sq: squashedHay, map } = squashWithMap(text);
  const firstStop = text.indexOf('.') >= 0 ? text.indexOf('.') : text.length;

  let best: { company: T; score: number } | null = null;
  // Two companies scoring the same is a coin toss, and a coin toss presented
  // as a suggestion is worse than no suggestion.
  let tied = false;

  for (const c of companies) {
    const name = c.name.trim();
    if (!name) continue;

    let base = 0;
    let at = -1;

    const whole = squash(name);
    const wholeIdx = whole.length >= 4 ? squashedHay.indexOf(whole) : -1;
    if (wholeIdx >= 0) {
      base = 100;
      at = map[wholeIdx];
    } else {
      const strong = words(name).filter(isStrong);
      if (strong.length === 0) continue;
      // A note writes "Ridgeline", not "Ridgeline Family Medicine", so the
      // leading word is enough to be a candidate — but the more of the name
      // that is actually present, the stronger the reading. That ordering is
      // what keeps "Mission Health" ahead of "Mission Ridge Partners" on a
      // note that only says "Mission".
      let earliest = Infinity;
      let found = 0;
      for (const w of strong) {
        const i = squashedHay.indexOf(w);
        if (i < 0) continue;
        found += 1;
        earliest = Math.min(earliest, map[i]);
      }
      if (found === 0) continue;
      // The distinctive first word carries the name; matching only a trailing
      // generic-ish word is a coincidence, not a mention.
      if (squashedHay.indexOf(strong[0]) < 0) continue;
      // Two terms, and both matter: how much of the name is present, and how
      // much of it there is. Otherwise "Mission Ridge" reads as a tie between
      // "Mission Ridge Partners" and "Mission Health", when the first plainly
      // accounts for more of what was written.
      base = 40 + Math.round(20 * (found / strong.length)) + 5 * found;
      at = earliest;
    }

    const before = text.slice(Math.max(0, at - 40), at);
    const after = text.slice(at + name.length > text.length ? text.length : at + squash(name).length);

    let score = base;
    if (SUBJECT_BEFORE.test(before)) score += SUBJECT_BONUS;
    if (at < firstStop) score += FIRST_SENTENCE_BONUS;
    if (VENDOR_BEFORE.test(before)) score -= VENDOR_PENALTY;
    if (VENDOR_AFTER.test(after)) score -= VENDOR_PENALTY;

    // Everything left looking like a vendor is worse than no answer at all.
    if (score <= 0) continue;

    if (!best || score > best.score) { best = { company: c, score }; tied = false; }
    else if (score === best.score) tied = true;
  }

  return tied ? null : best?.company ?? null;
}

/**
 * The attendee a note names.
 *
 * Notes use first names — "Spoke to Tina" — so a first name alone counts, but
 * only when it lands on one person. Duplicate records are common enough (two
 * badge scans of the same person) that the company the note names is used to
 * choose between them: "Tina from Mission" is the Tina at Mission Health.
 * Still ambiguous after that and nothing is suggested, rather than a coin toss
 * presented as a suggestion.
 */
export function scanForAttendee<T extends ScannableAttendee>(
  text: string,
  attendees: T[],
  companyHint?: { id: number; name?: string } | null,
): T | null {
  const haystack = ` ${text.toLowerCase()} `;
  const has = (w: string) => !!w && (haystack.includes(` ${w.toLowerCase()} `) || haystack.includes(` ${w.toLowerCase()}'`) || haystack.includes(` ${w.toLowerCase()},`) || haystack.includes(` ${w.toLowerCase()}.`));

  /** Same name at the same company is one human recorded twice, not a choice. */
  const sameHuman = (list: T[]) => list.every(a =>
    a.first_name?.trim().toLowerCase() === list[0].first_name?.trim().toLowerCase()
    && a.last_name?.trim().toLowerCase() === list[0].last_name?.trim().toLowerCase()
    && a.company_id === list[0].company_id);

  const narrow = (list: T[]): T | null => {
    if (list.length === 1) return list[0];
    if (list.length > 1 && companyHint) {
      // By name as well as id: the same company is often on file twice after
      // imports and badge scans, and the row a note resolves to need not be
      // the row an attendee hangs off.
      const hintName = companyHint.name?.trim().toLowerCase();
      const atCompany = list.filter(a =>
        a.company_id === companyHint.id
        || (!!hintName && a.company_name?.trim().toLowerCase() === hintName));
      if (atCompany.length === 1) return atCompany[0];
      // Two badge scans of the same person leave two identical records. The
      // oldest is the one other things are most likely already hanging off.
      if (atCompany.length > 1 && sameHuman(atCompany)) {
        return atCompany.reduce((a, b) => (a.id <= b.id ? a : b));
      }
    }
    if (list.length > 1 && sameHuman(list)) return list.reduce((a, b) => (a.id <= b.id ? a : b));
    return null;
  };

  // Full name, or first and last both present: the strongest reading.
  const full = attendees.filter(a => {
    const first = a.first_name?.trim() ?? '';
    const last = a.last_name?.trim() ?? '';
    return first && last && has(first) && has(last);
  });
  if (full.length > 0) return narrow(full);

  return narrow(attendees.filter(a => has(a.first_name?.trim() ?? '')));
}

export interface ActionOption { id: number; value: string; shortName?: string }

/**
 * The phrasings that point at a follow-up action.
 *
 * Keyed by the words an option's own name would never contain — a note says
 * "schedule a demo", not "Schedule F/U Meeting". Options are matched on their
 * own words first; this is what catches the rest.
 */
const ACTION_PHRASES: Array<{ phrases: string[]; matches: string[] }> = [
  { phrases: ['schedule a demo', 'set up a demo', 'book a demo', 'schedule a call', 'set up a call', 'schedule a meeting', 'set up time', 'get time on', 'follow up with her to schedule', 'follow up with him to schedule'], matches: ['meeting', 'demo', 'f/u'] },
  { phrases: ['send pricing', 'send a quote', 'send over pricing', 'proposal', 'send numbers'], matches: ['pricing', 'proposal', 'quote'] },
  { phrases: ['send collateral', 'send over the deck', 'send the deck', 'send materials', 'send info', 'send information', 'send one pager', 'shoot her the', 'shoot him the'], matches: ['collateral', 'materials', 'deck'] },
  { phrases: ['connect on linkedin', 'linkedin'], matches: ['linkedin'] },
  { phrases: ['add to nurture', 'nurture sequence', 'drip', 'keep warm'], matches: ['nurture'] },
  { phrases: ['invite to', 'invite them to', 'invite her to', 'invite him to'], matches: ['invite', 'event'] },
];

/**
 * The follow-up action a note describes, from the account's own list.
 *
 * Matched two ways: on an option's own words appearing in the note, and on the
 * phrasings above mapped to the words an option name would carry. Nothing
 * close enough means nothing suggested — a blank action the person can fill is
 * the correct answer, not the nearest option regardless of fit.
 */
export function scanForAction<T extends ActionOption>(text: string, actions: T[]): T | null {
  const lower = text.toLowerCase();
  const hay = ` ${lower} `;

  // An option whose own distinctive words are in the note.
  let best: { action: T; score: number } | null = null;
  for (const a of actions) {
    const strong = words(a.value).filter(w => w.length >= 5 && !WEAK_WORDS.has(w));
    const hits = strong.filter(w => hay.includes(` ${w}`));
    if (hits.length > 0) {
      const score = 50 * hits.length;
      if (!best || score > best.score) best = { action: a, score };
    }
  }
  if (best) return best.action;

  // Otherwise the phrasing a note would actually use.
  for (const { phrases, matches } of ACTION_PHRASES) {
    if (!phrases.some(p => lower.includes(p))) continue;
    const hit = actions.find(a => {
      const v = a.value.toLowerCase();
      return matches.some(m => v.includes(m));
    });
    if (hit) return hit;
  }
  return null;
}

// ── Who the lead is for ──────────────────────────────────────────────────────

export interface RepOption { id: number; value: string }
export interface TerritoryOption { id: number; name: string; assignedUserIds: number[] }

/** One letter wrong, or one missing, or one extra. "Nebreska" is "Nebraska". */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diffs = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diffs > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return diffs + (a.length - i) + (b.length - j) <= 1;
}

/**
 * A rep named the way a note names one.
 *
 * Three readings, narrowing: the whole name, a first name and a last initial
 * ("Mike V" for Mike Vance), and a bare first name — that last one only when
 * it lands on exactly one person. Two Pauls on the roster and the right answer
 * is no answer, because the field is about to be shown to someone who knows
 * which Paul it was.
 */
function matchRep(name: string, reps: RepOption[]): number | null {
  const want = squash(name);
  if (!want) return null;

  const exact = reps.filter(r => squash(r.value) === want);
  if (exact.length === 1) return exact[0].id;

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && parts[1].replace(/\./g, '').length === 1) {
    const first = parts[0].toLowerCase();
    const initial = parts[1][0].toLowerCase();
    const hits = reps.filter(r => {
      const w = r.value.split(/\s+/).filter(Boolean);
      return w.length >= 2
        && w[0].toLowerCase() === first
        && w[w.length - 1][0]?.toLowerCase() === initial;
    });
    if (hits.length === 1) return hits[0].id;
  }

  if (parts.length === 1) {
    const first = parts[0].toLowerCase();
    const hits = reps.filter(r => r.value.split(/\s+/)[0]?.toLowerCase() === first);
    if (hits.length === 1) return hits[0].id;
  }
  return null;
}

/**
 * A region, resolved through the territory map to the rep who covers it.
 *
 * Only when exactly one rep sits on the territory. Two and it cannot be read
 * off the note at all, so the field is left for a person — the same rule the
 * attendee upload's territory fallback already follows, for the same reason.
 */
function matchTerritory(name: string, territories: TerritoryOption[]): number | null {
  const want = squash(name);
  if (want.length < 4) return null;
  const hit = territories.find(t => withinOneEdit(squash(t.name), want));
  if (!hit) return null;
  return hit.assignedUserIds.length === 1 ? hit.assignedUserIds[0] : null;
}

/**
 * Who a relayed lead belongs to.
 *
 * A floor note forwarded from the floor opens each lead with the person it is
 * for — "Mike V", "Paul", "Henri/Dan" — or with the region that answers the
 * same question, "Minnesota", "Nebreska". Without this the follow-up falls to
 * whoever is clearing the queue, which on a relayed note is wrong every single
 * time, and silently.
 *
 * Only ever the HEAD of the lead. A name further along the line is who was
 * spoken to, not who should chase it, and reading one as the other would hand
 * an account to a stranger.
 *
 * Empty when the head resolves to nothing, which is the correct answer for
 * "Care Initiatives - need to look up woman's names": the head there is the
 * company, and nobody is named at all.
 */
export function scanForReps(
  text: string,
  reps: RepOption[],
  territories: TerritoryOption[] = [],
): number[] {
  const head = leadHead(text);
  if (!head) return [];

  const out: number[] = [];
  for (const name of head.split('/').map(s => s.trim()).filter(Boolean)) {
    const id = matchRep(name, reps) ?? matchTerritory(name, territories);
    if (id != null && !out.includes(id)) out.push(id);
  }
  return out;
}

// ── What the note says about the person ──────────────────────────────────────

export interface ScannedContact {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

/**
 * The contact details a lead states outright.
 *
 * The assign modal has had first name, last name and email boxes for creating
 * someone who is not on the list since it was written, and nothing has ever
 * filled them in — which is most of the retyping a relayed note costs.
 *
 * An address and a phone number are read off their own shape, so they are
 * never wrong about what they are. A NAME is the careful one, and every clause
 * of it was put there by a line of the note it got wrong:
 *
 *   - exactly two words. Three admitted "The Goodman Group", and no lead in
 *     the sample carried a three-word person.
 *   - both capitalised, which declines "Van eyke".
 *   - no word from WEAK_WORDS, the list of company furniture already used for
 *     matching companies — "Group", "Care", "Living", "Management". A surname
 *     is not on that list.
 *   - no short all-capitals token, which is a state or an abbreviation and
 *     never a surname: "Hallkeen AL", "SNF", "ED", "VP".
 *   - no digits, no `@`, and not a company the account already holds.
 *
 * It declines "Majestic Care of Toledo", "Kristy/Amy" (two people in one
 * field) and "Martin" (one name, and no way to tell which half it is).
 *
 * Declining is the point. A blank box costs a few seconds; a confidently wrong
 * name creates a person who does not exist.
 */
export function scanForContactDetails<T extends ScannableCompany>(
  text: string,
  companies: T[] = [],
): ScannedContact {
  const found: ScannedContact = { first_name: '', last_name: '', email: '', phone: '' };

  found.email = text.match(EMAIL)?.[0] ?? '';
  // Run the phone match on the text with any address removed, so the digits in
  // a domain or a local part cannot be read as a number.
  found.phone = text.replace(EMAIL, ' ').match(PHONE)?.[0]?.trim() ?? '';

  for (const field of leadFields(text)) {
    if (field.includes('@') || /\d/.test(field)) continue;
    const parts = field.split(/\s+/).filter(Boolean);
    if (parts.length !== 2) continue;
    if (!parts.every(w => /^[A-Z][A-Za-z'’.-]*$/.test(w))) continue;
    if (parts.some(w => WEAK_WORDS.has(w.toLowerCase()))) continue;
    if (parts.some(w => w.length <= 3 && w === w.toUpperCase())) continue;
    // A company named where a person would be is still a company.
    if (companies.length > 0 && scanForCompany(field, companies)) continue;
    found.first_name = parts[0];
    found.last_name = parts[1];
    break;
  }

  return found;
}
