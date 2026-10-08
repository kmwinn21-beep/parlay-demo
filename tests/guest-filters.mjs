/**
 * Filtering the guest pick-list down to somebody's accounts.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/guest-filters.mjs
 *
 * `companies.assigned_user` is a comma-separated list of config_options ids —
 * a company can be assigned to more than one rep — EXCEPT on rows written
 * before ids were stored, which hold plain names in the same shape.
 * resolveRepNames already degrades that way and so does this, because matching
 * only ids would show an empty list for an account whose assignment predates
 * the change, which reads as "you have no accounts" rather than as a lookup
 * that did not understand its own column.
 *
 * The other half is the empty case: no filter selected must mean NO FILTER, not
 * "every company", or an unticked button would look applied.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const { companiesAssignedTo, attendeesAtCompanies } = await import('@/lib/guestFilters');

const KEVIN = { id: 900, value: 'Kevin Winn' };
const SAM = { id: 901, value: 'Sam Reed' };
const DANA = { id: 902, value: 'Dana Fox' };

const COMPANIES = [
  { id: 1, assigned_user: '900' },                 // Kevin
  { id: 2, assigned_user: '901' },                 // Sam
  { id: 3, assigned_user: '900,901' },             // both
  { id: 4, assigned_user: null },                  // nobody
  { id: 5, assigned_user: '   ' },                 // nobody, messily
  { id: 6, assigned_user: 'Kevin Winn' },          // legacy: a name
  { id: 7, assigned_user: 'Dana Fox, Sam Reed' },  // legacy: names, spaced
  { id: 8, assigned_user: '902' },                 // Dana
];

const ids = (set) => Array.from(set).sort((a, b) => a - b);

console.log('\n— whose accounts are whose —');
{
  eq('one rep, by id', ids(companiesAssignedTo(COMPANIES, [KEVIN])), [1, 3, 6]);
  eq('  another', ids(companiesAssignedTo(COMPANIES, [SAM])), [2, 3, 7]);
  eq('two reps union, they do not intersect',
    ids(companiesAssignedTo(COMPANIES, [KEVIN, SAM])), [1, 2, 3, 6, 7]);
  eq('a shared company appears once, not twice',
    companiesAssignedTo(COMPANIES, [KEVIN, SAM]).size, 5);
}
{
  // The load-bearing empty case.
  eq('no reps means no companies, NOT every company',
    ids(companiesAssignedTo(COMPANIES, [])), []);
  eq('  and no companies means none either',
    ids(companiesAssignedTo([], [KEVIN])), []);
}
{
  eq('an unassigned company belongs to nobody',
    companiesAssignedTo(COMPANIES, [KEVIN, SAM, DANA]).has(4), false);
  eq('  including one assigned to whitespace',
    companiesAssignedTo(COMPANIES, [KEVIN, SAM, DANA]).has(5), false);
}

console.log('\n— rows written before ids —');
{
  // Company 6 is 'Kevin Winn', not '900'.
  eq('a legacy name matches its rep', companiesAssignedTo(COMPANIES, [KEVIN]).has(6), true);
  eq('  and is not handed to the wrong one', companiesAssignedTo(COMPANIES, [SAM]).has(6), false);
  eq('a spaced legacy list matches each name',
    ids(companiesAssignedTo(COMPANIES, [DANA])), [7, 8]);
}
{
  // Names are compared case-insensitively; ids never are.
  const shouty = [{ id: 10, assigned_user: 'KEVIN WINN' }];
  eq('a legacy name matches whatever its case',
    ids(companiesAssignedTo(shouty, [KEVIN])), [10]);
}
{
  // A rep with no name cannot match a legacy row by accident — an empty name
  // must not compare equal to an empty stored part.
  const nameless = { id: 903, value: '' };
  eq('a rep with no name matches nothing by name',
    ids(companiesAssignedTo([{ id: 11, assigned_user: 'Someone Else' }], [nameless])), []);
  eq('  but still matches by id',
    ids(companiesAssignedTo([{ id: 12, assigned_user: '903' }], [nameless])), [12]);
}

console.log('\n— narrowing the attendee list —');
{
  const ATTENDEES = [
    { id: 1, company_id: 1 },
    { id: 2, company_id: 2 },
    { id: 3, company_id: 3 },
    { id: 4, company_id: null },
    { id: 5 },
  ];
  const mine = companiesAssignedTo(COMPANIES, [KEVIN]);
  eq('only people at my accounts',
    attendeesAtCompanies(ATTENDEES, mine).map(a => a.id), [1, 3]);
  eq('somebody at no company is at nobody\'s account',
    attendeesAtCompanies(ATTENDEES, new Set([1, 2, 3])).map(a => a.id), [1, 2, 3]);
  eq('  and an empty company set keeps nobody',
    attendeesAtCompanies(ATTENDEES, new Set()).map(a => a.id), []);
}

console.log('\n— and the search can be emptied in one tap —');
{
  const { readFileSync } = await import('node:fs');
  const file = readFileSync('components/SocialEventsTable.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* The Build Guest List search only. Sliced FORWARD from its own placeholder
     and asserted non-empty, so it cannot pass by reading nothing. */
  const at = file.indexOf('placeholder="Search by name, company, or title..."');
  const field = file.slice(Math.max(0, at - 600), at + 900);
  eq('there is a search field to read', at !== -1 && field.length > 400, true);

  eq('it has a clear button', /aria-label="Clear search"/.test(field), true);
  eq('  which empties the box', /onClick=\{\(\) => setSearch\(''\)\}/.test(field), true);

  /*
   * Only while there is something to clear. A permanent X in an empty field is
   * a control that does nothing, and it is the first thing under the title.
   */
  eq('  and is absent while the box is empty', /\{search !== '' && \(/.test(field), true);

  /*
   * Inside the field, not beside it. pr-9 reserves the width the button
   * covers so a long query scrolls under it rather than beneath it.
   * Measured in Chromium at 390px: the button sits inside the input, 8px from
   * its right edge, vertically centred to within a pixel. Typing "Mike roach"
   * cut the list from 5 rows to 1; clearing put all 5 back.
   */
  eq('  it sits inside the box', /className="relative"/.test(field), true);
  eq('  with room reserved for it', /px-3 py-2 pr-9 text-sm/.test(field), true);
}

console.log('\n— and the drawer can narrow to my accounts —');
{
  const { readFileSync } = await import('node:fs');
  const file = readFileSync('components/SocialEventsTable.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* The drawer, not the picker: both have a My Accounts button now. Sliced
     FORWARD from the drawer's own function and asserted non-empty. */
  const at = file.indexOf('function GuestListSheet(');
  const sheet = file.slice(at, file.indexOf('function GuestListModal(', at));
  eq('there is a drawer to read', at !== -1 && sheet.length > 1000, true);

  eq('it has a My Accounts button', /My Accounts\s*\n?\s*<\/button>/.test(sheet), true);
  eq('  which says whether it is on', /aria-pressed=\{myAccountsOnly\}/.test(sheet), true);

  /*
   * Through the same two helpers the Build Guest List picker uses, so "my
   * accounts" means one thing on both surfaces rather than two implementations
   * that drift.
   */
  eq('  narrowing by the same rule as the picker',
    /attendeesAtCompanies\(invitedAttendees, companiesAssignedTo\(companies, \[me\]\)\)/.test(sheet), true);
  eq('  with the signed-in rep read the same way',
    /user\?\.configId != null/.test(sheet), true);

  /*
   * Disabled when the login has no rep profile. There is nothing to match on,
   * so filtering would empty the list and look broken. Measured in Chromium
   * with configId null: the button renders disabled.
   */
  eq('  and disabled when there is no rep profile', /disabled=\{!me\}/.test(sheet), true);

  /*
   * The counts follow the filter. A summary reading 49 INVITED over four rows
   * is worse than no summary. Measured at 390px with four guests, two of them
   * at the signed-in rep's accounts: off 4 rows / 4 INVITED, on 2 rows /
   * 2 INVITED, off again back to 4.
   */
  /* searchScoped is accountScoped with the search applied — the bar is handed
     whatever the list has been narrowed to, whichever control narrowed it. */
  eq('  the summary describes the filtered list',
    /invitedIds=\{searchScoped\.map\(a => a\.id\)\}[\s\S]{0,160}attendees=\{searchScoped\}/.test(sheet), true);
  eq('  the search starts from the account filter',
    /filterGuests\(accountScoped, search\)/.test(sheet), true);
  eq('  and the type chips narrow it further',
    /selectedTypes\.size > 0 \? searchScoped\.filter/.test(sheet), true);
}

console.log('\n— finding one person on a saved list —');
{
  const { filterGuests, matchesGuestQuery, guestQueryTerms } = await import('@/lib/guestSearch');
  const GUESTS = [
    { first_name: 'Adele', last_name: 'Acosta', title: 'VP of HR', company_name: 'Karlfurt Enterprises' },
    { first_name: 'Mike', last_name: 'Roach', title: 'Chief Strategy Officer', company_name: 'Lifespace Communities' },
    { first_name: 'Matt', last_name: 'Kinne', title: 'COO', company_name: 'Lifespark' },
    { first_name: 'Ruthie', last_name: 'Wallace', title: 'CEO', company_name: 'Bergnaum and Sons' },
  ];
  const names = q => filterGuests(GUESTS, q).map(g => g.last_name);

  eq('by name', names('acosta'), ['Acosta']);
  eq('  by company', names('bergnaum'), ['Wallace']);
  eq('  by title', names('coo'), ['Kinne']);

  // Substring, not prefix: a reader half-remembering a name types the middle
  // of it as often as the start.
  eq('part of a word matches', names('lifespa'), ['Roach', 'Kinne']);
  eq('  and case does not matter', names('ADELE'), ['Acosta']);

  /*
   * Each term has to match SOMETHING, but not all the same field — one
   * haystack per person. "acosta vp" is a name and a title, and a per-field
   * search would find nobody.
   */
  eq('terms can land in different fields', names('acosta vp'), ['Acosta']);
  eq('  and all of them must land somewhere', names('karlfurt ceo'), []);
  eq('  extra whitespace is not a term', names('  acosta   '), ['Acosta']);

  // An empty query is not a filter.
  eq('nothing typed keeps everyone', filterGuests(GUESTS, '').length, 4);
  eq('  as does whitespace alone', filterGuests(GUESTS, '   ').length, 4);
  eq('  which is what no terms means', guestQueryTerms('  '), []);

  // A guest missing a field is searched on the fields they have, not skipped.
  eq('a missing field is not a match failure',
    matchesGuestQuery({ first_name: 'Jo', last_name: null, title: null, company_name: 'Acme' },
      guestQueryTerms('jo acme')), true);
}

console.log('\n— the drawer wires it up —');
{
  const { readFileSync } = await import('node:fs');
  const file = readFileSync('components/SocialEventsTable.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const at = file.indexOf('function GuestListSheet(');
  const sheet = file.slice(at, file.indexOf('function GuestListModal(', at));
  eq('there is a drawer to read', at !== -1 && sheet.length > 1000, true);

  eq('the drawer has its own search', /placeholder="Search guests by name, company, or title\.\.\."/.test(sheet), true);
  eq('  below the filter chips',
    sheet.indexOf('<RSVPSummaryBar') < sheet.indexOf('Search guests by name'), true);
  eq('  with a clear button like the picker’s', /aria-label="Clear search"/.test(sheet), true);
  eq('  narrowing through the shared matcher', /filterGuests\(accountScoped, search\)/.test(sheet), true);
  /* And the counts follow it, as they follow My Accounts: a bar reading 7
     INVITED over one row would be describing a list that is not on screen. */
  eq('  and the counts describe what is shown',
    /invitedIds=\{searchScoped\.map\(a => a\.id\)\}[\s\S]{0,160}attendees=\{searchScoped\}/.test(sheet), true);

  /*
   * The chips run as ONE row that scrolls sideways. Five of them wrapped onto
   * a second line on a phone, and every line they take is a line of guest
   * list they cover. Measured at 390px: one row 30px tall, five chips,
   * scrollWidth past clientWidth, and the scrollbar hidden.
   */
  eq('the chips are one scrolling row',
    /flex items-center gap-1\.5 flex-nowrap overflow-x-auto scrollbar-hide/.test(file), true);
  eq('  only where they are stacked under the counts', /stackOperators\s*\n?\s*\? 'flex items-center/.test(file), true);
}

console.log('\n— a company opens beside the list, not instead of it —');
{
  const { readFileSync } = await import('node:fs');
  const file = readFileSync('components/SocialEventsTable.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const at = file.indexOf('function AttendeeRSVPCard(');
  const card = file.slice(at, file.indexOf('function ', at + 30));
  eq('there is a guest card to read', at !== -1 && card.length > 400, true);

  /*
   * Leaving the drawer for a full record meant losing the guest list, the
   * filters and the search, and coming back by the back button — to look at
   * who a company is. Measured: the quick view opens, nothing navigates, and
   * closing it leaves the search box still reading what was typed.
   */
  eq('the company name opens the quick view', /onQuickView\(\{ type: 'company'/.test(card), true);
  eq('  and the guest name opens one too', /onQuickView\(\{ type: 'attendee'/.test(card), true);
  eq('  neither is a link to a record any more',
    /href=\{`\/companies\/\$\{attendee\.company_id\}`\}/.test(card)
      || /href=\{`\/attendees\/\$\{attendee\.id\}`\}/.test(card), false);
  /* The card is itself clickable — it expands to the RSVP controls — so both
     names have to stop the click reaching it. Measured: opening either quick
     view leaves the card collapsed. */
  /* Asserted per handler, not as a count: the card has other stopPropagation
     calls — the avatar, the remove button — so a count passed even with one of
     these removed. The mutation that proved it. */
  eq('  without also toggling the card open',
    /e\.stopPropagation\(\);\s*\n\s*onQuickView\(\{ type: 'attendee'/.test(card), true);
  eq('    nor on the company either',
    /e\.stopPropagation\(\);\s*\n\s*onQuickView\(\{ type: 'company'/.test(card), true);
  // One callback for both, rather than a second one that could be wired to a
  // different layer or forgotten at the call site.
  eq('  through one callback', /onQuickView: \(target: QuickViewTarget\) => void;/.test(card), true);

  const at2 = file.indexOf('function GuestListSheet(');
  const sheet = file.slice(at2, file.indexOf('function GuestListModal(', at2));
  eq('the drawer renders the quick view', /<QuickViewDrawer target=\{quickView\}/.test(sheet), true);
  /* Above this drawer's own z-[60]. The quick view portals to the body, so
     without saying so it opens BEHIND the list that opened it. */
  eq('  on a layer above the guest list', /zClass="z-\[80\]"/.test(sheet), true);
  eq('  and the card is told how to open it', /onQuickView=\{setQuickView\}/.test(sheet), true);
}

console.log('\n— and it stops at the site header —');
{
  const { readFileSync } = await import('node:fs');
  const qv = readFileSync('components/QuickViewDrawer.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* sheet-below-header SPANS the space under the header; h-[90vh] capped at
     it, which only lands the top edge there when the content fills the cap.
     Measured at 390px with the header at 85px plus a 59px inset: the panel
     opens at 144 and runs to 844. */
  eq('the quick view spans the space below the header',
    /sheet-below-header/.test(qv), true);
  eq('  rather than a fraction of the viewport', /h-\[90vh\]/.test(qv), false);
  eq('  and keeps its full height on a pointer', /sm:h-full/.test(qv), true);
}

console.log('\n— and it opens beside the list, not on top of it —');
{
  const { readFileSync } = await import('node:fs');
  const file = readFileSync('components/SocialEventsTable.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const at = file.indexOf('function GuestListSheet(');
  const sheet = file.slice(at, file.indexOf('function GuestListModal(', at));
  const ref = readFileSync('components/CompanyAttendeesDrawer.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /*
   * The move CompanyAttendeesDrawer already makes when its activity timeline
   * opens: the first drawer crosses to the far left, the record takes the
   * right. Measured at 1440x900 — guest list 940-1440 alone, 0-500 with a
   * record open at 960-1440, and back to 940-1440 when the record closes.
   */
  eq('the drawer slides when a record opens',
    /style=\{\{ right: quickView \? 'calc\(100% - 500px\)' : 0 \}\}/.test(sheet), true);
  // Anchored by `right` in BOTH states, so the move is one animatable value
  // rather than a jump between two anchors. Same rule the reference follows.
  eq('  anchored by right either way', /sm:absolute sm:inset-y-0/.test(sheet), true);
  eq('  with the same 300ms ease-out', /sm:transition-\[right\] sm:duration-300 sm:ease-out/.test(sheet), true);
  eq('  which is what the drawer it copies uses',
    /sm:transition-\[right\] sm:duration-300 sm:ease-out/.test(ref), true);

  // The rounded corners follow it across: the drawer is on the screen's left
  // edge now, so the radius belongs on its right.
  eq('  and its corners move with it', /sm:rounded-tr-2xl sm:rounded-br-2xl/.test(sheet), true);

  /*
   * No room for both on a phone, so the list steps aside — the same thing the
   * reference does. Measured at 390px: the guest list goes display:none and
   * the record runs full width from the header to the bottom.
   */
  eq('on a phone the list gives way', /hidden sm:flex sm:rounded-tr-2xl/.test(sheet), true);
  eq('  as it does in the drawer this copies', /hidden sm:flex sm:rounded-tr-2xl/.test(ref), true);

  /*
   * One backdrop, not two. The record is docked, so it paints none of its own:
   * a second would dim the guest list, which is the thing the reader is meant
   * to still be looking at. Measured: one backdrop in every state.
   */
  const qv = readFileSync('components/QuickViewDrawer.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('the record is docked', /docked \/>/.test(sheet), true);
  eq('  so it paints no backdrop of its own', /\{!docked && <div className="absolute inset-0 bg-black\/40"/.test(qv), true);
  eq('  and lets clicks past to the one underneath',
    /docked \? 'pointer-events-none' : ''/.test(qv), true);
  eq('  except on its own panel', /docked \? 'pointer-events-auto' : ''/.test(qv), true);
  // Undocked callers are untouched: the quick view opens over the page with
  // its own backdrop everywhere else it is used.
  eq('  while an undocked one still has one', /docked = false/.test(qv), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
