/**
 * The two files Parlay hands HubSpot — bridge spec v0.1 §4.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/hubspot-export.mjs
 *
 * Every rule here is RUN. The offset on a timestamp, which touchpoints
 * collapse, which meetings are left out — none of those can be read off the
 * source, and the one this replaces got the offset wrong for years by writing
 * local wall-clock time and appending `Z`.
 *
 * The clock is pinned to NIC's own dates and zone, because that is where the
 * answer is checkable: the spec's worked example is `-05:00`, and the same
 * conference three weeks later is an hour further out.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const {
  meetingStartISO, outcomeLabel, touchpointsString, notesString,
  csvEscape, csvFile, PEOPLE_HEADERS, MEETINGS_HEADERS,
} = await import('@/lib/hubspotExport');

console.log('\n— the timestamp carries the conference s own offset —');
{
  /*
   * The bug this replaces: the older export writes the local wall clock and
   * appends `Z`, so every meeting lands in HubSpot five hours early.
   */
  eq('NIC, 21 Oct, Chicago — the spec’s own example',
    meetingStartISO('2026-10-21', '14:30', 'America/Chicago'), '2026-10-21T14:30:00-05:00');
  eq('  never a bare Z',
    /Z$/.test(meetingStartISO('2026-10-21', '14:30', 'America/Chicago')), false);
  // A different zone on the same day is a different offset, so the zone is
  // genuinely being read rather than a constant being pasted in.
  eq('  a New York conference is an hour east',
    meetingStartISO('2026-10-21', '14:30', 'America/New_York'), '2026-10-21T14:30:00-04:00');
  eq('  and London is the other side of UTC',
    meetingStartISO('2026-10-21', '14:30', 'Europe/London'), '2026-10-21T14:30:00+01:00');

  /*
   * Across a DST change. US clocks go back on 1 Nov 2026, so a November
   * conference in the same city is −06:00 rather than −05:00. Read from Intl
   * rather than a table, which is why this is right without the code knowing
   * the date.
   */
  eq('after the clocks change, the same city shifts',
    meetingStartISO('2026-11-15', '14:30', 'America/Chicago'), '2026-11-15T14:30:00-06:00');
  // The repeated hour on the changeover night resolves to the first pass,
  // which is the earlier instant. Pinned so a rewrite cannot silently pick
  // the other one.
  eq('  and the ambiguous hour takes the first pass',
    meetingStartISO('2026-11-01', '01:30', 'America/Chicago'), '2026-11-01T01:30:00-05:00');

  /*
   * The morning of a transition, which is what the second pass is for.
   *
   * The offset has to be read at the instant the meeting actually happens,
   * not at the wall clock treated as UTC. Those two land on opposite sides of
   * a transition for the hours right after one — swept across nine zones and
   * a full year, they disagree 82 times, and every disagreement is an hour.
   *
   * 8 March, clocks forward at 2am: 03:30 is already CDT.
   * 1 November, clocks back at 2am: 02:30 is already CST.
   *
   * A single-pass read gets both wrong by an hour, and a conference that runs
   * across a transition would ship half its meetings shifted.
   */
  eq('the morning clocks go forward reads as the new offset',
    meetingStartISO('2026-03-08', '03:30', 'America/Chicago'), '2026-03-08T03:30:00-05:00');
  eq('  and the morning they go back reads as the new one too',
    meetingStartISO('2026-11-01', '02:30', 'America/Chicago'), '2026-11-01T02:30:00-06:00');

  /*
   * No zone, no timestamp — never a guess.
   *
   * A `Z` on a local time is wrong by the offset, silently, which is exactly
   * how the old export shipped meetings at the wrong hour.
   */
  eq('an unknown zone gives nothing', meetingStartISO('2026-10-21', '14:30', 'Not/AZone'), null);
  eq('  as does no zone at all', meetingStartISO('2026-10-21', '14:30', null), null);
  eq('  and a row with no date', meetingStartISO('', '14:30', 'America/Chicago'), null);
  // A meeting with a date and no time is midnight, not nothing: the date is
  // the fact, and HubSpot gets the day right.
  eq('a missing time is midnight, not a dropped row',
    meetingStartISO('2026-10-21', '', 'America/Chicago'), '2026-10-21T00:00:00-05:00');
}

