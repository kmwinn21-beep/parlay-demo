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
  eq('  labelled Map and Competitive',
    /\{v === 'map' \? 'Map' : 'Competitive'\}/.test(modal), true);
  eq('  and it matches the scope toggle, not a new pattern',
    /\(\['map', 'competitive'\] as const\)\.map/.test(modal)
      && /view === v \? 'bg-brand-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'/.test(modal), true);
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
    /view === 'competitive' \? \([\s\S]{0,400}\) : loading \? \(/.test(desktopBlock), true);
  eq('  and the legend explains whichever canvas drew',
    /view === 'competitive' \? \(\s*\(Object\.keys\(SIGNAL_PILL_LABELS\)/.test(desktopBlock), true);
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

  // Show connectors is per-opening. Nothing outlives the modal.
  eq('show connectors starts off',
    /const \[showConnectors, setShowConnectors\] = useState\(false\)/.test(modal), true);
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
  eq('signals only shares the heading row',
    /font-serif">Signals<\/p>[\s\S]{0,400}checked=\{signalsOnly\}/.test(rail), true);
  eq('  show connectors sits below it',
    rail.indexOf('checked={signalsOnly}') < rail.indexOf('checked={showConnectors}'), true);
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
  eq('  and the signal colours are shared, not copied',
    /SIGNAL_TONE\[key\]/.test(desktopBlock)
      && /export const SIGNAL_TONE/.test(strip('lib/competitiveSignals.ts')), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
