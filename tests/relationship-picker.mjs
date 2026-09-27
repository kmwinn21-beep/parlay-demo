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
  // By a grip rather than the card itself: the card has buttons in it, and a
  // drag starting on Update is either a drag that does not work or a button
  // that does not.
  eq('spokes are dragged by a grip', /startDrag\(e, s\.id\)/.test(canvas), true);
  eq('  and so is the hub', /startDrag\(e, 'hub'\)/.test(canvas), true);
  // setPointerCapture is dropped when the card re-renders mid-drag, which
  // stranded the pointer and made a card draggable in one part of the canvas
  // and not another.
  eq('  tracked on the window, not the card',
    /window\.addEventListener\('pointermove', onMove\)/.test(canvas), true);
  eq('  clamped inside the canvas, which does not scroll',
    /Math\.max\(0, Math\.min\(box\.width - w,/.test(canvas), true);
  // One spoke per relationship. Keying on the company collapsed two
  // relationships with one company into a single React key, which rendered a
  // duplicate card and left the hub's count disagreeing with what was drawn.
  eq('a spoke is keyed by its relationship, not its company',
    /id: rel\.id,/.test(modal), true);
  eq('  and the canvas keys on that', /key=\{s\.id\}/.test(canvas), true);
  // Moving the hub re-arranges whatever the reader has not placed, instead of
  // dragging the whole ring along and clamping it into a wall.
  eq('the canvas lays spokes out around wherever the hub is',
    /layoutSpokes\(\{/.test(canvas), true);
  eq('  passing the cards the reader placed as fixed',
    /fixed: moved\[hub\.id\] \?\? \{\}/.test(canvas), true);

  // The cards fly out of the hub when a company is picked.
  eq('the spokes animate outward from the hub',
    /return settled \? placed : \{ x: centre\.x - CARD_W \/ 2, y: centre\.y - CARD_H \/ 2 \};/.test(canvas), true);
  // The same card the company record shows, collapsed by default.
  eq('a spoke is the shared relationship card',
    /<VendorRelationshipCard/.test(canvas), true);
  eq('  and each hub keeps its own arrangement',
    /\[hub\.id\]: \{ \.\.\.\(prev\[hub\.id\] \?\? \{\}\), \[dragging\]/.test(canvas), true);
  // A line must never swallow a drag meant for the card above it.
  eq('the edges do not take pointer events', /pointer-events-none/.test(canvas), true);

  // The spokes come from the endpoint that already reads a relationship from
  // the selected company's side, rather than a second inversion here.
  eq('spokes are the company record\'s own cards',
    /fetch\(`\/api\/vendor-relationships\?company_id=\$\{companyId\}`/.test(modal), true);
  // A picker row that opens an empty canvas is a dead end.
  eq('only connected companies are listed',
    /nodes\.filter\(n => n\.relationshipCount > 0\)/.test(modal), true);

  // The toggle narrowed which companies were looked up and then drew every
  // relationship either way, so both settings showed the same spokes.
  // Verified in Chromium: two spokes at conference scope, four on all
  // accounts, against a fixture where two of the four are off-show.
  eq('at this conference shows only relationships whose far end is here too',
    /scope === 'all' \|\| atConference\.has\(rel\.related_company_id\)/.test(modal), true);
  eq('  reading who is here from the endpoint rather than from a count',
    /setAtConference\(new Set\(d\.atConference \?\? \[\]\)\)/.test(modal), true);
  eq('  and the hub badge counts what is drawn',
    /\? spokes\.length/.test(modal), true);

  // Nothing about who came belongs on a relationship card.
  eq('a spoke card carries no attendee line',
    /not at this show/.test(canvas) || /footnote/.test(canvas), false);

  // The scope reads as a place rather than a setting.
  eq('the toggle names the conference',
    /conferenceName \? `At \$\{conferenceName\}` : 'At this conference'/.test(modal), true);
  eq('  and the wider scope is about relationships, not accounts',
    /'All Relationships'/.test(modal), true);
  // Verified in Chromium against the built stylesheet: 1360px, up from 1280.
  eq('the modal is wider', /max-w-\[1360px\]/.test(modal), true);

  // Internal relationships beside the map, using the pre-conference review's
  // own card. Health behind that card is five cross-conference queries, so a
  // second one here would have meant duplicating them.
  eq('the internal column uses the pre-conference card',
    /<RelationshipAttendeeCard/.test(modal), true);
  eq('  fed from that endpoint rather than a query of its own',
    /\/pre-conference`, \{ cache: 'no-store' \}/.test(modal), true);
  eq('  and read-only, since the map is not where targets are set',
    /readOnly\s*\n?\s*\/>/.test(modal), true);
  // An empty column would take width from the map for nothing.
  eq('the column is absent when there are no internal relationships',
    /\{internalCards\.length > 0 && \(/.test(modal), true);
  eq('  and collapses to a strip rather than disappearing',
    /width: internalOpen \? 320 : 40/.test(modal), true);
  eq('  with the width animated both ways',
    /transition-\[width\] duration-300 ease-in-out/.test(modal), true);
  // Kept mounted so reopening does not refetch every timeline the cards load.
  eq('  and the cards stay mounted while collapsed',
    /internalOpen \? '' : 'invisible'/.test(modal), true);

  // The guard on `timeline` was pointless while the next step assumed
  // `attendee`: a 200 without that key took the whole card out, which is how
  // the probe found it.
  eq('the internal card survives a timeline without an attendee',
    /timeline\?\.attendee\./.test(strip('components/pre-conference/RelationshipsTab.tsx')), false);

  // The rows were grey by default, which read as every company being
  // unavailable rather than as none being chosen.
  eq('an unselected company is full-strength brand primary',
    /text-xs font-semibold text-brand-primary truncate/.test(picker), true);
  eq('  on the same grey card the attendee list uses',
    /border-gray-100 bg-gray-50 hover:bg-gray-100/.test(picker), true);

  // Beside the other reports rather than inside the Insights tab: it answers a
  // question about the conference, not about the charts it was buried under.
  const page = strip('app/conferences/[id]/page.tsx');
  eq('the map opens from the conference header', /<span>Relationship Map<\/span>/.test(page), true);
  eq('  with a hub-and-spoke icon beside it',
    /<circle cx="12" cy="12" r="2\.5" \/>/.test(page), true);
  // Between Pre-Conference and Activity Debrief, which is where it was asked
  // for and is not something the button itself can say.
  eq('  between Pre-Conference and Activity Debrief',
    page.indexOf('<PreConferenceReview') < page.indexOf('<span>Relationship Map</span>')
    && page.indexOf('<span>Relationship Map</span>') < page.indexOf('<PostConferenceReview'), true);
  // Formatted like the two it sits between rather than like the filter chips
  // it used to live among.
  eq('  formatted like its neighbours',
    /py-1 px-1 text-sm font-medium text-gray-500 hover:text-brand-accent transition-colors whitespace-nowrap/.test(page), true);

  // Sliced out of the page rather than matched anywhere in it: every report
  // on this row takes a conferenceName, so a loose match passes while this
  // one has lost its own.
  const mapMount = page.slice(page.indexOf('{showRelationshipMap'), page.indexOf('{showLogisticsDrawer'));
  eq('the map is actually mounted', /<RelationshipMapModal/.test(mapMount), true);
  eq('  behind its own open state',
    /\{showRelationshipMap && conference && \(/.test(mapMount), true);
  eq('  with the name passed in from the conference page',
    /conferenceName=\{conference\.name\}/.test(mapMount), true);

  // And gone from the Insights row, along with the prop that only existed for
  // it — a tab that still fetches for a button it no longer has is the usual
  // leftover.
  eq('the Insights row no longer carries it', /Relationship Map/.test(charts), false);
  eq('  nor the conference id it needed', /conferenceId/.test(charts), false);
  eq('  and the charts are still there', /Company Type Breakdown/.test(charts), true);
  eq('the analytics tab still renders the charts', /activeTab === 'analytics'/.test(page), true);
}

console.log('\n— on a phone —');
{
  const modal = strip('components/RelationshipMapModal.tsx');
  const tab = strip('components/pre-conference/RelationshipsTab.tsx');

  // The same two panels the pre-conference relationships tab uses, rather than
  // a shrunken version of the canvas.
  eq('the two layouts are exclusive',
    /sm:hidden flex flex-col p-3/.test(modal) && /hidden sm:flex gap-3 p-3/.test(modal), true);
  eq('  with a toggle between a list and the chosen company',
    /setMobileTab\('companies'\)/.test(modal) && /setMobileTab\('relationships'\)/.test(modal), true);
  eq('  naming the company on the second tab',
    /\{hubNode \? hubNode\.name : 'Relationships'\}/.test(modal), true);
  eq('  and switching to it when one is picked',
    /setSelectedId\(id\); setMobileTab\('relationships'\);/.test(modal), true);

  // No hub and spokes: a canvas you rearrange by dragging is of no use on a
  // phone, and the cards are the content.
  const mobileBlock = modal.slice(modal.indexOf('sm:hidden flex flex-col p-3'), modal.indexOf('hidden sm:flex gap-3 p-3'));
  eq('the canvas is not rendered on a phone', /<MapCanvas/.test(mobileBlock), false);
  eq('  the cards are, stacked', /<VendorRelationshipCard/.test(mobileBlock), true);
  eq('  under the same headings the tab uses',
    /<SectionHead label="Internal"/.test(mobileBlock), true);
  eq('  and the picker fills the width',
    /className="flex-1 min-h-0"/.test(mobileBlock), true);
  // Which of the two panels is on screen follows the toggle. Without this the
  // list can be wired to the tab and still never shown.
  eq('  with the toggle choosing which panel shows',
    /\{mobileTab === 'companies' \? \(/.test(mobileBlock), true);

  // One SectionHead, shared. Two lines is exactly the size of thing that gets
  // copied and then drifts.
  eq('the section heading is shared, not copied',
    /export function SectionHead/.test(tab) && /SectionHead \}? from '@\/components\/pre-conference\/RelationshipsTab'|RelationshipAttendeeCard, SectionHead \}/.test(modal), true);
  eq('  and the modal declares none of its own',
    /function SectionHead/.test(modal), false);

  // The picker was a fixed-width column; on a phone it is the whole screen.
  const picker = strip('components/relationship-map/EntityPicker.tsx');
  eq('the picker takes its width from the caller',
    /className = 'w-72 flex-shrink-0'/.test(picker), true);
}

console.log('\n— the view toggle —');
{
  const modal = strip('components/RelationshipMapModal.tsx');
  const rail = strip('components/relationship-map/CompetitiveRail.tsx');
  const desktopBlock = modal.slice(modal.indexOf('hidden sm:flex gap-3 p-3'));
  const mobileBlock = modal.slice(
    modal.indexOf('sm:hidden flex flex-col p-3'),
    modal.indexOf('hidden sm:flex gap-3 p-3'),
  );
  const header = modal.slice(
    modal.indexOf('Relationship Map</h3>'),
    modal.indexOf('sm:hidden flex flex-col p-3'),
  );

  // Two independent choices, two pieces of state. Nesting view inside scope
  // (or the reverse) is what makes flipping one silently reset the other.
  eq('view is a sibling of scope, not derived from it',
    /const \[view, setView\] = useState<'map' \| 'competitive'>\('map'\)/.test(modal), true);
  eq('  and Map is what the modal opens on',
    /useState<'map' \| 'competitive'>\('map'\)/.test(modal), true);
  eq('  scope is untouched by it',
    /const \[scope, setScope\] = useState<'conference' \| 'all'>\('conference'\)/.test(modal), true);
  eq('  so no scope reset hides in the view handler',
    /setView\([^)]*\)[^}]*setScope\(/.test(modal), false);

  // Beside the title, not beside the scope toggle. Four buttons in one row
  // reads as one four-way choice.
  eq('the toggle sits in the title block',
    /Relationship Map<\/h3>[\s\S]*?setView\(v\)[\s\S]*?<\/div>\s*<\/div>\s*<div className="flex items-center gap-2 flex-shrink-0">/.test(modal), true);
  eq('  labelled Map and Competition',
    /\{v === 'map' \? 'Map' : 'Competition'\}/.test(modal), true);
  eq('  built like the scope toggle, not a new pattern',
    /\(\['map', 'competitive'\] as const\)\.map/.test(modal)
      && /: 'bg-white text-gray-600 hover:bg-gray-50'/.test(modal), true);
  // brand-accent, not the hex: a tenant that themes the app themes this too,
  // and a literal would be the one control ignoring their colours. Dark text,
  // because white on that green is about 1.9:1.
  eq('  filled with the brand accent',
    /'bg-brand-accent text-brand-primary'/.test(modal), true);
  eq('  which is that green, from the theme',
    /--brand-accent-rgb:\s+52 211 153/.test(readFileSync('app/globals.css', 'utf8')), true);
  eq('  and no hex is written into the component',
    /#34D399/.test(modal), false);

  // The toggle starts where the canvas does, and the title where the rail
  // does — both from one declared width rather than two numbers that match.
  eq('the rail width is declared once',
    (modal.match(/const RAIL_WIDTH = 288;/g) || []).length, 1);
  // The number itself, not just the name: a second 288 is a second number
  // however it is spelled.
  eq('  and 288 appears nowhere else',
    (modal.match(/\b288\b/g) || []).length, 1);
  eq('  the strip takes it',
    /width: railOpen \? RAIL_WIDTH : RAIL_FOLDED/.test(modal), true);
  // Three: the title block, the rail and the picker. Any one of them falling
  // back to its own width is the alignment quietly coming apart.
  eq('  the title block and both rails are all that width',
    (modal.match(/style=\{\{ width: RAIL_WIDTH \}\}/g) || []).length, 3);
  eq('  and the header is padded like the row below it',
    /px-3 pt-4 pb-3 border-b border-gray-100/.test(modal), true);
  eq('  pressed state is exposed, not only coloured',
    /aria-pressed=\{view === v\}/.test(header), true);

  // Desktop only, and hidden rather than disabled. A control nobody can reach
  // does not need explaining — see BACKLOG.md for what a narrow layout costs.
  eq('the toggle is hidden below the breakpoint',
    /<div className="hidden sm:flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">/.test(header), true);
  eq('  with no disabled state', /disabled/.test(header), false);
  eq('  and no view-it-on-desktop placeholder',
    /desktop/i.test(mobileBlock), false);

  // The whole point of the mobile branch being untouched: it must not read
  // view at all, or a stale render hides in the branch nobody asserts.
  // The identifier, not the word — "view its relationships" is copy.
  eq('the mobile branch never reads view',
    /\bview\s*===|\bsetView\b|\{\s*view\b/.test(mobileBlock), false);
  eq('  it still reads mobileTab', /mobileTab === 'companies'/.test(mobileBlock), true);
  eq('  and renders neither the competitive rail nor its canvas',
    /CompetitiveRail/.test(mobileBlock), false);
  // narrow → desktop comes back to Competitive, which only holds while view
  // survives the breakpoint. Both branches live in one component and one
  // render, so there is no second copy of the state to go stale.
  eq('one component owns both branches, so view survives a resize',
    (modal.match(/export function RelationshipMapModal/g) || []).length, 1);
  eq('  and neither branch is mounted conditionally on width in JS',
    /window\.(innerWidth|matchMedia)/.test(modal), false);

  // The rail swaps; the canvas swaps; the legend swaps.
  eq('the desktop rail swaps with the view',
    /view === 'competitive' \? \(\s*<CompetitiveRail/.test(desktopBlock), true);
  eq('  back to the entity picker in Map',
    /\) : \(\s*<EntityPicker/.test(desktopBlock), true);
  eq('  the canvas swaps too',
    /view === 'competitive' \? \(\s*<CompetitiveGrid/.test(desktopBlock)
      && /\) : loading \? \(/.test(desktopBlock), true);
  eq('  back to the map canvas in Map',
    /<MapCanvas/.test(desktopBlock), true);
  eq('  and the legend explains whichever canvas drew',
    /view === 'competitive' \? \(\s*\(Object\.keys\(SIGNAL_FULL_LABELS\)/.test(desktopBlock), true);
  eq('  Map keeps its edge colours',
    /TONE_COLOR\[tone\]/.test(desktopBlock), true);
  eq('  and its drag hint, which Competitive has no cards to drag in',
    /Drag the grip on a card to rearrange[\s\S]*?\) : \(/.test(desktopBlock)
      || /view === 'competitive' \? \([\s\S]*?Drag the grip on a card to rearrange/.test(desktopBlock), true);

  // The internal column is the SELECTED company's contacts. Competitive has no
  // selected company, so the column goes — and its chevron with it.
  eq('the internal column is Map only',
    /\{view === 'map' && internalCards\.length > 0 && \(/.test(desktopBlock), true);
  eq('  so the collapse chevron cannot appear in Competitive',
    /setInternalOpen/.test(desktopBlock.slice(desktopBlock.indexOf("view === 'map' && internalCards"))), true);

  // The subtitle says what you are looking at. One company in Map; the size of
  // the field in Competitive.
  eq('the subtitle swaps with the view',
    /view === 'competitive'\s*\? `\$\{competitors\.length\} competitor/.test(header), true);
  eq('  counting accounts off the cells, not a second query',
    /new Set\(competitive\.cells\.map\(c => c\.companyId\)\)\.size/.test(modal), true);
  eq('  and naming the scope rather than always the conference',
    /scope === 'conference'\s*\? \(conferenceName \?\? 'This conference'\)\s*: 'All relationships'/.test(modal), true);
  eq('  Map still names the selected company',
    /: \(hubNode\?\.name \?\? 'Select a company'\)/.test(header), true);

  // The highlight is per-opening. Nothing outlives the modal.
  eq('the connection highlight starts off',
    /const \[highlightConnected, setHighlightConnected\] = useState\(false\)/.test(modal), true);
  // It shows no connectors, so it no longer says it does.
  eq('  and is not called what it stopped doing',
    /showConnectors/.test(modal), false);
  eq('  and is not persisted anywhere',
    /localStorage|sessionStorage/.test(modal), false);
  eq('  nor parked in a ref that outlives a render',
    /useRef/.test(modal), false);
  // The reset IS the unmount, which only holds while the call site unmounts it.
  eq('  the modal is unmounted on close, which is what resets it',
    /\{showRelationshipMap && conference && \(\s*<RelationshipMapModal/.test(strip('app/conferences/[id]/page.tsx')), true);
  eq('  and nothing is written outside component state',
    /window\.__|globalThis\./.test(modal), false);

  // Signals only governs the three filters, so it shares their heading's row
  // rather than sitting under them as a fourth.
  eq('the rail is the competitive one, by an unambiguous name',
    /view-competitive/.test(rail), true);
  eq('  and that class is not also content',
    /className="view-competitive"|>view-competitive</.test(rail), false);
  // The heading moved onto the collapse strip, which is the one thing that
  // stays visible when the rail is folded. Leaving a copy inside would say it
  // twice while open and lose it entirely while closed.
  eq('the rail carries no heading of its own',
    /font-serif">Signals<\/p>/.test(rail), false);
  eq('  the strip says it instead',
    /\{view === 'competitive' \? 'Signals' : 'Select an entity'\}/.test(modal), true);
  eq('  and the picker gave up its heading too',
    /Select an entity/.test(strip('components/relationship-map/EntityPicker.tsx')), false);
  eq('signals only still leads the rail',
    /checked=\{signalsOnly\}/.test(rail), true);
  eq('  the connection highlight sits beside it',
    rail.indexOf('checked={signalsOnly}') < rail.indexOf('checked={highlightConnected}'), true);
  eq('  labelled for what it does',
    /Highlight connections/.test(rail) && /Show connectors/.test(rail) === false, true);
  eq('  three signal filters, named from the shared map',
    /\(Object\.keys\(SIGNAL_LABELS\) as SignalKey\[\]\)\.map/.test(rail), true);
  eq('  each with its count',
    /\{signalCounts\[key\]\}/.test(rail), true);
  eq('  and the competitor list doubles as the column picker',
    /Competitors shown/.test(rail) && /onToggleCompetitor\(c\.id\)/.test(rail), true);
  eq('  showing each competitor its account count',
    /\{c\.accountCount\} account\{c\.accountCount === 1 \? '' : 's'\}/.test(rail), true);
  // Hidden, not shown: a competitor that arrives after the modal opened must
  // appear in its own grid rather than be quietly left out of it.
  // Shown unless hidden. As an allowlist, a competitor that arrives in the data
  // after the modal opened is quietly missing from its own grid.
  eq('  tracked as what is hidden, not what is shown',
    /const on = !hiddenCompetitorIds\.has\(c\.id\)/.test(rail), true);

  // Unclassified statuses take part in nothing. That must not be silent.
  eq('the unclassified note appears only when there is one',
    /\{unclassifiedCount > 0 && \(/.test(rail), true);
  eq('  worded as not counted rather than not present',
    /not counted in signals/.test(rail), true);
  eq('  and it links somewhere the account can fix it',
    /href="\/admin"/.test(rail), true);
  eq('  the count comes from the signal module, not a recount here',
    /unclassifiedCount=\{competitive\.unclassifiedCount\}/.test(modal), true);

  // The rail is presentational: every number arrives derived, so the rules stay
  // in a module that is tested without a browser.
  eq('the rail derives nothing itself',
    /deriveSignals|countSignals|RECENT_DAYS/.test(rail), false);
  // Fed the resolved list, not an empty one and not a second derivation of its
  // own. An empty array here is the Phase 2 shell, and shipping it would leave
  // every count reading zero against real data.
  eq('  the modal derives it through the tested module',
    /deriveSignals\(\{\s*relationships: competitiveData\.relationships/.test(modal)
      && /countSignals\(competitive\.cells\)/.test(modal), true);
  eq('  and not from an empty list',
    /deriveSignals\(\{ relationships: \[\] \}\)/.test(modal), false);
  eq('  with the competitor columns taken from the payload, not recomputed',
    /const competitors = competitiveData\.competitors/.test(modal), true);
  // Wired to the same fetch the map reads, so one load fills both views.
  eq('  and the payload is actually stored from the map fetch',
    /setCompetitiveData\(\{ \.\.\.EMPTY_COMPETITIVE, \.\.\.\(d\.competitive \?\? \{\}\) \}\)/.test(modal), true);
  eq('  defaulting every field, so an old endpoint cannot crash the rail',
    /const EMPTY_COMPETITIVE: CompetitivePayload = \{/.test(modal), true);
  // The signal colours are one source, so a legend swatch cannot disagree with
  // the pill it describes.
  // The legend now draws the badge itself rather than a swatch, so the colour
  // is shared by sharing the component.
  eq('  and the signal colours are shared, not copied',
    /<SignalBadge signal=\{key\} \/>/.test(desktopBlock)
      && /export const SIGNAL_TONE/.test(strip('lib/competitiveSignals.ts'))
      && /SIGNAL_TONE/.test(strip('components/RelationshipMapModal.tsx')) === false, true);
}

console.log('\n— the card header, and the grid it had to change for —');
{
  const card = strip('components/VendorRelationshipCard.tsx');
  const grid = strip('components/relationship-map/CompetitiveGrid.tsx');
  const scroll = strip('components/ScrollRow.tsx');
  const modal = strip('components/RelationshipMapModal.tsx');
  const { SIGNAL_ABBREVIATIONS, SIGNAL_FULL_LABELS, SIGNAL_LABELS } =
    await import('@/lib/competitiveSignals');

  // A header that IS a button cannot contain one, and the grid puts a paged
  // pill row inside it and anchors connectors on it.
  eq('the header is a div, not a button',
    /<div\s+data-card-header/.test(card), true);
  eq('  the whole header still toggles',
    /data-card-header\s+onClick=\{\(\) => setExpanded\(v => !v\)\}/.test(card), true);
  eq('  the chevron has a button of its own',
    /onClick=\{e => \{ e\.stopPropagation\(\); setExpanded\(v => !v\); \}\}/.test(card), true);
  eq('  which stops the header firing twice',
    /e\.stopPropagation\(\)/.test(card), true);
  eq('  reporting its state',
    /aria-expanded=\{expanded\}/.test(card), true);
  eq('  and naming the company, so a screen reader hears which card',
    /aria-label=\{`\$\{expanded \? 'Collapse' : 'Expand'\} \$\{heading\}`\}/.test(card), true);
  // Every render site relies on this: none of them wraps the card in a button,
  // which is what the five-site browser check confirms.
  eq('  no render site nests it in a button',
    [
      'components/VendorRelationshipsSection.tsx',
      'components/pre-conference/RelationshipsTab.tsx',
      'components/relationship-map/MapCanvas.tsx',
      'components/relationship-map/CompetitiveGrid.tsx',
      'components/RelationshipMapModal.tsx',
    ].some(f => /<button[^>]*>[\s\S]{0,400}<VendorRelationshipCard/.test(strip(f))), false);

  // ── The card's subject moves as a whole, or not at all ──
  //
  // The card describes the OTHER end of the relationship, which in a grid is
  // the column heading. So the grid makes the ACCOUNT the subject — and every
  // field that describes a subject has to move with it. Getting that half-right
  // is worse than not doing it: a card headed "Annefurt LLC" showing the
  // competitor's type and the competitor's status is three false claims about
  // Annefurt.
  eq('the heading can be overridden',
    /const heading = title \?\? shown\.related_company_name;/.test(card), true);
  eq('  the types too',
    /const shownTypes = typeBadges\s*\?\? \(shown\.related_company_type/.test(card), true);
  eq('  and the statuses',
    /const shownStatuses = statuses \?\? shown\.relationship_status;/.test(card), true);
  eq('  all three are rendered from the overridable values',
    /<StatusPill key=\{s\} value=\{s\}/.test(card)
      && /\{shownTypes\.map\(t => \(/.test(card)
      && /\{heading\}/.test(card), true);
  eq('  and nothing still reads the raw fields in the header',
    /shown\.related_company_type &&/.test(card) || /shown\.relationship_status\.map/.test(card), false);

  eq('the grid passes the account name, because the column is the competitor',
    /title=\{nameOf\(cell\.companyId\)\}/.test(grid), true);
  // A whole column of pills reading "Competitor" says only what its own
  // heading already said.
  eq('  the account types, not the competitor\u2019s',
    /typeBadges=\{typesOf\(cell\.companyId\)\}/.test(grid), true);
  // "Annefurt LLC / Current Vendor" claims Annefurt is the vendor. It is the
  // customer; the counterpart is what that reading is.
  eq('  and the statuses as the ACCOUNT reads them',
    /statuses=\{statusesOf\(rel\)\}/.test(grid), true);
  eq('  all three together, never one without the others',
    ['title=\\{nameOf', 'typeBadges=\\{typesOf', 'statuses=\\{statusesOf']
      .every(re => new RegExp(re).test(grid)), true);

  // Read through the shared function, not a second inversion in the browser.
  eq('the counterpart reading uses statusesFor, not a copy of it',
    /statusesFor\(card\.relationship_status, 'inbound', competitiveData\.inverses\)/.test(modal), true);
  eq('  fed by the pairing the endpoint already loads',
    /inverses,/.test(strip('app/api/conferences/[id]/relationship-map/route.ts')), true);
  eq('  and the grid does not invert anything itself',
    /inverse|counterpart/i.test(grid), false);
  // One badge per type: the column stores them comma-separated and rendered as
  // a single badge reading "Vendor,Competitor".
  eq('several types render as several badges',
    /typeBadges\s*\?\? \(shown\.related_company_type \? \[shown\.related_company_type\] : \[\]\)/.test(card), true);

  // What does NOT move: the row belongs to the page it was logged on.
  eq('the thread and the Update button stay account-side',
    /statuses \?\? shown\.updates/.test(card) || /title \?\? shown\.updates/.test(card), false);
  eq('  and the four other render sites pass none of the three',
    [
      'components/VendorRelationshipsSection.tsx',
      'components/pre-conference/RelationshipsTab.tsx',
      'components/relationship-map/MapCanvas.tsx',
      'components/RelationshipMapModal.tsx',
    ].some(f => /typeBadges=|statuses=\{/.test(strip(f))), false);
  // Two lines rather than an ellipsis where a caller supplied the name: at four
  // columns the longest real names do not fit on one.
  eq('an overridden heading wraps rather than truncating',
    /title \? 'text-xs line-clamp-2 leading-snug' : 'text-sm truncate'/.test(card), true);

  // The badge row pages instead of wrapping, but only where the grid asked.
  eq('the badge row pages only when signal pills are passed',
    /titleBadges\s*\?\s*<ScrollRow/.test(card), true);
  eq('  and still wraps everywhere it already did',
    /: <div className="flex items-center gap-1\.5 mt-1 flex-wrap">/.test(card), true);
  eq('  with a fade at the cut-off edge',
    /fade && canRight/.test(scroll) && /fade && canLeft/.test(scroll), true);
  // Both edges. One mask left pointer-transparent and the other not is a card
  // that toggles on one side of its own pill row and not the other.
  eq('  that does not eat the click it is fading, at either edge',
    (scroll.match(/pointer-events-none absolute/g) || []).length, 2);
  eq('  and the paging arrows do not collapse the card under them',
    (scroll.match(/e\.stopPropagation\(\); scroll\(/g) || []).length, 2);
  eq('  fade is opt-in, so existing rows are unchanged',
    /fade = false,/.test(scroll), true);

  // ── The signal badges, and the legend that explains them ──
  //
  // Two letters in a circle beside the company name. A 232px column has no room
  // for three worded pills beside the name, and the signals are the reason the
  // card is on screen, so they sit where the eye lands first.
  eq('the badges sit beside the name, not in the row below',
    /\{titleBadges && \(\s*\n\s*<span className="flex items-center gap-1 flex-shrink-0">/.test(card), true);
  eq('  above the status and type row',
    card.indexOf('titleBadges && (') < card.indexOf('badgeRow('), true);
  eq('  rendered as two letters',
    /\{SIGNAL_ABBREVIATIONS\[signal\]\}\s*\n\s*<\/span>/.test(grid), true);
  // A tooltip repeating the two letters already on screen helps nobody.
  eq('  with the full name on hover',
    /title=\{SIGNAL_FULL_LABELS\[signal\]\}/.test(grid), true);
  eq('  in a circle at 9px',
    /rounded-full text-\[9px\] font-bold/.test(grid), true);
  eq('the abbreviations are EA, RC and IR',
    [SIGNAL_ABBREVIATIONS.evaluatingAlternatives, SIGNAL_ABBREVIATIONS.recentChange,
      SIGNAL_ABBREVIATIONS.internalRelationship], ['EA', 'RC', 'IR']);
  // The legend is where a reader meeting "EA" goes to find out what it means,
  // so it draws the same mark and spells the name out.
  eq('the legend draws the badge, not a swatch of its colour',
    /<SignalBadge signal=\{key\} \/>/.test(modal), true);
  eq('  with no coloured dot left behind',
    /w-2 h-2 rounded-full[\s\S]{0,80}SIGNAL_TONE\[key\]/.test(modal), false);
  eq('  and the names spelled out',
    [SIGNAL_FULL_LABELS.evaluatingAlternatives, SIGNAL_FULL_LABELS.internalRelationship],
    ['Evaluating Alternatives', 'Internal Relationship']);
  eq('  read from the full map, not the abbreviations',
    /\{SIGNAL_FULL_LABELS\[key\]\}/.test(modal)
      && /SIGNAL_ABBREVIATIONS/.test(modal) === false, true);
  eq('  where the rail counts them in the plural',
    SIGNAL_LABELS.internalRelationship, 'Internal Relationships');
  // One badge component, so the card and the legend cannot drift apart.
  eq('the card and the legend share one badge',
    /export function SignalBadge/.test(grid)
      && /CompetitiveGrid'/.test(modal) && /SignalBadge/.test(modal), true);

  // Sized for a 232px column, and only there.
  eq('the grid card\u2019s name is a size down',
    /title \? 'text-xs line-clamp-2 leading-snug' : 'text-sm truncate'/.test(card), true);
  eq('  and its status and type pills too',
    /const badgeSize = compact \? 'text-\[10px\]' : 'text-xs';/.test(card), true);
  eq('  keyed off the same prop as every other compact choice',
    /const compact = titleBadges != null;/.test(card), true);
  eq('  passed rather than appended, so two font sizes never land on one element',
    /getBadgeClass\(t, colorMaps\.company_type \|\| \{\}, badgeSize\)/.test(card)
      && /sizeClass=\{badgeSize\}/.test(card), true);
  eq('  and getBadgeClass defaults to what every other surface already had',
    /sizeClass = 'text-xs',/.test(strip('lib/colors.ts')), true);

  // ── Highlighting, not lines ──
  //
  // A connector line appeared under the cursor and vanished with it, which is
  // not something a reader can follow, and it crossed the cards it was joining
  // on the way. Nothing is drawn now: the cards in play are painted in their
  // signal's colour and everything else recedes, which says the same thing
  // where the reader is already looking.
  eq('the grid draws no lines at all',
    /<svg|<line|<marker|markerStart|strokeDasharray/.test(grid), false);
  eq('  and keeps nothing that measured them',
    /getBoundingClientRect|ResizeObserver|headerRefs|CONNECTOR_GAP/.test(grid), false);
  eq('  nor the pairs and switches that fed them',
    /pairs: AlternativePair|switches: SwitchPair/.test(grid), false);
  // The signal is already on the cell; a second copy of the pairing in the
  // view would be a second answer to the same question.
  eq('  reading the signal off the cell instead',
    /CONNECTOR_SIGNALS\.find\(k => cell\.signals\[k\]\) \?\? null/.test(grid), true);

  eq('the checkbox lights every connected card at once',
    /if \(!highlightConnected\) return null;/.test(grid), true);
  eq('  in that signal\u2019s own colour',
    /return sig \? SIGNAL_TONE\[sig\] : null;/.test(grid), true);
  eq('  and greys every card that carries none',
    /anyHighlight && litWith\(cell\) === null \? 'opacity-30' : ''/.test(grid), true);
  // Hovering asks a narrower question — what is THIS account weighing — and
  // leaving the broad highlight on underneath would make it unanswerable.
  eq('hovering narrows it to one account',
    /if \(hovered\) return isLit\(cell, hovered\) \? SIGNAL_TONE\[hovered\.signal\] : null;/.test(grid), true);
  eq('  lighting every cell that carries the signal for it',
    /cell\.companyId === hovered\.companyId\s*\n?\s*&& cell\.signals\[hovered\.signal\]/.test(grid), true);
  // Only a card that carries one starts a hover: any other card of the same
  // account would light two cells elsewhere and dim the one being pointed at.
  eq('only a card carrying a connector signal starts a hover',
    /const sig = connectorSignalOf\(cell\);\s*\n\s*if \(sig\) setHovered/.test(grid), true);
  // One card can be weighing alternatives AND have switched, and it has one
  // border.
  eq('a card carrying both takes the first of them',
    (grid.match(/CONNECTOR_SIGNALS: SignalKey\[\] = \['evaluatingAlternatives', 'switched'\]/g) || []).length, 1);
  eq('  and the card paints what it is handed',
    /borderColor: highlight, backgroundColor: `\$\{highlight\}14`/.test(card), true);

  // ── A card's name opens that company ──
  //
  // A button only where somebody can act on it, so a card on a surface with
  // nowhere to open still reads as a heading rather than a control that does
  // nothing.
  eq('the heading is a button only when there is somewhere to open',
    /onOpenTitleCompany && headingCompanyId \? \(/.test(card), true);
  // The header around it toggles the card. A name that both opened a record
  // and collapsed what you were reading would be two answers to one click.
  eq('  and does not also collapse the card',
    /e\.stopPropagation\(\);\s*\n\s*onOpenTitleCompany\(/.test(card), true);
  // Defaults to the other end, which is what the heading says everywhere but
  // the grid. A name that opens somebody else's record is worse than one that
  // opens nothing.
  eq('  naming the company the heading names',
    /const headingCompanyId = titleCompanyId \?\? shown\.related_company_id;/.test(card), true);
  eq('  which the grid overrides with the account',
    /titleCompanyId=\{cell\.companyId\}/.test(grid), true);
  // It portals to the body, so without a higher layer it opens behind the
  // thing that opened it.
  eq('the record opens over the modal, not behind it',
    /zClass="z-\[250\]"/.test(modal)
      && /zClass = 'z-50'/.test(strip('components/QuickViewDrawer.tsx')), true);
  eq('  over it rather than instead of it',
    /\{quickView && \(/.test(modal) && /setQuickView\(null\)/.test(modal), true);
  eq('the Recent Change cells sort by recency',
    /key\.startsWith\('recentChange:'\)\s*\?\s*list\.slice\(\)\.sort\(byRecency\)/.test(grid), true);
  eq('  and the others alphabetically, so nothing is arbitrary',
    /nameOf\(a\.companyId\)\.localeCompare\(nameOf\(b\.companyId\)\)/.test(grid), true);
  eq('  using the tested comparator rather than an inline one',
    /byRecency/.test(grid) && /statusChangedAt/.test(grid) === false, true);

  // The rail's filters are alternatives, not conditions.
  eq('picking two signals means either, not both',
    /Array\.from\(activeSignals\)\.some\(k => c\.signals\[k\]\)/.test(grid), true);
  eq('  and picking none filters nothing',
    /activeSignals\.size > 0 &&/.test(grid), true);
  eq('signals only drops the cards carrying none',
    /signalsOnly && !hasAnySignal\(c\)/.test(grid), true);
  eq('a hidden competitor takes its whole column',
    /!visibleIds\.has\(c\.competitorId\)/.test(grid)
      && /const shownCompetitors = useMemo/.test(modal), true);

  // Nothing is deduplicated by company: one account under two competitors IS
  // the signal, and collapsing it would delete the thing the grid is for.
  // One account under two competitors IS the signal, so nothing here may
  // collapse on company. The static check is a tripwire; the fixture proves it
  // — company 3 appears in all three rows across three columns.
  eq('nothing in the grid collapses cells on company',
    /dedupe|distinctBy|new Set\(shown\.map\(c => c\.companyId\)\)/.test(grid), false);
  eq('  and the cells are grouped by row AND column, not by account',
    /const key = `\$\{c\.row\}:\$\{c\.competitorId\}`;/.test(grid), true);

  // ── The grid refreshes from its OWN payload after an update ──
  //
  // Every cell's ROW, every signal and every connector comes from the map
  // payload. Refreshing the spoke list instead left the card's own pill correct
  // — it keeps an optimistic copy of what it just wrote — and the grid around it
  // describing the state the modal opened with: the right status in the wrong
  // row, which is indistinguishable from a classification bug.
  eq('the map payload is a callback, so a change can re-run it',
    /const loadMap = useCallback\(\(silent = false\) => \{/.test(modal), true);
  eq('  the grid refreshes from it, not from the spoke list',
    /onUpdated=\{\(\) => \{ void loadMap\(true\); \}\}/.test(modal), true);
  // Both Map surfaces — the mobile card list and the desktop canvas. One of
  // them losing its refresh looks exactly like the bug this fixes.
  eq('  the Map view still refreshes its spokes, on both its surfaces',
    (modal.match(/loadRels\(hubNode\.id\)/g) || []).length, 2);
  // And the map payload with them. Updating in Map view and then flipping to
  // Competitive was looking at the state the modal opened with — the same bug,
  // one route further along, reachable without leaving the modal.
  eq('  and the map payload too, so flipping to Competitive is not stale',
    (modal.match(/onUpdated=\{\(\) => \{ loadRels\(hubNode\.id\); void loadMap\(true\); \}\}/g) || []).length, 2);
  eq('  every card in the modal refreshes the payload the grid reads',
    (modal.match(/void loadMap\(true\)/g) || []).length, 3);
  // A refetch that unmounts the grid collapses every open card and throws away
  // the scroll position of somebody mid-read.
  eq('  silently, so the grid is not unmounted under the reader',
    /if \(!silent\) setLoading\(true\);/.test(modal)
      && /if \(!silent\) setLoading\(false\)/.test(modal), true);
  eq('  and the first load is not silent',
    /useEffect\(\(\) => \{ void loadMap\(\); \}, \[loadMap\]\);/.test(modal), true);

  // ── The rail folds away ──
  eq('the rail collapses to a strip, like the attendee column opposite it',
    /style=\{\{ width: railOpen \? RAIL_WIDTH : RAIL_FOLDED \}\}/.test(modal), true);
  eq('  reporting its state', /aria-expanded=\{railOpen\}/.test(modal), true);
  eq('  naming what it holds, which differs by view',
    /view === 'competitive' \? 'Collapse signals' : 'Collapse the company list'/.test(modal), true);
  // Kept mounted: a search typed into the picker and a set of signal filters
  // both have to survive folding it away.
  eq('  and stays mounted while folded',
    /flex-1 min-h-0 flex \$\{railOpen \? '' : 'invisible'\}/.test(modal), true);
  eq('  on both views, not just one',
    /\{view === 'competitive' \? \(\s*\n\s*<CompetitiveRail[\s\S]{0,900}<EntityPicker/.test(modal), true);

  // ── The view slides in from the side it sits on ──
  //
  // Competition is to the right of Map on the toggle, so it enters from the
  // right and Map from the left. The direction is read off the view itself;
  // remembering the previous one would be a second source of truth for
  // something the toggle already says.
  eq('the canvas is keyed on the view, so the animation restarts',
    /key=\{view\}/.test(modal), true);
  eq('  entering from the side the view sits on',
    /view === 'competitive' \? 'view-enter-right' : 'view-enter-left'/.test(modal), true);
  const cssText = readFileSync('app/globals.css', 'utf8');
  eq('  with both keyframes defined',
    /@keyframes viewEnterFromRight/.test(cssText) && /@keyframes viewEnterFromLeft/.test(cssText), true);
  eq('  travelling opposite ways',
    /viewEnterFromRight \{\s*from \{ transform: translateX\(6%\)/.test(cssText)
      && /viewEnterFromLeft \{\s*from \{ transform: translateX\(-6%\)/.test(cssText), true);
  // Somebody who asked their machine to stop moving things asked for this too.
  eq('  and stopped for anyone who asked for less motion',
    /prefers-reduced-motion: reduce\)[\s\S]{0,120}view-enter-right,[\s\S]{0,60}animation: none/.test(cssText), true);
  // Sliding content would otherwise escape the modal's rounded corners.
  eq('  clipped by the row it slides inside',
    /hidden sm:flex gap-3 p-3 overflow-hidden/.test(modal), true);

  // ── Both switches on one row ──
  //
  // Neither is a filter — they govern what the whole grid does — so a
  // checkbox on its own line below read as one more of the three beneath it.
  const railSrc = strip('components/relationship-map/CompetitiveRail.tsx');
  const switchRow = railSrc.slice(
    railSrc.indexOf('flex flex-wrap items-center gap-x-4 gap-y-2'),
    railSrc.indexOf('scrollbar-desktop-thin'),
  );
  eq('both switches share one row',
    /checked=\{signalsOnly\}/.test(switchRow) && /checked=\{highlightConnected\}/.test(switchRow), true);
  eq('  neither left on a line of its own',
    (railSrc.match(/<label className="flex items-center gap-1\.5/g) || []).length, 0);
  // Wraps rather than truncating: a tenant with longer words should lose a
  // line, not a label.
  eq('  and the row wraps', /flex-wrap/.test(switchRow), true);

  // ── The column heading says what the competitor IS ──
  //
  // The cards under it carry the ACCOUNT's type, so the column never said its
  // own — and "Competitor" is worth reading exactly once, on the heading.
  eq('the column heading carries the competitor\u2019s type',
    /c\.types\.slice\(0, 1\)\.map\(t => \(/.test(grid), true);
  eq('  at badge size, beside the name',
    /getBadgeClass\(t, colorMaps\.company_type \|\| \{\}, 'text-\[10px\]'\)/.test(grid), true);
  eq('  with the name a size up from the cards',
    /text-sm font-bold text-brand-primary font-serif truncate/.test(grid), true);
  eq('  fed from the resolver rather than looked up again',
    /types: companies\.get\(id\)\?\.types \?\? \[\]/.test(strip('lib/competitiveResolution.ts')), true);

  // A resolved relationship with no card is a scoping bug, not a gap.
  eq('a missing card says so rather than leaving a hole',
    /card unavailable/.test(grid), true);

  // ── The expanded body is capped in a grid cell and nowhere else ──
  //
  // One open card grew its band from 108px to 410px against real content. The
  // cap is the alternative to a detail rail, which would have cost the column
  // width the grid exists for.
  eq('the cap is one number, in one place',
    (grid.match(/GRID_BODY_MAX_HEIGHT = 240/g) || []).length, 1);
  eq('  and 240 appears nowhere else',
    (grid.match(/\b240\b/g) || []).length + (card.match(/\b240\b/g) || []).length, 1);
  eq('  the grid passes it to the card',
    /bodyMaxHeight=\{GRID_BODY_MAX_HEIGHT\}/.test(grid), true);
  eq('  the card applies it as a max height, not a fixed one',
    /style=\{bodyMaxHeight \? \{ maxHeight: bodyMaxHeight \} : undefined\}/.test(card), true);
  eq('  with a scroll rather than a clip',
    /bodyMaxHeight \? ' overflow-y-auto scrollbar-thin' : ''/.test(card), true);
  // scrollbar-desktop-thin hides the bar below 1024px and this view renders
  // from 640px up, so a capped body would clip silently in that band.
  eq('  and a scrollbar that is visible at every width this view renders at',
    /scrollbar-desktop-thin/.test(card), false);
  // The four surfaces that were here first get no cap, no inner scroll and no
  // new overflow context.
  eq('no other render site passes a cap',
    [
      'components/VendorRelationshipsSection.tsx',
      'components/pre-conference/RelationshipsTab.tsx',
      'components/relationship-map/MapCanvas.tsx',
      'components/RelationshipMapModal.tsx',
    ].some(f => /bodyMaxHeight/.test(strip(f))), false);
  eq('  so an unset cap leaves the body exactly as it was',
    /className=\{`border-t border-gray-100 px-3 py-2\.5 space-y-2\$\{/.test(card), true);
  // Connectors anchor on the header. If the header sat inside the scrolling
  // region they would drift as somebody read a thread.
  eq('the header is outside the capped region',
    card.indexOf('data-card-header') < card.indexOf('bodyMaxHeight ? \' overflow-y-auto'), true);
  eq('  and the cap is inside the expanded branch only',
    /\{expanded && \([\s\S]{0,600}bodyMaxHeight/.test(card), true);

  // ── The status pill stays ──
  //
  // The ROW TITLE carries the class, the PILL carries the status. Under one
  // "Use Competitor" heading a card can read Current Vendor or Preferred
  // Partner — same class, different facts — and the pill is the only place that
  // distinction survives. Written down so reading the row labels does not make
  // dropping it look free.
  eq('the grid card still renders its status pills',
    /\{shownStatuses\.map\(s => \(\s*\n\s*<StatusPill key=\{s\}/.test(card), true);
  eq('  and the grid does not suppress them',
    /StatusPill|relationship_status/.test(grid), false);
  // Two statuses that share a class, so the row title cannot tell them apart.
  {
    const seeded = strip('lib/db-migrations.ts');
    const sameClass = /value IN \('Current Vendor', 'Preferred Partner'\)/.test(seeded);
    eq('  because two statuses share the Use Competitor class', sameClass, true);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