console.log('\n— outcomes are HubSpot s three words —');
{
  eq('the three that are sent',
    ['meeting_held', 'no_show', 'cancelled'].map(outcomeLabel), ['held', 'no show', 'canceled']);
  /*
   * Everything else is null, and the route drops the meeting.
   *
   * A meeting still marked scheduled after the conference is one nobody wrote
   * up. Calling it held would put a completed meeting on a HubSpot contact
   * that never happened.
   */
  eq('  and nothing else qualifies',
    ['meeting_scheduled', 'rescheduled', '', null, undefined].map(outcomeLabel),
    [null, null, null, null, null]);
  // Keyed on the action_key, so renaming "Held" in config does not change
  // what the bridge sends.
  eq('  keyed on the action, not the label', outcomeLabel('Held'), null);
}

console.log('\n— the touchpoints string —');
{
  const rows = [
    { date: '2026-10-22 09:00:00', label: 'Session' },
    { date: '2026-10-21 14:30:00', label: 'Booth Stop' },
    { date: '2026-10-21 16:00:00', label: 'Booth Stop' },
  ];
  /*
   * Date only, and that is the point: the stamp is when the rep LOGGED it,
   * not when it happened. A booth stop written up over dinner would report
   * dinner as the conversation.
   */
  eq('date only, oldest first', touchpointsString(rows),
    '2026-10-21 booth stop; 2026-10-22 session');
  eq('  no time survives', /\d{2}:\d{2}/.test(touchpointsString(rows)), false);
  // The same touchpoint on two days is two; the identical line twice is one.
  eq('the same kind on two days is two',
    touchpointsString([
      { date: '2026-10-21', label: 'Booth Stop' }, { date: '2026-10-22', label: 'Booth Stop' },
    ]), '2026-10-21 booth stop; 2026-10-22 booth stop');
  eq('  and nothing at all is empty', touchpointsString([]), '');
  eq('  a row with no label is skipped',
    touchpointsString([{ date: '2026-10-21', label: '' }]), '');
}

console.log('\n— the notes field —');
{
  const rows = [
    { created_at: '2026-10-22 09:00:00', rep: 'Kevin Winn', content: 'Second note' },
    { created_at: '2026-10-21 14:00:00', rep: 'Dan Poe', content: 'First note' },
  ];
  // Each entry starts with its date and author, per the spec: they arrive as
  // one block in HubSpot and a reader needs the boundaries.
  eq('oldest first, each headed by date and author',
    notesString(rows), '2026-10-21 Dan Poe — First note\n\n2026-10-22 Kevin Winn — Second note');
  eq('  an empty note is not an entry',
    notesString([{ created_at: '2026-10-21', rep: 'Dan Poe', content: '   ' }]), '');
  // An author Parlay never resolved still gets the date rather than a stray
  // dash with nothing before it.
  eq('  a missing author leaves no orphan separator',
    notesString([{ created_at: '2026-10-21', rep: '', content: 'x' }]), '2026-10-21 — x');
}

console.log('\n— the CSV holds together —');
{
  /*
   * Notes carry newlines on purpose, so quoting is not optional: an unquoted
   * line break ends the row early and every column after it shifts by one for
   * the rest of the file.
   */
  eq('a newline inside a cell is quoted',
    csvFile(['a', 'b'], [['x', 'line1\nline2']]), 'a,b\r\nx,"line1\nline2"\r\n');
  eq('  as is a comma', csvEscape('Ventas, Inc.'), '"Ventas, Inc."');
  eq('  and a quote is doubled', csvEscape('say "hi"'), '"say ""hi"""');
  // Absence read straight off a row object arrives as these words.
  eq('  absence is empty, not the word null',
    [csvEscape(null), csvEscape(undefined), csvEscape('null')], ['', '', '']);

  // The column order is the contract. Kristian reads these by position as
  // much as by name.
  eq('people.csv is the agreed shape', [...PEOPLE_HEADERS], [
    'parlay_person_id', 'hubspot_contact_id', 'hubspot_company_id',
    'first_name', 'last_name', 'email', 'job_title', 'company_name',
    'phone', 'linkedin_url', 'event_code',
    'touchpoints', 'notes', 'follow_up_action', 'follow_up_owner_email',
  ]);
  eq('meetings.csv too', [...MEETINGS_HEADERS], [
    'parlay_meeting_id', 'parlay_person_id', 'hubspot_contact_id',
    'title', 'start', 'location', 'outcome',
    'owner_email', 'support_emails', 'notes',
  ]);
  // v0.1 dropped the end time: HubSpot logs every meeting as 30 minutes.
  eq('  and carries no end time', MEETINGS_HEADERS.includes('end'), false);
}

