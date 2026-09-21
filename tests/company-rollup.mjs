/**
 * The Company Rollup tab in the post-conference review.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/company-rollup.mjs
 *
 * Two kinds of claim are checked here and they are not the same kind.
 *
 * The filtering and sorting are BEHAVIOUR — the predicates are reproduced from
 * the component and run against rows, so a rename that silently changes what a
 * button does is caught by what it returns rather than by what it is called.
 * The one that matters most: "Open Follow-Ups" used to be "No follow-up" and
 * selected companies with ZERO follow-ups. Under the new name that is backwards
 * — the two sets barely overlap — so the predicate moved with the label and the
 * test below is what says which one shipped.
 *
 * The layout is STRUCTURE, read off the source, because a class that is not
 * there cannot be measured in a browser either. The geometry it implies — an
 * expanded card not stretching its neighbour — is measured separately in
 * Chromium; the note on that assertion records what came back.
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

const { companiesAssignedTo } = await import('@/lib/guestFilters');

const tab = readFileSync('components/post-conference/CompanyRollupTab.tsx', 'utf8');
// Against the code, never the prose about it: several assertions below name
// the very thing they are asserting is gone.
const code = tab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// A company with every field the predicates read.
const co = (over) => ({
  company_id: 1, company_name: 'A', assigned_user: null,
  icp: null, meetings_held: 0, touchpoints: 0, notes_logged: 0,
  follow_ups_created: 0, follow_ups_completed: 0,
  health_delta: 0, units: null, target_tier: null,
  ...over,
});

console.log('\n— Open Follow-Ups means open, not absent —');
{
  // Reproduced from the component. If the shipped predicate drifts from this,
  // the structural assertion below is what catches it.
  const openFollowUp = row => row.follow_ups_created > row.follow_ups_completed;

  const none = co({ follow_ups_created: 0, follow_ups_completed: 0 });
  const open = co({ follow_ups_created: 3, follow_ups_completed: 1 });
  const allDone = co({ follow_ups_created: 2, follow_ups_completed: 2 });

  eq('a company with follow-ups still outstanding is included', openFollowUp(open), true);
  eq('  one with none created is NOT — that was the old "No follow-up"',
    openFollowUp(none), false);
  eq('  and one where every follow-up is done is not open',
    openFollowUp(allDone), false);
  // The two readings pick out different companies, which is the whole point.
  const rows = [none, open, allDone];
  eq('the rename changed the set, it did not just change the word',
    [rows.filter(openFollowUp).length, rows.filter(r => r.follow_ups_created === 0).length],
    [1, 1]);
  eq('  and they are not the same company',
    rows.filter(openFollowUp)[0] === rows.filter(r => r.follow_ups_created === 0)[0], false);

  eq('the shipped predicate is the open one', /follow_ups_created > row\.follow_ups_completed/.test(code), true);
  // Scoped to the follow-up branch: `follow_ups_created === 0` is still a
  // legitimate part of the "No activity" predicate, which asks a different
  // question. What must be gone is a FOLLOW-UP filter that tests for zero.
  eq('  and no follow-up filter tests for zero any more',
    /filter === 'no_followup'/.test(code), false);
  eq('  nor does the open branch', /'open_followup'\) return row\.follow_ups_created === 0/.test(code), false);
  eq('the button says so', /key: 'open_followup', label: 'Open Follow-Ups'/.test(code), true);
}

console.log('\n— My Accounts, and the rep dropdown beside it —');
{
  const rows = [
    co({ company_id: 1, assigned_user: '900' }),
    co({ company_id: 2, assigned_user: '901' }),
    co({ company_id: 3, assigned_user: '900,901' }),
    co({ company_id: 4, assigned_user: null }),
    co({ company_id: 5, assigned_user: 'Kevin Winn' }), // written before ids
  ];
  const asAssignable = rows.map(r => ({ id: r.company_id, assigned_user: r.assigned_user }));
  const me = [{ id: 900, value: 'Kevin Winn' }];

  const mine = companiesAssignedTo(asAssignable, me);
  eq('my accounts are mine, by id and by legacy name',
    [...mine].sort((a, b) => a - b), [1, 3, 5]);
  eq('  and somebody else\'s are not', mine.has(2), false);

  const sam = companiesAssignedTo(asAssignable, [{ id: 901, value: 'Sam Reed' }]);
  eq('picking a rep in the dropdown narrows to theirs',
    [...sam].sort((a, b) => a - b), [2, 3]);

  // Picking nobody must not mean picking everybody.
  eq('an empty selection is not a filter',
    /if \(selectedRepIds\.length === 0\) return null/.test(code), true);
  eq('  and the two stack rather than replace each other',
    /if \(selectedRepCompanyIds && !selectedRepCompanyIds\.has\(row\.company_id\)\) return false;/.test(code), true);

  eq('the button sits between All companies and ICP only',
    /\{ key: 'all'[^}]*\},\s*\{ key: 'mine', label: 'My Accounts' \},\s*\{ key: 'icp'/.test(code), true);
  eq('the dropdown is populated from the admin user list, not this conference',
    /options=\{userOptions\}/.test(code) && /useUserOptions\(\)/.test(code), true);
  eq('  and it is the shared multi-select, not a new one',
    /import \{ RepMultiSelect \} from '@\/components\/RepMultiSelect'/.test(code), true);
}

console.log('\n— the grid leads with relationship health —');
{
  const rows = [
    co({ company_id: 1, company_name: 'Flat', health_delta: 0, units: 900 }),
    co({ company_id: 2, company_name: 'Moved', health_delta: 22, units: null }),
    co({ company_id: 3, company_name: 'Slipped', health_delta: -4, units: 10 }),
  ];
  const byHealth = [...rows].sort((a, b) => b.health_delta - a.health_delta);
  eq('companies that moved during the conference come first',
    byHealth.map(r => r.company_name), ['Moved', 'Flat', 'Slipped']);
  // Pipeline would have led with the biggest account regardless of activity —
  // which is what the default used to do.
  eq('  which is not the order pipeline would have given',
    byHealth[0].company_name === 'Flat', false);

  eq('the default sort is health delta', /useState<SortKey>\('health_delta'\)/.test(code), true);
  eq('  and its option reads Relationship Health',
    /<option value="health_delta">Relationship Health<\/option>/.test(code), true);
  eq('  with nothing still calling it Health delta', /Health delta/.test(code), false);
  eq('  and it is offered first', code.indexOf('health_delta">Relationship') < code.indexOf('value="pipeline"'), true);
}

console.log('\n— two columns, and a card that opens alone —');
{
  eq('one column on a phone, two from lg',
    /grid grid-cols-1 lg:grid-cols-2 gap-3 items-start/.test(code), true);
  // Measured in Chromium against the compiled stylesheet: at 1280px the grid
  // lays out in 2 columns of 618px and at 390px in 1 of 358px. Opening a card
  // takes it from 115px to 431px while the card beside it stays at 115px, and
  // every other card drops to opacity 0.4 while the opened one stays at 1.
  eq('  with items-start, so an open card does not stretch its neighbour',
    /items-start/.test(code), true);

  eq('expansion is owned above the cards, so they know about each other',
    /const \[expandedId, setExpandedId\] = useState<number \| null>\(null\)/.test(code), true);
  eq('  a card no longer keeps its own open state',
    /const \[open, setOpen\] = useState\(false\)/.test(code), false);
  eq('  opening one closes the one that was open',
    /setExpandedId\(id => id === row\.company_id \? null : row\.company_id\)/.test(code), true);
  eq('the others step back while it is open',
    /dimmed=\{expandedId != null && expandedId !== row\.company_id\}/.test(code), true);
  eq('  by fading, not by vanishing', /dimmed \? 'opacity-40' : ''/.test(code), true);
  // Filtering away the open card must not leave it expanded behind the change.
  eq('a card filtered out of the grid does not stay open',
    /if \(expandedId != null && !filtered\.some\(r => r\.company_id === expandedId\)\) setExpandedId\(null\)/.test(code), true);
}

console.log('\n— the header carries the pills on its own row —');
{
  eq('the header stacks into rows', /className="w-full px-4 py-3 flex flex-col gap-3/.test(code), true);
  eq('  with the pills left-aligned below the name',
    /<div className="flex flex-wrap items-start gap-x-5 gap-y-2">/.test(code), true);
  eq('  and nothing pushing them to the right edge any more',
    /flex items-center gap-2 flex-shrink-0 flex-wrap justify-end/.test(code), false);

  // Every relocated pill gets a label saying what it is.
  const eyebrows = [...code.matchAll(/<PillGroup label="([^"]+)"/g)].map(m => m[1]);
  eq('each group of pills says what it is', eyebrows, ['Health', 'Target tier', 'ICP', 'Activity']);
  eq('  and the eyebrow is one line above, not repeated per pill',
    (code.match(/PillGroup label="Health"/g) ?? []).length, 1);
  // The bar and the delta are one reading, so they share the single eyebrow.
  eq('the bar and the +pts pill live under the Health eyebrow together',
    /<PillGroup label="Health">\s*<HealthBar score=\{row\.health_score\} \/>\s*<DeltaChip delta=\{row\.health_delta\} \/>\s*<\/PillGroup>/.test(code), true);

  eq('the assigned rep sits on the name row', /<AssignedRep names=\{row\.assigned_user_names\} \/>/.test(code), true);
  eq('  to the left of the chevron',
    code.indexOf('<AssignedRep') < code.indexOf('rotate-180'), true);
  eq('  with a user icon beside the name', /<svg[^>]*>[\s\S]{0,200}M16 7a4 4 0 11-8 0 4 4 0 018 0z/.test(code), true);
}

console.log('\n— follow-up rate is gone from the card —');
{
  eq('the activity grid is four across, not five', /grid grid-cols-4 gap-2/.test(code), true);
  // The tile, not the words: "Follow-up rate (worst first)" is still a sort
  // option and should be, so a bare text match would fail on the wrong thing.
  eq('  with no Follow-up rate tile',
    /text-center leading-tight">Follow-up rate/.test(code), false);
  eq('  and the sort by it is still offered',
    /<option value="fu_rate">Follow-up rate \(worst first\)<\/option>/.test(code), true);
  eq('  and no bar beside a rep', /FuRateDisplay/.test(code), false);
  // The sort still ranks by it, so the maths has to stay.
  eq('the rate itself is still computed for the sort that uses it',
    /function fuRatePct/.test(code) && /sort === 'fu_rate'/.test(code), true);
}

console.log('\n— the data the card needs actually arrives —');
{
  const route = readFileSync('app/api/conferences/[id]/post-conference/route.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const shared = readFileSync('components/PostConferenceReview.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  eq('the row type carries the raw column', /assigned_user: string \| null;/.test(shared), true);
  eq('  and the resolved names', /assigned_user_names: string\[\];/.test(shared), true);
  eq('the route sends the raw column, for id matching',
    /assigned_user: contacts\[0\]\.company_assigned_user,/.test(route), true);
  eq('  and the names, for showing',
    /assigned_user_names: contacts\[0\]\.assigned_user_names,/.test(route), true);
  eq('  carried through from the query that already selected it',
    /company_assigned_user: a\.company_assigned_user \? String\(a\.company_assigned_user\) : null,/.test(route), true);
}

console.log('\n— Action Items is gone —');
{
  const pcr = readFileSync('components/PostConferenceReview.tsx', 'utf8');
  const sections = readFileSync('lib/useSectionConfig.ts', 'utf8');
  eq('the tab is not in the order', /action_items/.test(pcr), false);
  eq('  nor in the configurable section list', /action_items/.test(sections), false);
  eq('  and its component is not imported', /ActionItemsTab/.test(pcr), false);
  let present = true;
  try { readFileSync('components/post-conference/ActionItemsTab.tsx'); } catch { present = false; }
  eq('  the component file is gone rather than orphaned', present, false);
  eq('the tabs that remain are unchanged',
    /const TAB_ORDER = \['summary', 'company_rollup', 'contacts', 'meetings', 'follow_ups', 'relationship_shifts', 'events_touchpoints'\];/.test(pcr), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
