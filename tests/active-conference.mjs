/**
 * Which conference the app opens on, when nobody has said.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/active-conference.mjs
 *
 * The rule was "the soonest conference you are an internal attendee of, and
 * failing that the last one you attended". A rep whose name is on no
 * conference record got nothing at all, and a rep who had just finished a
 * show opened on the one that had ended rather than the one starting Monday.
 *
 * It is now two passes of the same question: first over the conferences you
 * are an internal attendee of and only about now and next, then — if that
 * found neither — over the whole program, which is where a past conference
 * is allowed to answer. Ties inside a pass go to National, then to the name.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import {
  attendeeNames, candidateStage, compareByCoverageThenName, isInternalAttendee,
  isNational, pickActiveConference,
} from '../lib/activeConference.ts';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

// Today, for every case below.
const NOW = Date.parse('2026-10-21T15:00:00Z');
const DAY = 86_400_000;
const date = (offsetDays) => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);

let id = 0;
const conf = (name, startOffset, endOffset, over = {}) => ({
  id: ++id, name, start_date: date(startOffset), end_date: date(endOffset),
  location: 'Chicago, IL', internal_attendees: null, territory_scope: null, ...over,
});
const pick = (list, names = []) => pickActiveConference(list, names, NOW)?.name ?? null;

console.log('\n— who counts as on it —');
{
  eq('both names are tried', attendeeNames({ displayName: 'Kevin Winn', repName: 'K Winn' }),
    ['kevin winn', 'k winn']);
  eq('  cased and spaced however they were typed',
    attendeeNames({ displayName: '  Kevin Winn  ', repName: null }), ['kevin winn']);
  eq('  and a user with neither matches nothing', attendeeNames({}), []);

  const mine = conf('NIC Fall', -1, 2, { internal_attendees: 'Dan Lopez, Kevin Winn , Henri Sejournet' });
  eq('a name on the list counts', isInternalAttendee(mine, ['kevin winn']), true);
  eq('  a name not on it does not', isInternalAttendee(mine, ['jane doe']), false);
  // Whole entries, not substrings: "Kevin Winn" is not "Kevin Winn (GTM)".
  eq('  and half a name does not', isInternalAttendee(mine, ['kevin']), false);
  eq('  nor does a conference with nobody on it', isInternalAttendee(conf('X', 0, 1), ['kevin winn']), false);
}

console.log('\n— the first pass: conferences you are on —');
{
  const me = 'Kevin Winn';
  const onIt = { internal_attendees: me };
  eq('one you are at, happening now',
    pick([conf('NIC Fall', -1, 2, onIt), conf('CALA Fall', 12, 14, onIt)], ['kevin winn']), 'NIC Fall');
  /* Upcoming is ranked the same way as now — National, then the name — so
     the one starting soonest does not automatically win. CALA Fall in twelve
     days is picked over PALA in seven because C comes before P. */
  eq('  or one you are at that is coming up',
    pick([conf('CALA Fall', 12, 14, onIt), conf('PALA', 7, 9, onIt)], ['kevin winn']), 'CALA Fall');
  eq('    where National still comes first',
    pick([
      conf('CALA Fall', 12, 14, onIt),
      conf('PALA', 7, 9, { ...onIt, territory_scope: 'national' }),
    ], ['kevin winn']), 'PALA');

  /*
   * The reach backwards is gone. A conference of yours that has ended is not
   * a reason to ignore the one the whole company is at this week.
   */
  eq('a past one of yours does not beat a current one of anybody’s',
    pick([conf('ENGAGE', -40, -38, onIt), conf('NIC Fall', -1, 2)], ['kevin winn']), 'NIC Fall');
  eq('  nor an upcoming one of anybody’s',
    pick([conf('ENGAGE', -40, -38, onIt), conf('CALA Fall', 12, 14)], ['kevin winn']), 'CALA Fall');
}

console.log('\n— the second pass: the whole program —');
{
  // The rep whose name is on no conference record used to get nothing at all.
  eq('a rep on nothing still opens somewhere',
    pick([conf('NIC Fall', -1, 2), conf('CALA Fall', 12, 14)], ['nobody']), 'NIC Fall');
  eq('  and so does a user with no name to match on',
    pick([conf('NIC Fall', -1, 2)], []), 'NIC Fall');
  eq('in progress beats upcoming', pick([conf('CALA Fall', 12, 14), conf('NIC Fall', -1, 2)], []), 'NIC Fall');
  eq('  upcoming beats past', pick([conf('ENGAGE', -40, -38), conf('CALA Fall', 12, 14)], []), 'CALA Fall');
  eq('and an empty program has no answer', pick([], ['kevin winn']), null);
}

