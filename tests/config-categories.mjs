/**
 * Several config lists in one request.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/config-categories.mjs
 *
 * The conference page needed six config lists and made six round trips to one
 * table, inside a fourteen-way Promise.all on mount. That volume is what gets
 * a client challenged by the host's bot protection on a quick run of
 * navigations, so /api/config now answers for several categories at once.
 *
 * The route is RUN — real handler, real SQLite, real rows — because the only
 * thing worth proving is that one request returns exactly what the six
 * returned. A test that read the SQL back would pass whatever it said.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

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

const require_ = createRequire(process.cwd() + '/package.json');
const { createClient } = require_('@libsql/client');

const dir = mkdtempSync(join(tmpdir(), 'config-'));
const url = `file:${join(dir, 'config.db')}`;
const db = createClient({ url });

await db.execute(`CREATE TABLE config_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, value TEXT, sort_order INTEGER,
  color TEXT, action_key TEXT, status_key TEXT, scope TEXT, auto_follow_up INTEGER,
  is_system INTEGER, is_primary INTEGER, category_id INTEGER, description TEXT,
  metadata TEXT, inverse_value TEXT)`);
await db.execute(`CREATE TABLE config_option_visibility (
  option_id INTEGER, form_key TEXT, visible INTEGER)`);

const seed = async (category, value, sort) => {
  const r = await db.execute({
    sql: 'INSERT INTO config_options (category, value, sort_order) VALUES (?, ?, ?) RETURNING id',
    args: [category, value, sort],
  });
  return Number(r.rows[0].id);
};

await seed('action', 'Held', 1);
await seed('action', 'No Show', 2);
await seed('user', 'Kevin Winn', 1);
await seed('event_type', 'Reception', 1);
await seed('company_type', 'Operator', 1);
await seed('company_type', 'Capital', 2);
await seed('seniority', 'C-Suite', 1);
const hiddenId = await seed('conference_strategy_type', 'Retired Play', 9);
await seed('conference_strategy_type', 'Booth', 1);
// One option switched off for this form, so the filter has something to do.
await db.execute({
  sql: 'INSERT INTO config_option_visibility (option_id, form_key, visible) VALUES (?, ?, 0)',
  args: [hiddenId, 'conference_detail'],
});

const run = (query) => {
  const out = execFileSync(process.execPath, [
    '--experimental-strip-types',
    '--import', './tests/register-route-stubs.mjs',
    'tests/stubs/config-probe.mjs',
  ], { env: { ...process.env, STUB_DB_URL: url, STUB_QUERY: query }, encoding: 'utf8' });
  const line = out.split('\n').find(l => l.startsWith('RESULT '));
  return JSON.parse(line.slice('RESULT '.length));
};

const CATEGORIES = ['action', 'user', 'event_type', 'company_type', 'seniority', 'conference_strategy_type'];
const names = (rows, category) => rows.filter(r => r.category === category).map(r => r.value);

console.log('\n— one request answers for all six —');
{
  const many = run(`?categories=${CATEGORIES.join(',')}&form=conference_detail`);
  eq('it returns', many.status, 200);

  /*
   * The whole point, stated as an equality: for every category, what the one
   * request gives back is exactly what its own request gave back.
   */
  for (const c of CATEGORIES) {
    const one = run(`?category=${c}&form=conference_detail`);
    eq(`${c} matches its own request`, names(many.rows, c), one.rows.map(r => r.value));
  }

  // Each row says which list it belongs to, which is what lets the caller
  // split one payload back into six.
  eq('every row carries its category', many.rows.every(r => typeof r.category === 'string'), true);
  eq('  and nothing else came along',
    Array.from(new Set(many.rows.map(r => r.category))).sort(), [...CATEGORIES].sort());
}

console.log('\n— and the form filter still applies —');
{
  const withForm = run(`?categories=conference_strategy_type&form=conference_detail`);
  const without = run(`?categories=conference_strategy_type`);
  // Switched off for this form, so it must not come back with it.
  eq('an option hidden on this form is left out', names(withForm.rows, 'conference_strategy_type'), ['Booth']);
  eq('  but is there without the form',
    names(without.rows, 'conference_strategy_type').sort(), ['Booth', 'Retired Play']);
}

console.log('\n— ordering and edges —');
{
  const many = run(`?categories=company_type,action`);
  // sort_order within a category, as the single-category read has always done.
  eq('rows keep their sort order', names(many.rows, 'company_type'), ['Operator', 'Capital']);
  // Asking for one category this way is the same as asking for it the old way.
  eq('one category, the new way', names(run('?categories=action').rows, 'action'), ['Held', 'No Show']);
  eq('a category nobody has is empty, not an error', run('?categories=nope').rows, []);
  // An empty parameter must not become "every category": that would quietly
  // ship the whole table to a caller that asked for nothing, which is what a
  // caller does when it builds the list from a variable and it comes out empty.
  eq('an empty categories= is nothing, not everything', run('?categories=').rows, []);
  // Absent is still the documented "all options" read the colour maps use.
  eq('  while no parameter at all is still everything', run('').rows.length, 9);
}

console.log('\n— every read brings the whole row —');
{
  /*
   * inverse_value was once written by the POST and never selected back, so
   * every reader saw undefined. The three reads now share one column list;
   * this checks the column actually arrives by each route in, rather than
   * that the list mentions it.
   */
  await db.execute({
    sql: `INSERT INTO config_options (category, value, sort_order, inverse_value)
          VALUES ('other_relationship_status', 'Current Vendor', 1, 'Current Customer')`,
    args: [],
  });
  const counterpart = (rows) =>
    (rows.find(r => r.value === 'Current Vendor') ?? {}).inverse_value ?? null;

  eq('one category', counterpart(run('?category=other_relationship_status').rows), 'Current Customer');
  eq('  several categories', counterpart(run('?categories=other_relationship_status,action').rows), 'Current Customer');
  eq('  and all of them', counterpart(run('').rows), 'Current Customer');
}

console.log('\n— and the page asks for them together —');
{
  const page = strip('app/conferences/[id]/page.tsx');
  eq('the six are declared as one list', /const CONFIG_CATEGORIES = \[/.test(page), true);
  eq('  and fetched in one request',
    /fetch\(`\/api\/config\?categories=\$\{CONFIG_CATEGORIES\.join\(','\)\}&form=conference_detail`\)/.test(page), true);
  // The six that were there before are gone, as is the pair the classify
  // modal used. A lone call for one list is left alone — there is nothing to
  // batch it with, and rewriting it would be churn.
  for (const c of [...CATEGORIES, 'function']) {
    eq(`  no separate call for ${c}`, page.includes(`/api/config?category=${c}`), false);
  }
  eq('  and the classify modal asks for its two together',
    /fetch\('\/api\/config\?categories=function,seniority'\)/.test(page), true);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