console.log('\n— what the route does with it —');
{
  const route = strip('app/api/conferences/[id]/hubspot-export/route.ts');

  /*
   * Gated on the capability, not merely on a session.
   *
   * One request here returns every contact, email, note and meeting for a
   * conference. The older export leans on its menu item being hidden, which
   * governs the button rather than the URL; a new endpoint does not inherit
   * that.
   */
  eq('the export needs the CRM-export capability',
    /requireCapability\(request, 'crm_export'\)/.test(route), true);
  eq('  not just any signed-in session', /requireAuth\(/.test(route), false);

  // The spec's filter: a conference list is mostly people nobody spoke to.
  eq('only people who did something are exported',
    /if \(touches\.length === 0 && notes\.length === 0 && !follow && !hasMeeting\.has\(id\)\) continue;/.test(route), true);

  /*
   * Notes reach the file by id OR by name.
   *
   * A note written onto a conference carries conference_id; one promoted from
   * a floor note carries only conference_name, because that write path never
   * set the id. Matching on the id alone would lose exactly the notes the
   * floor produced — which is most of them.
   */
  eq('notes are matched by id and by name',
    /conference_id = \? OR \(conference_id IS NULL AND conference_name = \?\)/.test(route), true);

  // One row per external attendee, per the spec.
  eq('a meeting fans out to each attendee',
    /additional_attendee_ids/.test(route) && /for \(const attendeeId of Array\.from\(meetingAttendees/.test(route), true);
  // A superseded meeting is a previous version of one that was rescheduled.
  eq('  and a superseded meeting is not sent',
    /m\.superseded_by_id IS NULL/.test(route), true);

  /*
   * What was dropped reaches the person who clicked, not a log.
   *
   * This export runs once. A meeting left out for want of an outcome is
   * otherwise discovered in HubSpot weeks later, or never.
   */
  for (const h of ['X-Parlay-People', 'X-Parlay-Meetings', 'X-Parlay-Skipped-No-Outcome', 'X-Parlay-Skipped-No-Start']) {
    eq(`  ${h} is reported`, route.includes(h), true);
  }
  eq('  counted rather than silently skipped',
    /skipped\.noOutcome\+\+/.test(route) && /skipped\.noStart\+\+/.test(route), true);

  // Rep ids resolve through the user row, so a rep with no account comes out
  // blank rather than as a config id HubSpot cannot own.
  eq('rep ids resolve to Teton addresses',
    /JOIN users u ON u\.config_id = co\.id/.test(route), true);
  eq('  and an unresolvable one is dropped, not passed through',
    /\.map\(id => emailByConfigId\.get\(id\) \?\? ''\)\s*\n?\s*\.filter\(Boolean\)/.test(route), true);

  /*
   * And the older export is renamed, not removed.
   *
   * It still works and is right for an account with no bridge. But it matches
   * on EMAIL, and two menu entries both reading "CRM" is how the wrong one
   * gets run on the Monday after a conference — five email-matched files
   * arriving where two id-matched ones were expected, with nothing on either
   * to say which is which.
   */
  const page = strip('app/conferences/[id]/page.tsx');
  const modal = strip('components/CrmExportModal.tsx');
  eq('the email-matched export still exists',
    strip('app/api/conferences/[id]/crm-export/route.ts').length > 0, true);
  eq('  but no longer shares a name with this one',
    /Export CRM Files/.test(page), false);
  eq('  saying in the menu how it matches',
    /Generic CRM files \(matched on email\)/.test(page), true);
  eq('  and again where the provider is picked',
    /match records on <strong>email address<\/strong>/.test(modal), true);
  /*
   * Without pointing at an export the account may not have.
   *
   * Most tenants have no CRM bridge; telling them to use its export instead
   * is a puzzle rather than a warning. The note says what these files ARE.
   */
  eq('    without sending them to a bridge they may not have',
    /CRM bridge/.test(modal), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
