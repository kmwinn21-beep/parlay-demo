/**
 * Getting an agenda page's text, when the page hides half of it behind tabs.
 *
 * ── The bug this exists for ──────────────────────────────────────────────────
 *
 * A conference schedule split across Monday / Tuesday / Wednesday tabs imported
 * as Monday only. Two readers were already in the route and the wrong one was
 * winning:
 *
 *   Jina Reader renders the page and returns the text a person would SEE. On a
 *   tabbed page that is one day.
 *
 *   The direct fetch strips tags out of the raw HTML and knows nothing about
 *   CSS, so when the other days are in the DOM but hidden it gets all of them.
 *
 * The fallback only ran when Jina threw or returned under 500 characters. One
 * day of a conference is comfortably over 500 characters, so Jina "succeeded"
 * and the reader that was better at this exact problem never executed. A
 * partial answer was indistinguishable from a complete one.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 *
 * Both run, and the richer one wins. Not the LONGER one: the direct fetch
 * drags in menus and scripts and is almost always longer, which would throw
 * away the cleaner text on every page in the world.
 *
 * Richness is two signals, in order.
 *
 * Days first — that is what is being lost. But days alone are not enough, and
 * a test fixture is what proved it: a tab STRIP is text too, so a page showing
 * Monday still prints "Monday | Tuesday | Wednesday" across the top and both
 * readers count three. The names were never the missing part.
 *
 * So times break the tie. A tab label carries no clock, and a day of sessions
 * carries one per row, which makes distinct times a direct measure of how much
 * agenda a reading actually holds. On the page that prompted this the rendered
 * read has two and the raw read has six.
 *
 * Jina keeps a tie on both, because when neither is richer it is the better
 * text.
 *
 * They run in parallel. Doing this in sequence would add the slower one's
 * latency to every import for the sake of the minority of pages that need it.
 */

/** Text plus what it cost to say, for choosing between two readings. */
export interface AgendaReading {
  source: 'reader' | 'direct';
  text: string;
  /** How many distinct days the text names. */
  days: number;
  /** How many distinct clock times it carries — one per session row. */
  times: number;
}

const WEEKDAYS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi;
const MONTH_DAY = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/gi;

/**
 * How many distinct days a piece of text names.
 *
 * Weekdays first, because a schedule that tabs by day almost always labels the
 * tab with one. Month-and-date is the fallback for schedules labelled "November
 * 2" with no weekday, and the two are not added together — a page saying
 * "Monday, November 2" would otherwise count as two days.
 *
 * Deliberately crude. This decides which of two readings to keep, not what the
 * agenda contains; the model does that afterwards on whichever text wins.
 */
export function countDistinctDays(text: string): number {
  if (!text) return 0;
  const weekdays = new Set(
    Array.from(text.matchAll(WEEKDAYS)).map(m => m[1].toLowerCase()),
  );
  if (weekdays.size > 0) return weekdays.size;
  const dates = new Set(
    Array.from(text.matchAll(MONTH_DAY)).map(m => `${m[1].toLowerCase()} ${m[2]}`),
  );
  return dates.size;
}

const TIME_OF_DAY = /\b(\d{1,2}):(\d{2})\s*([ap])\.?\s?m\.?/gi;

/**
 * How many distinct clock times a reading carries.
 *
 * The signal a tab label cannot fake. "Tuesday, November 3" across the top of
 * a page showing Monday says nothing about Tuesday's sessions; a time says
 * there is a row here. Normalised so "7:30 A.M." and "7:30 am" are one time.
 */
export function countDistinctTimes(text: string): number {
  if (!text) return 0;
  return new Set(
    Array.from(text.matchAll(TIME_OF_DAY))
      .map(m => `${Number(m[1])}:${m[2]}${m[3].toLowerCase()}`),
  ).size;
}

/**
 * Which of two readings to keep.
 *
 * Days first, then times. A reading with no text never wins whatever it
 * counts — a failed fetch scores zero on both and so does an empty page, and
 * neither should be able to displace a real one.
 */
export function pickRicher(
  reader: AgendaReading | null,
  direct: AgendaReading | null,
): AgendaReading | null {
  if (!reader?.text) return direct?.text ? direct : null;
  if (!direct?.text) return reader;
  if (direct.days !== reader.days) return direct.days > reader.days ? direct : reader;
  // Same days named, so the question is which one has the sessions under them.
  // Strictly more, so the cleaner text keeps a tie on both.
  return direct.times > reader.times ? direct : reader;
}

/** Tags out, entities and whitespace tidied — what the direct reader returns. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, '')
    // A block element's text runs into the next one's without this, which is
    // what turned "…5:00 P.M.Registration Hours" into one word.
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|td|th)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&copy;/gi, '\u00a9')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const MAX_CONTENT_CHARS = 200_000;

export function cap(text: string): string {
  return text.length > MAX_CONTENT_CHARS
    ? text.slice(0, MAX_CONTENT_CHARS) + '\n[Content truncated]'
    : text;
}
