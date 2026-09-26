/**
 * Relationship statuses and their counterparts.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/relationship-status-options.mjs
 *
 * A status has a counterpart: the words for the same fact read from the other
 * company. Both halves are offered when logging a relationship, so a rep can
 * record it whichever way round they are thinking — and whichever half is
 * stored has to read correctly from the other end, which means the pairing has
 * to work backwards as well as forwards.
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

const { expandStatusOptions, buildCounterpartMap, counterpartError } =
  await import('@/lib/relationshipStatusOptions');
const { statusesFor } = await import('@/lib/relationshipDirection');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// What the migrations seed, once every status has its counterpart.
const SEEDED = [
  { id: 1, value: 'Current Vendor', inverse_value: 'Customer' },
  { id: 2, value: 'Evaluating', inverse_value: 'Prospect' },
  { id: 3, value: 'Former Vendor', inverse_value: 'Former Customer' },
  { id: 4, value: 'Preferred Partner', inverse_value: 'Preferred Partner' },
  { id: 5, value: 'Active Pilot', inverse_value: 'Piloting' },
  { id: 6, value: 'Other', inverse_value: 'Other' },
];

console.log('\n— both halves in the dropdown —');
{
  const opts = expandStatusOptions(SEEDED);
  const values = opts.map(o => o.value);
  eq('every configured status is offered',
    SEEDED.every(r => values.includes(r.value)), true);
  eq('  and so is every counterpart that differs',
    ['Customer', 'Prospect', 'Former Customer', 'Piloting'].every(v => values.includes(v)), true);
  // A Preferred Partner is one both ways round, so offering it twice would be
  // two identical rows in the list.
  eq('a status that is its own counterpart appears once',
    values.filter(v => v === 'Preferred Partner').length, 1);
  eq('  and the whole list has no duplicates',
    values.length, new Set(values.map(v => v.toLowerCase())).size);
  // Six configured statuses, four of which have a counterpart in different
  // words: Preferred Partner and Other are their own, so they appear once.
  eq('ten options from six statuses', values.length, 10);

  // Counterparts are not config rows. A negative id can never be mistaken for
  // one by anything downstream, and React only needs it to be stable.
  eq('configured statuses keep their own ids',
    opts.filter(o => o.id > 0).map(o => o.value), SEEDED.map(r => r.value));
  eq('  and counterparts are marked with negative ones',
    opts.filter(o => o.id < 0).map(o => o.value),
    ['Customer', 'Prospect', 'Former Customer', 'Piloting']);
  eq('  every id distinct', opts.length, new Set(opts.map(o => o.id)).size);

  // An account that has configured both halves as options of their own should
  // see each once, not once as a status and again as a counterpart.
  const both = expandStatusOptions([
    { id: 1, value: 'Current Vendor', inverse_value: 'Customer' },
    { id: 2, value: 'Customer', inverse_value: 'Current Vendor' },
  ]);
  eq('a counterpart already configured is not repeated',
    both.map(o => o.value), ['Current Vendor', 'Customer']);

  eq('nothing configured is nothing offered', expandStatusOptions([]), []);
  eq('  and a blank value is skipped',
    expandStatusOptions([{ id: 1, value: '  ', inverse_value: 'X' }]).map(o => o.value), ['X']);
  eq('  as is a missing counterpart',
    expandStatusOptions([{ id: 1, value: 'Solo', inverse_value: null }]).map(o => o.value), ['Solo']);
}

console.log('\n— reading a stored status from the other side —');
{
  const map = buildCounterpartMap(SEEDED);

  eq('a vendor reads as a customer', map['Current Vendor'], 'Customer');
  // The half that matters most: either side can now be the one stored, so the
  // pairing has to work backwards too.
  eq('  and a customer reads back as a vendor', map['Customer'], 'Current Vendor');
  eq('evaluating and prospect pair both ways',
    [map['Evaluating'], map['Prospect']], ['Prospect', 'Evaluating']);
  eq('former vendor and former customer too',
    [map['Former Vendor'], map['Former Customer']], ['Former Customer', 'Former Vendor']);

  // A symmetric status maps to itself in config; the map leaves it null so
  // "does this change when you turn it round" stays answerable.
  eq('a symmetric status has no other word', map['Preferred Partner'], null);
  // Active Pilot is NOT one of them. A preferred partner is a preferred partner
  // both ways round; a pilot has a side — the thing being piloted, and the
  // company running it.
  eq('  but an active pilot does', map['Active Pilot'], 'Piloting');
  eq('  and the pairing is followed backwards too', map['Piloting'], 'Active Pilot');

  // A configured option's own counterpart wins over one inferred from being
  // on the far side of somebody else's.
  // Order matters here. The configured row comes FIRST, so the inferred write
  // from the second row is the one that has to be refused — with them the
  // other way round the direct assignment wins anyway and the guard is never
  // exercised.
  const clash = buildCounterpartMap([
    { id: 1, value: 'Customer', inverse_value: 'Buys From Us' },
    { id: 2, value: 'Current Vendor', inverse_value: 'Customer' },
  ]);
  eq('a configured counterpart beats an inferred one', clash['Customer'], 'Buys From Us');
  eq('  and the other pairing is still recorded', clash['Current Vendor'], 'Customer');

  eq('an unknown status is not in the map', 'Reseller' in map, false);
  eq('nothing configured is an empty map', buildCounterpartMap([]), {});
}

console.log('\n— the round trip —');
{
  const map = buildCounterpartMap(SEEDED);
  // Whichever half a rep picked, the other company reads the other half.
  for (const [stored, expected] of [
    ['Current Vendor', 'Customer'],
    ['Customer', 'Current Vendor'],
    ['Evaluating', 'Prospect'],
    ['Prospect', 'Evaluating'],
    ['Former Vendor', 'Former Customer'],
    ['Former Customer', 'Former Vendor'],
  ]) {
    eq(`"${stored}" logged one side reads as "${expected}" on the other`,
      statusesFor([stored], 'inbound', map), [expected]);
  }
  // And symmetric ones survive the trip unchanged rather than emptying.
  eq('a symmetric status reads the same both ways',
    statusesFor(['Preferred Partner'], 'inbound', map), ['Preferred Partner']);
  // Twice round is back where it started, for every pair.
  for (const s of ['Current Vendor', 'Customer', 'Evaluating', 'Preferred Partner']) {
    const once = statusesFor([s], 'inbound', map);
    eq(`  "${s}" survives a round trip`, statusesFor(once, 'inbound', map), [s]);
  }
}

console.log('\n— a custom status needs its counterpart —');
{
  // Without one it cannot be read from the other company at all, which is the
  // whole reason the field exists.
  eq('a name and a counterpart is fine', counterpartError('Reseller', 'Supplies Us'), null);
  eq('no counterpart is refused', counterpartError('Reseller', '') !== null, true);
  eq('  and says what is wanted',
    /counterpart/.test(counterpartError('Reseller', '') ?? ''), true);
  eq('  whitespace does not count', counterpartError('Reseller', '   ') !== null, true);
  eq('no name is refused first', counterpartError('', 'Supplies Us'), 'Enter a name for the status.');
}

console.log('\n— seeded, and not editable —');
{
  const mig = readFileSync('lib/db-migrations.ts', 'utf8');
  for (const [value, counterpart] of [
    ['Current Vendor', 'Customer'],
    ['Former Vendor', 'Former Customer'],
    ['Evaluating', 'Prospect'],
  ]) {
    eq(`${value} is seeded with ${counterpart}`,
      new RegExp(`SET inverse_value = '${counterpart}'[\\s\\S]{0,140}value = '${value}'`).test(mig), true);
  }
  // The symmetric ones are their own counterpart, which is a value rather than
  // an absence now that it is a selectable option.
  eq('the symmetric statuses are their own counterpart',
    /SET inverse_value = value[\s\S]{0,180}'Preferred Partner', 'Active Pilot', 'Other'/.test(mig), true);
  // Neither backfill overwrites an account that already set its own.
  eq('  without overwriting anything already set',
    (mig.match(/AND inverse_value IS NULL/g) ?? []).length, 4);
  // Active Pilot was seeded into that list and corrected afterwards, because
  // the migrations are append-only and an earlier one is never edited.
  eq('a later migration corrects Active Pilot to Piloting',
    /SET inverse_value = 'Piloting'[\s\S]{0,200}value = 'Active Pilot'/.test(mig), true);
  eq('  guarded so an account that changed it keeps theirs',
    /inverse_value IS NULL OR inverse_value = 'Active Pilot'/.test(mig), true);
  eq('  and it comes after the pass that made it symmetric',
    mig.indexOf("'Preferred Partner', 'Active Pilot', 'Other'") < mig.indexOf("SET inverse_value = 'Piloting'"), true);
}

console.log('\n— one list, three forms —');
{
  // The company record's section, the bulk add and the update form each
  // fetched this list separately. A fourth copy was one form away.
  for (const f of [
    'components/VendorRelationshipsSection.tsx',
    'components/BulkVendorRelationshipModal.tsx',
    'components/RelationshipUpdateForm.tsx',
  ]) {
    const src = strip(f);
    eq(`${f} takes the shared list`, /useRelationshipStatusOptions\(\)/.test(src), true);
    eq('  and fetches it no longer',
      /category=other_relationship_status/.test(src), false);
  }
  const hook = strip('lib/useRelationshipStatusOptions.ts');
  eq('the hook offers both halves', /expandStatusOptions\(/.test(hook), true);
  eq('  and caches, since three forms ask', /let cache: StatusOption\[\] \| null = null;/.test(hook), true);

  // The server reads a stored status from the other side through the same
  // pairing, followed backwards.
  const thread = strip('lib/relationshipThread.ts');
  eq('the server map is built from the same pairing',
    /buildCounterpartMap\(/.test(thread), true);
  eq('  reading the id it needs', /SELECT id, value, inverse_value FROM config_options/.test(thread), true);
}

console.log('\n— the counterpart is required, and seeded ones are locked —');
{
  const post = strip('app/api/config/route.ts');
  const put = strip('app/api/config/[id]/route.ts');
  const admin = strip('app/admin/page.tsx');

  // The form is not the only way in.
  eq('creating a status without a counterpart is refused',
    /category === 'other_relationship_status' && !counterpart/.test(post), true);
  eq('  and it is stored', /inverse_value\) VALUES/.test(post), true);
  // A tenant whose table predates the column keeps the option rather than
  // losing the write.
  eq('  with a fallback for a tenant without the column',
    /\}\)\.catch\(\(\) => db\.execute\(\{/.test(post), true);

  // The pairing is what lets a relationship be read from either end; an
  // account renaming one half would leave rows pairing with nothing.
  eq('a seeded counterpart cannot be changed',
    /The counterpart on a system status cannot be changed/.test(put), true);
  eq('  and a custom one cannot be emptied',
    /if \(!counterpart\) \{/.test(put), true);

  eq('the admin panel asks for it only on relationship statuses',
    /const needsCounterpart = category === 'other_relationship_status';/.test(admin), true);
  eq('  showing it locked on a seeded status',
    /\{opt\.is_system \? \(/.test(admin) && /locked/.test(admin), true);
  eq('  required when adding one', /counterpartError\(trimmed, newCounterpart\)/.test(admin), true);
  eq('  and validated on save', /counterpartError\(editValue, editCounterpart\)/.test(admin), true);
  // Sending it unchanged on a seeded status would turn every save into a 403.
  eq('  sent only for a custom status',
    /needsCounterpart && !localOptions\.find\(o => o\.id === id\)\?\.is_system/.test(admin), true);
}

console.log('\n— the counterpart has to reach the browser —');
{
  const route = strip('app/api/config/route.ts');
  // It was written by the POST and the PUT and never selected back, so every
  // reader saw undefined: the dropdown that offers both halves only ever
  // offered one, and no counterpart could be paired with its own colour.
  eq('/api/config selects inverse_value',
    (route.match(/description, metadata, inverse_value FROM config_options/g) || []).length, 2);
  eq('  on the single-category read and the all-categories read',
    /WHERE category = \? ORDER BY[\s\S]{0,40}/.test(route)
      && route.split('inverse_value FROM config_options').length - 1, 2);
  eq('  and returns it',
    /inverse_value: r\.inverse_value \? String\(r\.inverse_value\) : null,/.test(route), true);
  // Without it the hook's map is empty and the feature is a no-op.
  eq('the status hook reads it',
    /inverse_value: r\.inverse_value \?\? null,/.test(strip('lib/useRelationshipStatusOptions.ts')), true);

  // A counterpart takes the colour of the half it pairs with: two colours for
  // one fact says it is two facts.
  const { buildColorMap } = await import('@/lib/colors');
  const map = buildColorMap([
    { value: 'Current Vendor', color: 'blue', inverse_value: 'Customer' },
    { value: 'Active Pilot', color: 'purple', inverse_value: 'Piloting' },
    { value: 'Preferred Partner', color: 'green', inverse_value: 'Preferred Partner' },
  ]);
  eq('a counterpart inherits its pair\u2019s colour',
    [map['Customer'], map['Piloting']], ['blue', 'purple']);
  eq('  the configured value keeps its own',
    [map['Current Vendor'], map['Active Pilot']], ['blue', 'purple']);
  eq('  and a symmetric one adds no second key',
    Object.keys(map).filter(k => k === 'Preferred Partner').length, 1);
  // A counterpart that is a configured option in its own right wins, the same
  // way buildCounterpartMap resolves it.
  const both = buildColorMap([
    { value: 'Current Vendor', color: 'blue', inverse_value: 'Customer' },
    { value: 'Customer', color: 'teal', inverse_value: 'Current Vendor' },
  ]);
  eq('  a configured counterpart keeps its own colour', both['Customer'], 'teal');
  // Every other category has no counterpart and must be untouched.
  const plain = buildColorMap([{ value: 'Operator', color: 'gray' }]);
  eq('  and a category without counterparts is unchanged',
    Object.keys(plain), ['Operator']);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