console.log('\n— two at once —');
{
  eq('National wins', isNational(conf('X', 0, 1, { territory_scope: 'national' })), true);
  eq('  however it was cased', isNational(conf('X', 0, 1, { territory_scope: ' National ' })), true);
  eq('  regional does not', isNational(conf('X', 0, 1, { territory_scope: 'regional' })), false);
  eq('  and neither does unset', isNational(conf('X', 0, 1)), false);

  eq('the National one of two in progress',
    pick([
      conf('ZZZ Regional', -1, 2, { territory_scope: 'regional' }),
      conf('NIC Fall', -1, 2, { territory_scope: 'national' }),
    ], []), 'NIC Fall');
  // Nothing National: alphabetical, which decides nothing of substance but
  // decides it the same way on every reload.
  eq('  otherwise the first alphabetically',
    pick([conf('XYZ Event', -1, 2), conf('ABC Event', -1, 2)], []), 'ABC Event');
  eq('  and alphabetically among the Nationals',
    pick([
      conf('XYZ Event', -1, 2, { territory_scope: 'national' }),
      conf('ABC Event', -1, 2, { territory_scope: 'national' }),
      conf('AAA Event', -1, 2),
    ], []), 'ABC Event');
  eq('the same rule picks between two upcoming',
    pick([
      conf('XYZ Event', 5, 7),
      conf('CALA Fall', 9, 11, { territory_scope: 'national' }),
    ], []), 'CALA Fall');
  // And it is the tie-break in the first pass too, not only the second.
  eq('  and between two of yours',
    pick([
      conf('XYZ Event', -1, 2, { internal_attendees: 'Kevin Winn' }),
      conf('ABC Event', -1, 2, { internal_attendees: 'Kevin Winn' }),
    ], ['kevin winn']), 'ABC Event');

  eq('a start date no longer decides it',
    pick([conf('ZZZ Early', 1, 3), conf('AAA Later', 20, 22)], []), 'AAA Later');
  eq('  case and digits read naturally', [
    compareByCoverageThenName(conf('abc', 0, 1), conf('ABD', 0, 1)) < 0,
    compareByCoverageThenName(conf('Event 2', 0, 1), conf('Event 10', 0, 1)) < 0,
  ], [true, true]);
}

console.log('\n— the past, when it is all there is —');
{
  // Recency first: what ended last. National breaks a tie between two that
  // ended on the same day, not a six-month gap.
  eq('the one that ended last',
    pick([conf('ENGAGE', -90, -88), conf('NCAL DAY', -10, -7)], []), 'NCAL DAY');
  eq('  even when an older one is National',
    pick([
      conf('ENGAGE', -90, -88, { territory_scope: 'national' }),
      conf('NCAL DAY', -10, -7),
    ], []), 'NCAL DAY');
  eq('  with National breaking a same-day tie',
    pick([
      conf('ZZZ Show', -10, -7),
      conf('Thrive Forum', -10, -7, { territory_scope: 'national' }),
    ], []), 'Thrive Forum');
  eq('  and the name breaking the rest',
    pick([conf('ZZZ Show', -10, -7), conf('ABC Show', -10, -7)], []), 'ABC Show');
}

console.log('\n— which stage a conference is in —');
{
  eq('before it starts', candidateStage(conf('X', 3, 5), NOW), 'planning');
  eq('  through the END of its last day', candidateStage(conf('X', -2, 0), NOW), 'in_progress');
  eq('  then the post-conference window', candidateStage(conf('X', -5, -2), NOW), 'post_conference');
  eq('  which closes after it', candidateStage(conf('X', -40, -38), NOW), 'closed');
  // The three fields the nav query did not used to send.
  eq('a stage held by hand is honoured',
    candidateStage(conf('X', 3, 5, { stage_override: 'in_progress' }), NOW), 'in_progress');
  eq('  a historical conference is closed, not computed',
    candidateStage(conf('X', -1, 2, { is_historical: 1 }), NOW), 'closed');
  eq('  and the window is as long as the conference says',
    candidateStage(conf('X', -5, -2, { post_conference_days: 1 }), NOW), 'closed');
  // Which is what they are read for: a conference held in planning by hand
  // must not be picked as the one happening now.
  eq('so a held conference lands in the right bucket',
    pick([
      conf('Held Back', -1, 2, { stage_override: 'planning' }),
      conf('Really On', -1, 2),
    ], []), 'Really On');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
