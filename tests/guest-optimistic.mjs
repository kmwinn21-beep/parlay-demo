/**
 * Saving a guest list shows it straight away.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/guest-optimistic.mjs
 *
 * The save wrote, then refetched the whole conference and waited for it — so
 * the drawer sat there showing the old list under a success toast, and the new
 * guests only turned up after a page reload.
 *
 * The component already had this shape twice, for RSVPs and for ranks: a local
 * override read through a getter and written through the handler. The guest
 * list is a third, keyed by event id.
 *
 * Driven in Chromium at 390x844 with onRefresh deliberately doing NOTHING, so
 * anything that appears can only have come from the optimistic state:
 *
 *   saved two guests -> 2 INVITED, 2 MAYBE, both names in the drawer
 *   server returns 500 -> 0 INVITED, 0 MAYBE, "No attendees to show."
 *
 * The MAYBE seeding is why the first line reads 2 and not 0: the route gives a
 * new guest 'maybe', so without it the optimistic state would disagree with
 * the confirmed one, which is what makes optimism worse than waiting.
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

const { sameIdSet } = await import('@/lib/guestListIds');

console.log('\n— when the server has caught up —');
{
  /*
   * Set equality, not array equality. The route APPENDS to a comma-separated
   * column, so what comes back is not in the order it was sent, and an
   * override compared by order would never match and never be dropped.
   */
  eq('the same ids in another order are the same list',
    sameIdSet([3, 1, 2], [1, 2, 3]), true);
  eq('  and a repeat does not make a different one',
    sameIdSet([1, 2, 2], [2, 1]), true);
  eq('two empty lists match', sameIdSet([], []), true);

  eq('one more is a different list', sameIdSet([1, 2], [1, 2, 3]), false);
  eq('  one fewer too', sameIdSet([1, 2, 3], [1, 2]), false);
  eq('  and a swap of the same length', sameIdSet([1, 2], [1, 3]), false);
  eq('  as is emptying it', sameIdSet([1], []), false);
}

console.log('\n— the list on screen is the saved one —');
{
  const table = strip('components/SocialEventsTable.tsx');

  // A third override beside the two the component already had.
  eq('there is an optimistic guest list',
    /const \[localGuests, setLocalGuests\] = useState<Record<number, number\[\]>>\(\{\}\);/.test(table), true);
  eq('  read through a getter like the other two',
    /ev\.id in localGuests \? localGuests\[ev\.id\] : parseRepIds\(ev\.prospect_attendees\)/.test(table), true);
  // The drawer and the cards both read the list from here, so neither can
  // show a different one.
  eq('  and it is what the drawer is built from',
    /const ids = getEffectiveGuestIds\(ev\);/.test(table), true);
  eq('  with nothing still reading the raw column for it',
    /const ids = parseRepIds\(ev\.prospect_attendees\);/.test(table), false);

  // Written before the requests go out, which is the whole point.
  eq('the save writes it first',
    /setLocalGuests\(prev => \(\{ \.\.\.prev, \[eventId\]: ids \}\)\)[\s\S]{0,900}const send = async/.test(table), true);

  /*
   * And seeds 'maybe' for the people added, because that is what the route
   * writes. Without it the drawer would count somebody under INVITED and leave
   * them out of MAYBE until a refetch landed — measured 2 INVITED / 2 MAYBE
   * with the seeds, which is what the server produces.
   */
  eq('  seeding the RSVP the route will write',
    /next\[`\$\{eventId\}:\$\{id\}`\] = \['maybe'\]/.test(table), true);
  eq('  and dropping it for anyone removed',
    /for \(const id of removed\) delete next\[`\$\{eventId\}:\$\{id\}`\]/.test(table), true);

  /*
   * The diff is taken against what is on screen, not against the server's
   * copy. With an unconfirmed save in place those differ, and diffing against
   * the server's would re-send every change made since.
   */
  eq('the diff is against the list being shown',
    /const current = ev \? getEffectiveGuestIds\(ev\) : \[\];/.test(table), true);
}

console.log('\n— and put back when the save fails —');
{
  const table = strip('components/SocialEventsTable.tsx');
  eq('a failure undoes the optimistic write', /undo\(\);\s*\n\s*onRefresh\(\);/.test(table), true);
  // Back to whatever was there before, which is not always "nothing": a second
  // save while a first is still in flight has a previous override to restore.
  eq('  to the override it replaced, if there was one',
    /if \(rollbackGuests\) next\[eventId\] = rollbackGuests; else delete next\[eventId\];/.test(table), true);
  eq('  and the seeded RSVPs go with it',
    /for \(const id of added\) delete next\[`\$\{eventId\}:\$\{id\}`\]/.test(table), true);
}

console.log('\n— an override does not outlive its usefulness —');
{
  const table = strip('components/SocialEventsTable.tsx');
  /*
   * The RSVP and rank overrides above are never cleared, which is survivable
   * for one field and not for a whole list: a guest list changed elsewhere —
   * or by the event's own edit form, which writes prospect_attendees directly
   * — would be masked for as long as the page stayed open.
   */
  eq('it is dropped once the server agrees',
    /sameIdSet\(parseRepIds\(ev\.prospect_attendees\), ids\)/.test(table), true);
  eq('  checked whenever the events change', /\}, \[events\]\);/.test(table), true);
  // Same object back when nothing was dropped, so this cannot loop.
  eq('  and nothing re-renders when none was', /return dropped \? next : prev;/.test(table), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
