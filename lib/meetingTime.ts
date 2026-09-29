/**
 * A meeting's time is normally 'HH:MM'. Reps also book plenty of "come by the
 * booth" commitments that have no slot, so meeting_time can instead carry this
 * sentinel. Everything that renders or does arithmetic on a time goes through
 * here, so the sentinel never reaches a Date or a duration.
 */
export const BOOTH_HOURS = 'booth';

export const BOOTH_HOURS_LABEL = 'Booth Hours';

export function isBoothHours(time: string | null | undefined): boolean {
  return (time ?? '').trim().toLowerCase() === BOOTH_HOURS;
}

/** 'HH:MM' → '9:30 AM'; the sentinel → 'Booth Hours'; empty → ''. */
export function formatMeetingTime(time: string | null | undefined): string {
  if (!time) return '';
  if (isBoothHours(time)) return BOOTH_HOURS_LABEL;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Minutes since midnight, or null when there is no point on the clock. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time || isBoothHours(time)) return null;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** 6:00 AM → 9:45 PM in 15-minute steps, with Booth Hours offered first. */
export const MEETING_TIME_OPTIONS: { value: string; label: string }[] = [
  { value: BOOTH_HOURS, label: BOOTH_HOURS_LABEL },
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
