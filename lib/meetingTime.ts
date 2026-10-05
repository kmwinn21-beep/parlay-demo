/**
 * A meeting's time is normally 'HH:MM'. Reps also book plenty of "come by the
 * booth" commitments that have no slot, so meeting_time can instead carry this
 * sentinel. Everything that renders or does arithmetic on a time goes through
 * here, so the sentinel never reaches a Date or a duration.
 */
export const BOOTH_HOURS = 'booth';

export const BOOTH_HOURS_LABEL = 'Booth Hours';

/**
 * The other kind of meeting with no slot: one that is agreed but not yet
 * timed. Reps book these at a show all the time — "we'll find each other
 * Tuesday" — and until now the only way to record one was to invent a time.
 *
 * A second sentinel rather than a flag, because it is the same shape of thing
 * as booth hours: a value meeting_time can carry that is not a point on the
 * clock. Everything that already knew to step around booth hours steps around
 * this too, through hasNoStartTime below.
 */
export const TBD = 'tbd';

export const TBD_LABEL = 'TBD';

export function isBoothHours(time: string | null | undefined): boolean {
  return (time ?? '').trim().toLowerCase() === BOOTH_HOURS;
}

export function isTbd(time: string | null | undefined): boolean {
  return (time ?? '').trim().toLowerCase() === TBD;
}

/**
 * Whether this meeting has no point on the clock.
 *
 * What the callers that special-cased booth hours actually meant. They are
 * deciding whether there is a start time to put in a calendar invite, to sort
 * a day by, or to do arithmetic on — and the answer is no for both sentinels.
 */
export function hasNoStartTime(time: string | null | undefined): boolean {
  return isBoothHours(time) || isTbd(time);
}

/** What to show instead of a clock time, or null for a real one. */
export function unscheduledLabel(time: string | null | undefined): string | null {
  if (isBoothHours(time)) return BOOTH_HOURS_LABEL;
  if (isTbd(time)) return TBD_LABEL;
  return null;
}

/** 'HH:MM' → '9:30 AM'; a sentinel → its label; empty → ''. */
export function formatMeetingTime(time: string | null | undefined): string {
  if (!time) return '';
  const unscheduled = unscheduledLabel(time);
  if (unscheduled) return unscheduled;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Minutes since midnight, or null when there is no point on the clock. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time || hasNoStartTime(time)) return null;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * 6:00 AM → 9:45 PM in 15-minute steps, with the two timeless options first.
 *
 * TBD sits under Booth Hours: both are answers to "when", and a rep reaching
 * for either is reaching past the clock. Above the times rather than below
 * them, because a list of sixty-four slots is scrolled, not read.
 */
export const MEETING_TIME_OPTIONS: { value: string; label: string }[] = [
  { value: BOOTH_HOURS, label: BOOTH_HOURS_LABEL },
  { value: TBD, label: TBD_LABEL },
  ...Array.from({ length: 64 }, (_, i) => {
    const totalMins = 360 + i * 15;
    const value = `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
    return { value, label: formatMeetingTime(value) };
  }),
];

/**
 * "Sun, 7/05" - the mobile card's date.
 *
 * Shorter than the table's "Jul 5, 2026", and led by the weekday: the card is
 * read under a date heading that already gives the year, and at a conference
 * the day of the week is the part somebody is actually navigating by.
 */
export function formatCardDate(d: string): string {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday}, ${dt.getMonth() + 1}/${String(dt.getDate()).padStart(2, '0')}`;
}
