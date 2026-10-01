/**
 * The two files Parlay hands HubSpot after a conference — the shaping rules.
 *
 * Bridge spec v0.1 §4. The queries live in the route; everything with a rule
 * in it lives here, because each of these is a decision somebody could get
 * wrong quietly:
 *
 *   - a timestamp that carries the conference's own offset rather than a `Z`
 *     bolted onto a local wall clock, which is what the older export did
 *   - a touchpoint line that is date-only, because the stored time is when a
 *     rep logged it rather than when it happened
 *   - an outcome vocabulary that is HubSpot's three words, not Parlay's
 *     configurable ones
 *
 * The export runs once per conference, at the end, and is not re-run. Nothing
 * here guesses: where a value cannot be produced honestly it comes back empty
 * or null, and the route counts what it dropped so the reader is told.
 */

// ─── Time ─────────────────────────────────────────────────────────────────────

/**
 * How far the zone is from UTC at a given instant, in minutes east.
 *
 * Read out of Intl rather than from a table, so it is right across a DST
 * boundary without this file knowing when those are. NIC is 21–23 October in
 * Chicago, which is CDT (−05:00); the same conference three weeks later would
 * be CST (−06:00), and the difference is an hour on every meeting.
 */
function zoneOffsetMinutes(utcMs: number, timeZone: string): number | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts: Record<string, string> = {};
    for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
    // Intl renders midnight as hour 24 in some locales/zones.
    const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
    const asIfUTC = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      hour, Number(parts.minute), Number(parts.second),
    );
    return (asIfUTC - utcMs) / 60_000;
  } catch {
    // An unknown zone name throws. Better to send no offset than a wrong one.
    return null;
  }
}

/** `-05:00` from a count of minutes east of UTC. */
function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

/**
 * A meeting's start, as `2026-10-21T14:30:00-05:00`.
 *
 * Parlay stores a date and a time with no zone; they are the conference's
 * local wall clock, which is how a rep entered them. The conference carries
 * an IANA zone, and the offset for THAT instant is computed from it.
 *
 * Two passes, deliberately. The first guess reads the offset at the wrong
 * instant — the wall clock treated as UTC — which lands on the wrong side of
 * a DST change for a meeting within a few hours of one. Re-reading at the
 * corrected instant settles it.
 *
 * Returns null rather than a `Z` when there is no usable zone. A timestamp
 * claiming UTC while holding local time is wrong by the offset, silently, and
 * that is the bug in the export this replaces.
 */
export function meetingStartISO(
  date: unknown,
  time: unknown,
  timeZone: string | null | undefined,
): string | null {
  const d = String(date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const rawTime = String(time ?? '').trim();
  const t = /^\d{2}:\d{2}/.test(rawTime) ? rawTime.slice(0, 5) : '00:00';
  const local = `${d}T${t}:00`;

  if (!timeZone) return null;
  const guess = Date.parse(`${local}Z`);
  if (Number.isNaN(guess)) return null;
  const first = zoneOffsetMinutes(guess, timeZone);
  if (first === null) return null;
  const corrected = guess - first * 60_000;
  const offset = zoneOffsetMinutes(corrected, timeZone) ?? first;
  return `${local}${formatOffset(offset)}`;
}

// ─── Outcome ──────────────────────────────────────────────────────────────────

/**
 * HubSpot's three words for how a meeting went.
 *
 * Keyed on the action_key rather than the label, because an account can rename
 * "Held" and the bridge must not change meaning when it does.
 *
 * Anything else — scheduled, rescheduled, nothing recorded — returns null and
 * the meeting is not exported. A meeting still marked scheduled after the
 * conference is a meeting nobody wrote up, and inventing "held" for it would
 * put a completed meeting on a HubSpot contact that never happened.
 */
export function outcomeLabel(actionKey: unknown): 'held' | 'no show' | 'canceled' | null {
  switch (String(actionKey ?? '')) {
    case 'meeting_held': return 'held';
    case 'no_show': return 'no show';
    case 'cancelled': return 'canceled';
    default: return null;
  }
}

// ─── Strings ──────────────────────────────────────────────────────────────────

export interface TouchpointRow { date: unknown; label: unknown }

/**
 * `2026-10-21 booth stop; 2026-10-22 session`
 *
 * Date only, and this is the point rather than brevity: Parlay stamps a
 * touchpoint when the rep LOGS it, not when it happened. On the floor those
 * are minutes apart; a booth stop written up over dinner is hours out, and a
 * time would report the writing-up as the conversation.
 *
 * Oldest first, so the string reads as the order of the week. Exact
 * duplicates collapse — the same touchpoint tapped twice is one fact — but
 * two of the same kind on different days are two.
 */
export function touchpointsString(rows: TouchpointRow[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const date = String(r.date ?? '').slice(0, 10);
    const label = String(r.label ?? '').trim().toLowerCase();
    if (!date || !label) continue;
    const line = `${date} ${label}`;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out.sort().join('; ');
}

export interface NoteRow { created_at: unknown; rep: unknown; content: unknown }

/**
 * Every note on this person for this conference, as one field.
 *
 * Each begins with its date and author, because they arrive as one block in
 * HubSpot and a reader needs to know where one ends and the next starts.
 * Oldest first: read down the field and the conference runs forwards.
 *
 * Blank lines between entries rather than a separator character — a note is
 * free text and any separator chosen would eventually appear inside one.
 */
export function notesString(rows: NoteRow[]): string {
  return rows
    .map(r => ({
      when: String(r.created_at ?? '').slice(0, 10),
      who: String(r.rep ?? '').trim(),
      text: String(r.content ?? '').trim(),
    }))
    .filter(r => r.text)
    .sort((a, b) => a.when.localeCompare(b.when))
    .map(r => `${[r.when, r.who].filter(Boolean).join(' ')} — ${r.text}`)
    .join('\n\n');
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/**
 * One cell.
 *
 * The strings above carry newlines on purpose, so quoting is not optional
 * here: an unquoted note with a line break in it ends the row early and every
 * column after it shifts by one for the rest of the file.
 */
export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  // Literal "null"/"undefined" reach here from columns read straight out of a
  // row object; they are absence, not a value.
  if (s === 'null' || s === 'undefined' || s === 'NaN') return '';
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** A whole file: the header row, then the rows, CRLF as the CSV spec has it. */
export function csvFile(headers: string[], rows: unknown[][]): string {
  const line = (fields: unknown[]) => fields.map(csvEscape).join(',');
  return [line(headers), ...rows.map(line)].join('\r\n') + '\r\n';
}

/** The column order of each file, from the spec. Exported so a test can pin it. */
export const PEOPLE_HEADERS = [
  'parlay_person_id', 'hubspot_contact_id', 'hubspot_company_id',
  'first_name', 'last_name', 'email', 'job_title', 'company_name',
  'phone', 'linkedin_url', 'event_code',
  'touchpoints', 'notes', 'follow_up_action', 'follow_up_owner_email',
] as const;

export const MEETINGS_HEADERS = [
  'parlay_meeting_id', 'parlay_person_id', 'hubspot_contact_id',
  'title', 'start', 'location', 'outcome',
  'owner_email', 'support_emails', 'notes',
] as const;
