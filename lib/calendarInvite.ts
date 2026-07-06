export interface CalendarInviteInput {
  title: string;
  attendeeEmail: string | null;
  location: string;
  /** YYYY-MM-DD */
  dateYMD: string;
  /** HH:MM, 24-hour, interpreted in `timezone` */
  timeHM: string;
  /** IANA timezone name (e.g. "America/Los_Angeles"). Falls back to the browser's local time if null. */
  timezone: string | null;
  durationMinutes?: number;
}

const DEFAULT_DURATION_MINUTES = 30;

/** Interprets dateYMD+timeHM as wall-clock time in `timezone` and returns the equivalent UTC instant. */
function zonedTimeToUtc(dateYMD: string, timeHM: string, timezone: string): Date {
  const [year, month, day] = dateYMD.split('-').map(Number);
  const [hour, minute] = timeHM.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Compare how that same instant reads in UTC vs. in the target timezone to derive the offset.
  const asIfUTC = new Date(utcGuess.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asIfTz = new Date(utcGuess.toLocaleString('en-US', { timeZone: timezone }));
  const offsetMs = asIfUTC.getTime() - asIfTz.getTime();
  return new Date(utcGuess.getTime() + offsetMs);
}

function resolveStartUtc(dateYMD: string, timeHM: string, timezone: string | null): Date {
  const [year, month, day] = dateYMD.split('-').map(Number);
  const [hour, minute] = timeHM.split(':').map(Number);
  if (!timezone) return new Date(year, month - 1, day, hour, minute);
  try {
    return zonedTimeToUtc(dateYMD, timeHM, timezone);
  } catch {
    return new Date(year, month - 1, day, hour, minute);
  }
}

function toGoogleDateParam(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

export function buildGoogleCalendarUrl(input: CalendarInviteInput): string {
  const start = resolveStartUtc(input.dateYMD, input.timeHM, input.timezone);
  const end = new Date(start.getTime() + (input.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${toGoogleDateParam(start)}/${toGoogleDateParam(end)}`,
    location: input.location,
  });
  if (input.attendeeEmail) params.set('add', input.attendeeEmail);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl(input: CalendarInviteInput): string {
  const start = resolveStartUtc(input.dateYMD, input.timeHM, input.timezone);
  const end = new Date(start.getTime() + (input.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60000);
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: input.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    location: input.location,
  });
  if (input.attendeeEmail) params.set('to', input.attendeeEmail);
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}
