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
 * The company a note names, if one of the account's companies is in the text.
 *
 * Matches on the distinctive words of a company's name, so "Mission" finds
 * "Mission Health" — the way a note actually refers to a company. A name whose
 * every word is generic is only matched in full, because "Senior Living" alone
 * identifies nothing.
 */
export function scanForCompany<T extends ScannableCompany>(text: string, companies: T[]): T | null {
  const haystack = ` ${text.toLowerCase()} `;
  const squashedHay = squash(text);
  let best: { company: T; score: number } | null = null;
  // Two companies scoring the same is a coin toss, and a coin toss presented
  // as a suggestion is worse than no suggestion. Duplicated names are common
  // enough in a real account for this to matter.
  let tied = false;

  for (const c of companies) {
    const name = c.name.trim();
    if (!name) continue;

    let score = 0;
    // The whole name present is the strongest signal there is.
    if (squash(name).length >= 4 && squashedHay.includes(squash(name))) {
      score = 100 + name.length;
    } else {
      const strong = words(name).filter(isStrong);
      if (strong.length === 0) continue;
      // Every distinctive word has to be there — "Mission" matches "Mission
      // Health", but "Mission" must not match "Mission Ridge Partners" purely
      // on a word both happen to share when the note meant the other one.
      const hits = strong.filter(w => haystack.includes(` ${w} `) || haystack.includes(` ${w}'`) || squashedHay.includes(w));
      if (hits.length === 0 || hits.length < strong.length) continue;
      score = 10 * hits.length + name.length;
    }
    if (!best || score > best.score) { best = { company: c, score }; tied = false; }
    else if (score === best.score) tied = true;
  }

  return tied ? null : best?.company ?? null;
}

/**
 * The attendee a note names.
 *
 * Notes use first names — "Spoke to Tina" — so a first name alone counts, but
 * only when it lands on exactly one person in the candidate list. Two Tinas
 * and the note has not said which, so nothing is suggested rather than a coin
 * toss presented as a suggestion.
 */
export function scanForAttendee<T extends ScannableAttendee>(text: string, attendees: T[]): T | null {
  const haystack = ` ${text.toLowerCase()} `;
  const has = (w: string) => !!w && (haystack.includes(` ${w.toLowerCase()} `) || haystack.includes(` ${w.toLowerCase()}'`) || haystack.includes(` ${w.toLowerCase()},`) || haystack.includes(` ${w.toLowerCase()}.`));

  // Full name, or first and last both present: unambiguous.
  const full = attendees.filter(a => {
    const first = a.first_name?.trim() ?? '';
    const last = a.last_name?.trim() ?? '';
    return first && last && has(first) && has(last);
  });
  if (full.length === 1) return full[0];
  if (full.length > 1) return null;

  const byFirst = attendees.filter(a => has(a.first_name?.trim() ?? ''));
  return byFirst.length === 1 ? byFirst[0] : null;
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
