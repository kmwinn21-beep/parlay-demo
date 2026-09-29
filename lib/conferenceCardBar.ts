/**
 * The line along the top of a conference card, left of its stage badge.
 *
 * One module because two surfaces draw that card — the Program tab and the
 * dashboard banner — and the bar is the only part of it that says where the
 * conference is in its own life rather than what it is.
 *
 * It used to say "Happening now", "in 12 days" and "Post-conference · 10 days
 * remaining". The first is true of every show at once and tells a rep nothing
 * about which morning they are on; the other two name a number without saying
 * what it counts down to. Now: which day of the show it is, how long until one
 * starts, and how long before its window shuts.
 *
 * Days are counted the way lib/conference-stage counts them — from UTC
 * midnight on the start date — so the bar and the stage badge beside it can
 * never disagree about which day it is.
 */

const DAY_MS = 86_400_000;

/** UTC midnight of a stored `YYYY-MM-DD`, or NaN if it is not one. */
function dayStartMs(date: string): number {
  return new Date(date).getTime();
}

/**
 * Which day of the conference today is: "Day 1", "Day 2", "Final Day".
 *
 * The last day is named rather than numbered because that is the fact a rep
 * acts on — it is the morning to get the remaining meetings booked — and "Day
 * 3" only says so to somebody who already knows how long the show runs.
 *
 * Clamped at both ends. A conference is in progress from its start date to the
 * end of its end date, but a stage override can put one in that state outside
 * its own dates, and a card is not the place to argue: the first day before it
 * starts, the final day after it ends.
 */
export function conferenceDayLabel(
  startDate: string,
  endDate: string,
  nowMs?: number,
): string {
  const now = nowMs ?? Date.now();
  const startMs = dayStartMs(startDate);
  const endMs = dayStartMs(endDate);
  // Without usable dates there is no day to name, and "Day NaN" is worse than
  // the plain statement that it is on.
  if (Number.isNaN(startMs)) return 'Happening now';
  const totalDays = Number.isNaN(endMs) ? 1 : Math.max(1, Math.floor((endMs - startMs) / DAY_MS) + 1);
  const day = Math.min(totalDays, Math.max(1, Math.floor((now - startMs) / DAY_MS) + 1));
  return day === totalDays ? 'Final Day' : `Day ${day}`;
}

/**
 * How long until a conference starts.
 *
 * "Starts today" rather than "Starts in 0 days", which is what counting down
 * to zero produces on the morning of the show — the one day the line matters
 * most.
 */
export function startsInLabel(daysUntil: number): string {
  if (daysUntil <= 0) return 'Starts today';
  return `Starts in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`;
}

/**
 * How long before the post-conference window shuts.
 *
 * Same shape, and the same reason for the nought case: "Closes today" is a
 * thing to act on and "Closes in 0 days" is a bug people work around.
 */
export function closesInLabel(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'Closes today';
  return `Closes in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`;
}
