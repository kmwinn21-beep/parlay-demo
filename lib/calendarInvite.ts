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

/* ─── .ics ────────────────────────────────────────────────────────────────
 * The vendor URLs above are web composers — the OS hands them to a browser.
 * An .ics served as text/calendar is the handoff the device understands:
 * iOS opens the Add Event sheet, Android the calendar chooser, desktop
 * Outlook or Apple Calendar.
 * ------------------------------------------------------------------------ */

export interface IcsInput extends CalendarInviteInput {
  /** Stable across regenerations so a re-send updates rather than duplicates. */
  uid: string;
  description?: string | null;
  organizerName?: string | null;
  organizerEmail?: string | null;
  attendeeName?: string | null;
  /** Bumped when the meeting is edited, so calendars supersede the old copy. */
  sequence?: number;
  /** Stamp for DTSTAMP; defaults to now. */
  now?: Date;
}

/** RFC 5545 escaping for TEXT values. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toIcsStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** Folds to 75 octets per line, as long SUMMARY/LOCATION values require. */
function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    const limit = out.length === 0 ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);
    // Don't split a multi-byte character.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((out.length === 0 ? '' : ' ') + bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return out.join('\r\n');
}

export function buildIcs(input: IcsInput): string {
  const start = resolveStartUtc(input.dateYMD, input.timeHM, input.timezone);
  const end = new Date(start.getTime() + (input.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60000);
  // An event with an invitee is a REQUEST so Outlook and Apple Calendar offer
  // to send it; without one there is nobody to invite, so it is a plain add.
  const method = input.attendeeEmail ? 'REQUEST' : 'PUBLISH';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Parlay//Conference Hub//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${toIcsStamp(input.now ?? new Date())}`,
    `DTSTART:${toIcsStamp(start)}`,
    `DTEND:${toIcsStamp(end)}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
  ];
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.organizerEmail) {
    const cn = input.organizerName ? `;CN=${escapeIcsText(input.organizerName)}` : '';
    lines.push(`ORGANIZER${cn}:mailto:${input.organizerEmail}`);
  }
  if (input.attendeeEmail) {
    const cn = input.attendeeName ? `;CN=${escapeIcsText(input.attendeeName)}` : '';
    lines.push(`ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.attendeeEmail}`);
  }
  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
