/**
 * The agenda drawer, as cards on a rail.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/agenda-drawer.mjs
 *
 * My Agenda and the Full Agenda were rows: a time in grey as the first line,
 * a title, a type pill, a subtitle, an inline note, and a column of controls
 * at the end of each one. The list is the same list; the time moves out of
 * the row onto a rail down the left, and what is left becomes a card in the
 * colour the calendar already gives that kind of thing.
 *
 * What is checked here is the handful of rules that carry it: one row
 * component drawing both lists, the corner controls and what each of them
 * calls, the meeting card being the calendar's own rather than a second copy
 * of it, and the fade — which, like the calendar's, only means anything
 * while the conference is on.
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
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

const section = strip('components/DashboardAgendaSection.tsx');
const drawer = strip('components/AgendaDrawer.tsx');

console.log('\n— the rail, and the card —');
{
  eq('one row draws both lists', /function AgendaRailRow\(\{ time, until, untimed, tone, past, corner, children \}/.test(section), true);
  eq('  with the time on a rail', /className="w-\[54px\] flex-shrink-0 text-right pt-2"/.test(section), true);
  eq('  a line and a dot beside it',
    /className="absolute left-\[5px\] inset-y-0 w-px bg-gray-200"/.test(section), true);
  eq('  and the thing itself as a card', /rounded-lg border \$\{tone\.card\}/.test(section), true);

  // The colours the agenda's own type pills use, as a block.
  eq('a card is coloured by what kind it is', /function cardTone\(sessionType: string \| null, isMeeting: boolean\): CardTone \{/.test(section), true);
  eq('  a meeting by being a meeting', /const MEETING_TONE: CardTone = \{/.test(section), true);
  eq('  with a solid edge, since it is yours and not the conference’s',
    /border-l-\[3px\] border-l-sky-700/.test(section), true);
  eq('  and anything unrecognised stays plain', /const DEFAULT_TONE: CardTone =/.test(section), true);

  // Booth hours and TBD have no point on the clock.
  eq('an item with no time says what it has instead',
    /\{untimed\.split\(' '\)\[0\]\}/.test(section), true);
}

console.log('\n— the controls, in the card’s corner —');
{
  eq('the corner is where they live', /\{corner && <div className="absolute top-1\.5 right-1\.5 flex items-center gap-0\.5">\{corner\}<\/div>\}/.test(section), true);
  eq('  one shape for both of them', /function CornerButton\(\{ label, onClick, tone = 'outline', children \}/.test(section), true);

  eq('the full agenda adds', /label="Add to My Agenda"\n\s*onClick=\{\(\) => void handleAddToMyAgenda\(item, day\.day_label\)\}/.test(section), true);
  eq('  and takes it back off', /label="Remove from My Agenda"/.test(section), true);
  eq('  my agenda takes it off too',
    /onClick=\{\(\) => void handleRemoveFromMyAgenda\(item\.myItemId as number, item\.sourceId\)\}/.test(section), true);
  // There is nothing to un-add about a meeting: it is on the agenda because
  // it is booked, not because somebody picked it.
  eq('  but never off a meeting', /\{!isMeeting && item\.myItemId != null && \(/.test(section), true);

  eq('removing calls the endpoint that exists',
    /fetch\(`\/api\/conferences\/\$\{conferenceId\}\/my-agenda\/\$\{myItemId\}`, \{ method: 'DELETE' \}\)/.test(section), true);
  // The row goes before the request answers: a tick that takes a second to
  // disappear reads as a click that did not land.
  eq('  and the row goes first', /setMyItems\(prev => prev\.filter\(x => x\.id !== myItemId\)\);/.test(section), true);
  eq('  with a refetch if it did not take', /if \(!res\.ok\) void fetchAll\(\);/.test(section), true);

  eq('the kebab stays, in the card', /<KebabMenu\n\s*title="Item actions"/.test(section), true);
}

console.log('\n— a meeting opens the calendar’s own card —');
{
  /*
   * renderMobileCard, through MeetingsTable's cardsOnly — the same card the
   * calendar's popup shows, so it keeps its notes button, its kebab, its
   * outcome pill and its inline edit rather than being a poorer copy.
   */
  eq('the title is the way in', /onClick=\{\(\) => setMeetingCardId\(item\.sourceId\)\}/.test(section), true);
  eq('  and what opens is the real card',
    /<MeetingsTable\n\s*cardsOnly\n\s*tableName="conference_meetings"\n\s*meetings=\{\[meeting\]\}/.test(section), true);
  eq('  in a sheet from the bottom of the drawer',
    /data-agenda-meeting-sheet/.test(section) && /rounded-t-2xl border-t border-gray-200 bg-white/.test(section), true);
  eq('  the width of the drawer it is inside', /w-full sm:w-\[560px\] z-\[78\]/.test(section), true);

  // The agenda's copy of a meeting is the few fields a row needs; the card
  // wants the rep ids, the guests, the length, the company's type.
  eq('the full meeting is fetched for it',
    /fetch\(`\/api\/meetings\?conference_id=\$\{conferenceId\}`\)/.test(section), true);
  eq('  only once somebody asks', /if \(meetingCardId == null \|\| fullMeetings\.length > 0\) return;/.test(section), true);
  eq('  and says so while it comes', /Loading the meeting…/.test(section), true);
}

console.log('\n— and what has already happened —');
{
  eq('a past card fades', /past \? 'opacity-60' : 'opacity-100'/.test(section), true);
  // The same rule the calendar uses, for the same reason — and the same
  // guard: after a conference everything has passed, and a view where every
  // card is faded has lost a channel rather than gained one.
  eq('  only while the conference is on',
    /const conferenceRunning = conferenceStart != null && conferenceEnd != null/.test(section), true);
  eq('  asked of a my-agenda row', /const isPastItem = \(item: DisplayItem\): boolean => \{/.test(section), true);
  eq('  and of a full-agenda one, whose date is still a label',
    /const isPastAgendaItem = \(dayLabel: string, startTime: string \| null\): boolean => \{/.test(section), true);
  // parseMinutes parks booth hours and TBD at 9998, past any real time of
  // day, so they fade with their day rather than at some minute of it.
  eq('  with booth hours passing with the day', /if \(hasNoStartTime\(time\)\) return 9998;/.test(section), true);

  eq('the drawer hands the dates down',
    /conferenceStart=\{selected\.start_date\}/.test(drawer) && /conferenceEnd=\{selected\.end_date\}/.test(drawer), true);
  // The dashboard's own agenda section passes none, so nothing fades there.
  eq('  and they are optional, so nothing else changed',
    /conferenceStart = null, conferenceEnd = null,/.test(section), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
