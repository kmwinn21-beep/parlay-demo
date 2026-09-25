/**
 * The entity picker beside the relationship map, and the map's edge colours.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/relationship-picker.mjs
 *
 * The ordering is the part with rules in it — which groups lead, what a
 * company with two types does, where one with none goes — and none of that is
 * visible in a screenshot of the result. So it is BEHAVIOUR and is run here.
 * The drag, the chip grid and the dimming are checked in Chromium instead,
 * because they are geometry and state rather than logic.
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

const { typesPresent, groupFor, groupCompanies, filterCompanies, toneFor, NO_TYPE_GROUP } =
  await import('@/lib/relationshipPicker');


const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const co = (id, name, types, units = null, att = 0, rel = 0) => ({
  id, name, company_types: types, units, attendeeCount: att, relationshipCount: rel,
});
const ICP = ['customer', 'prospect'];

console.log('\n— which chips to offer —');
{
  const list = [co(1, 'A', ['Vendor']), co(2, 'B', ['Customer']), co(3, 'C', ['Partner'])];
  // Only the types on this map. A chip that filters to nothing is worse than
  // no chip.
  eq('only the types present are offered', typesPresent(list, ICP), ['Customer', 'Partner', 'Vendor']);
  eq('  with the ICP types leading',
    typesPresent([co(1, 'A', ['Vendor']), co(2, 'B', ['Prospect'])], ICP), ['Prospect', 'Vendor']);
  eq('  and the rest alphabetical',
    typesPresent([co(1, 'A', ['Zeta']), co(2, 'B', ['Alpha'])], []), ['Alpha', 'Zeta']);
  eq('a type is offered once however many companies carry it',
    typesPresent([co(1, 'A', ['Vendor']), co(2, 'B', ['Vendor'])], []), ['Vendor']);
  // Matching is case-insensitive against ICP, which stores its values
  // lowercased.
  eq('  and ICP matching ignores case',
    typesPresent([co(1, 'A', ['Customer'])], ['CUSTOMER'])[0], 'Customer');

  // Untyped companies are common — the type is guessed from the name on
  // import and a badge scan leaves it blank.
  eq('untyped companies get a bucket',
    typesPresent([co(1, 'A', [])], []), [NO_TYPE_GROUP]);
  eq('  placed last, behind the account\'s own vocabulary',
    typesPresent([co(1, 'A', []), co(2, 'B', ['Vendor'])], []), ['Vendor', NO_TYPE_GROUP]);
  eq('nothing to offer is no chips', typesPresent([], ICP), []);
}

console.log('\n— which group a company is listed under —');
{
  eq('a single type is the group', groupFor(co(1, 'A', ['Vendor']), ICP), 'Vendor');
  // A Customer that is also a Partner is a customer first — that is the
  // heading somebody looks for it beneath.
  eq('an ICP type wins over another', groupFor(co(1, 'A', ['Partner', 'Customer']), ICP), 'Customer');
  eq('  whichever order they are in', groupFor(co(1, 'A', ['Customer', 'Partner']), ICP), 'Customer');
  eq('with no ICP type, the first wins', groupFor(co(1, 'A', ['Partner', 'Vendor']), ICP), 'Partner');
  eq('no type at all is the bucket', groupFor(co(1, 'A', []), ICP), NO_TYPE_GROUP);
  eq('  and neither are blanks', groupFor(co(1, 'A', ['  ']), ICP), NO_TYPE_GROUP);
}

console.log('\n— the order of the list —');
{
  const list = [
    co(1, 'Vendor Co', ['Vendor'], null, 0, 1),
    co(2, 'Customer Co', ['Customer'], 100, 2, 3),
    co(3, 'Alpha Partner', ['Partner'], null, 0, 9),
    co(4, 'Untyped Co', [], null, 0, 5),
    co(5, 'Prospect Co', ['Prospect'], 50, 1, 2),
  ];
  const groups = groupCompanies(list, ICP);
  eq('ICP groups lead, then the rest by name, bucket last',
    groups.map(g => g.type), ['Customer', 'Prospect', 'Alpha Partner'.slice(0, 0) + 'Partner', 'Vendor', NO_TYPE_GROUP]);
  eq('  and the ICP ones are marked as such',
    groups.map(g => g.isIcp), [true, true, false, false, false]);

  // Within a group, the most connected first: the reason to open this panel
  // is to find the company that connects to things, and a list by name buries
  // the hub the map exists to show.
  // Named so that alphabetical order and connection order disagree — with
  // Alpha the least connected, sorting by name alone would look identical to
  // sorting by count.
  const many = groupCompanies([
    co(1, 'Alpha', ['Vendor'], null, 0, 1),
    co(2, 'Zeta', ['Vendor'], null, 0, 9),
    co(3, 'Mid', ['Vendor'], null, 0, 5),
  ], []);
  eq('the most connected company leads its group',
    many[0].companies.map(c => c.name), ['Zeta', 'Mid', 'Alpha']);
  // And names break a tie, so the order is stable rather than arbitrary.
  const tied = groupCompanies([
    co(1, 'Zeta', ['Vendor'], null, 0, 7),
    co(2, 'Alpha', ['Vendor'], null, 0, 7),
  ], []);
  eq('  with names breaking a tie', tied[0].companies.map(c => c.name), ['Alpha', 'Zeta']);
}

console.log('\n— the chips filter —');
{
  const list = [
    co(1, 'V', ['Vendor']), co(2, 'C', ['Customer']), co(3, 'U', []),
  ];
  // The panel opens with nothing selected, and an empty list there would read
  // as a broken map.
  eq('no chips selected shows everything', filterCompanies(list, [], '').length, 3);
  eq('one chip narrows to it', filterCompanies(list, ['Vendor'], '').map(c => c.name), ['V']);
  // Chips are alternatives, not conditions — that is what a row of them means
  // to the person clicking.
  eq('two chips widen rather than narrow',
    filterCompanies(list, ['Vendor', 'Customer'], '').map(c => c.name), ['V', 'C']);
  // A company carrying two types matches a chip for either of them. `every`
  // would need every one of its types selected, which is not what a row of
  // alternatives means.
  const dual = [co(9, 'Dual', ['Partner', 'Customer'])];
  eq('a company with two types matches a chip for one of them',
    filterCompanies(dual, ['Customer'], '').length, 1);
  eq('  and for the other', filterCompanies(dual, ['Partner'], '').length, 1);
  eq('  but not for a type it does not carry',
    filterCompanies(dual, ['Vendor'], '').length, 0);

  eq('the bucket chip finds untyped companies',
    filterCompanies(list, [NO_TYPE_GROUP], '').map(c => c.name), ['U']);
  eq('  and does not catch typed ones',
    filterCompanies(list, [NO_TYPE_GROUP], '').length, 1);

  eq('search matches the name', filterCompanies(list, [], 'v').map(c => c.name), ['V']);
  eq('  ignoring case', filterCompanies(list, [], 'V').map(c => c.name), ['V']);
  eq('  and combines with the chips',
    filterCompanies(list, ['Vendor'], 'c').length, 0);
  eq('a search matching nothing is empty', filterCompanies(list, [], 'zzz'), []);
}

console.log('\n— what colour an edge is —');
{
  // Four legend buckets against an open-ended status list, so the match is
  // loose on purpose.
  eq('a current vendor is current', toneFor(['Current Vendor'], []), 'current');
  eq('a former vendor is former', toneFor(['Former Vendor'], []), 'former');
  eq('  as is a former customer', toneFor(['Former Customer'], []), 'former');
  eq('evaluating is the pilot bucket', toneFor(['Evaluating'], []), 'pilot');
  eq('  and so is an active pilot', toneFor(['Active Pilot'], []), 'pilot');
  eq('  and a prospect', toneFor(['Prospect'], []), 'pilot');
  // An account that renames an option should still land somewhere sensible.
  eq('a renamed pilot still reads as one', toneFor(['Pilot — Phase 1'], []), 'pilot');
  eq('  and a renamed former', toneFor(['Previously used'], []), 'former');
  // The company's own type beats the status: a competitor is a competitor
  // whatever the relationship says.
  eq('a competitor is coloured as one', toneFor(['Current Vendor'], ['Competitor']), 'competitor');
  eq('  whatever case it is stored in', toneFor(['Current Vendor'], ['competitor']), 'competitor');
  eq('anything unrecognised is current', toneFor(['Reseller'], []), 'current');
  eq('  including nothing at all', toneFor([], []), 'current');
}

console.log('\n— the pieces on the page —');
{
  const picker = strip('components/relationship-map/EntityPicker.tsx');
  const canvas = strip('components/relationship-map/MapCanvas.tsx');
  const modal = strip('components/RelationshipMapModal.tsx');
  const charts = strip('components/AnalyticsCharts.tsx');

  // Three across, two rows, the rest behind See more.
  eq('the chips are a three-column grid', /grid-cols-3/.test(picker), true);
  eq('  two rows before the rest fold away',
    /const ROWS_COLLAPSED = 2;/.test(picker) && /const COLS = 3;/.test(picker), true);
  eq('  counted off the collapsed slice, so the control survives expanding',
    /Math\.max\(0, allTypes\.length - VISIBLE\)/.test(picker), true);
  eq('  with an animated expansion', /transition-\[max-height\]/.test(picker), true);
  eq('  and a chip toggles off when clicked again',
    /prev\.includes\(t\) \? prev\.filter\(x => x !== t\) : \[\.\.\.prev, t\]/.test(picker), true);

  // Everything else recedes so the chosen company stands out.
  eq('the other companies dim when one is chosen',
    /const dimmed = selectedId !== null && !selected;/.test(picker)
    && /dimmed \? 'opacity-40' : ''/.test(picker), true);

  // ICP rows show the numbers; everything else shows the type.
  eq('ICP rows carry units and attendees',
    /\{group\.isIcp \? \(/.test(picker) && /units\.toLocaleString\(\)/.test(picker), true);
  eq('  and other rows carry the type pill',
    /c\.company_types\.slice\(0, 2\)\.map/.test(picker), true);
  eq('every row carries its relationship count',
    /\{c\.relationshipCount\}/.test(picker), true);

  // The cards move.
  eq('spokes are draggable', /onPointerDown=\{e => onPointerDown\(e, s\.id\)\}/.test(canvas), true);
  eq('  clamped inside the canvas, which does not scroll',
    /Math\.max\(0, Math\.min\(box\.width - CARD_W/.test(canvas), true);
  eq('  and each hub keeps its own arrangement',
    /\[hub\.id\]: \{ \.\.\.\(prev\[hub\.id\] \?\? \{\}\), \[dragging\]/.test(canvas), true);
  // A line must never swallow a drag meant for the card above it.
  eq('the edges do not take pointer events', /pointer-events-none/.test(canvas), true);

  // The spoke reads from the hub's side, the same rule the company record uses.
  eq('a spoke inverts when the hub is the far end',
    /const inbound = e\.to === hubNode\.id;/.test(modal), true);

  // Opened from the Insights row, not replacing it.
  eq('the Insights row has the map button', /Relationship Map/.test(charts), true);
  eq('  with a hub-and-spoke icon beside it',
    /<circle cx="12" cy="12" r="2\.5" \/>/.test(charts), true);
  eq('  and the charts are still there', /Company Type Breakdown/.test(charts), true);
  eq('the analytics tab still renders the charts',
    /activeTab === 'analytics'/.test(strip('app/conferences/[id]/page.tsx')), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
