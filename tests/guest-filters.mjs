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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
