/**
 * Catching a vendor switch at the moment somebody records it.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/vendor-switch.mjs
 *
 * The rules are small and every one of them decides whether a rep is
 * interrupted. Prompting when nothing happened trains people to click through
 * the prompt, including the times it mattered; not prompting when something did
 * loses the only moment anybody knew. Both failures are invisible afterwards,
 * so they are all checked here.
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

const {
  findIncumbents, isDeparture, isArrival, endsOf, drawsConnector,
  switchNote, departureEntry, arrivalEntry, SWITCH_ANSWERS,
} = await import('@/lib/vendorSwitch');
const { buildStatusIndex, makeIsCompetitor } = await import('@/lib/competitiveResolution');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const SEEDED = [
  { value: 'Current Vendor', inverseValue: 'Customer', actionKey: 'current' },
  { value: 'Evaluating', inverseValue: 'Prospect', actionKey: 'evaluating' },
  { value: 'Former Vendor', inverseValue: 'Former Customer', actionKey: 'former' },
  { value: 'Preferred Partner', inverseValue: 'Preferred Partner', actionKey: 'current' },
  { value: 'Active Pilot', inverseValue: 'Piloting', actionKey: 'evaluating' },
  { value: 'Other', inverseValue: 'Other', actionKey: null },
];
const IX = buildStatusIndex(SEEDED);

// 100/101 = accounts, 200/201/202 = competitors, 300 = not a competitor.
const co = (id, name, types) => [id, { id, name, types }];
const COMPANIES = new Map([
  co(100, 'Mission Health', ['Operator']),
  co(101, 'Lakeside Senior', ['Operator']),
  co(200, 'Teton Systems', ['Competitor']),
  co(201, 'Vireo Software', ['Vendor', 'Competitor']),
  co(202, 'Halden Care', ['Competitor']),
  co(300, 'Northwind Capital', ['Capital']),
]);
const isCompetitor = makeIsCompetitor(COMPANIES, ['Competitor']);
const row = (id, companyId, relatedCompanyId, statuses) =>
  ({ id, companyId, relatedCompanyId, statuses });
const incumbents = (opts) => findIncumbents({
  index: IX, isCompetitor, ...opts,
}).map(i => [i.relationshipId, i.competitorId]);

console.log('\n— an arrival finds who is already there —');
{
  eq('a competitor already current is an incumbent',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(1, 100, 200, ['Current Vendor'])],
    }), [[1, 200]]);

  // The incumbent's row can be stored from either side. Matching only rows
  // where company_id is the account would miss every one logged on the
  // competitor's page, which is half of them.
  eq('  including one logged from the competitor’s side',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(2, 200, 100, ['Customer'])],
    }), [[2, 200]]);

  // Matched on the class. An incumbent recorded as Preferred Partner is
  // exactly the one being displaced, and the literal words would never find it.
  eq('  and one recorded as Preferred Partner',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(3, 100, 200, ['Preferred Partner'])],
    }), [[3, 200]]);

  eq('nothing current means nothing to ask about',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(4, 100, 200, ['Evaluating']), row(5, 100, 202, ['Former Vendor'])],
    }), []);
  eq('  a status nobody classified is not an incumbent',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(6, 100, 200, ['Other'])],
    }), []);
  eq('  nor a current relationship with a non-competitor',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(7, 100, 300, ['Current Vendor'])],
    }), []);
  eq('  nor another account’s',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(8, 101, 200, ['Current Vendor'])],
    }), []);

  // A company cannot displace itself, however the row that says it is current
  // was stored.
  eq('the incoming company is never its own incumbent',
    incumbents({
      accountId: 100, incomingCompanyId: 200,
      rows: [row(9, 100, 200, ['Current Vendor'])],
    }), []);
  // The rows are read as they were stored, so the one being saved still shows
  // its OLD company and status. The edit form can change both at once, and
  // without the exclusion that stale row becomes an incumbent of itself.
  eq('  and the row being saved does not find itself',
    incumbents({
      accountId: 100, incomingCompanyId: 201, excludeRelationshipId: 10,
      rows: [row(10, 100, 202, ['Current Vendor'])],
    }), []);
  eq('  which it would without the exclusion',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(10, 100, 202, ['Current Vendor'])],
    }), [[10, 202]]);

  // Several is a real answer. Picking one of three for the rep would be wrong
  // twice.
  eq('several incumbents all come back',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(11, 100, 200, ['Current Vendor']), row(12, 100, 202, ['Preferred Partner'])],
    }), [[11, 200], [12, 202]]);
  // A pair logged from both ends is two rows and one relationship. Asking
  // twice about one company reads as the prompt being broken.
  eq('  but one entry per competitor, however many rows say so',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(13, 100, 200, ['Current Vendor']), row(14, 200, 100, ['Customer'])],
    }), [[13, 200]]);
}

console.log('\n— which end is the vendor —');
{
  eq('the status names the related end',
    endsOf(row(1, 100, 200, ['Current Vendor']), IX, isCompetitor),
    { competitorId: 200, accountId: 100 });
  eq('  or the logging end, when it is the counterpart',
    endsOf(row(2, 200, 100, ['Customer']), IX, isCompetitor),
    { competitorId: 200, accountId: 100 });
  eq('a symmetric status falls through to the types',
    endsOf(row(3, 100, 200, ['Preferred Partner']), IX, isCompetitor),
    { competitorId: 200, accountId: 100 });
  eq('  and reversed, the competitor is still the competitor',
    endsOf(row(4, 200, 100, ['Preferred Partner']), IX, isCompetitor),
    { competitorId: 200, accountId: 100 });
  // Never flipped to fit: reading it backwards would invent a purchase running
  // the other way.
  eq('a status naming a non-competitor end is not this workflow’s',
    endsOf(row(5, 100, 200, ['Customer']), IX, isCompetitor), null);
  eq('  and neither end a competitor is nobody’s',
    endsOf(row(6, 100, 300, ['Current Vendor']), IX, isCompetitor), null);
}

console.log('\n— what counts as an arrival and a departure —');
{
  eq('becoming current is an arrival',
    isArrival(['Evaluating'], ['Current Vendor'], IX), true);
  eq('  from nothing too', isArrival([], ['Current Vendor'], IX), true);
  eq('  and from former', isArrival(['Former Vendor'], ['Current Vendor'], IX), true);
  // Already current: nothing arrived, so nobody is being displaced.
  eq('staying current is not an arrival',
    isArrival(['Current Vendor'], ['Preferred Partner'], IX), false);
  eq('  nor is becoming evaluating',
    isArrival(['Current Vendor'], ['Evaluating'], IX), false);

  eq('current to former is a departure',
    isDeparture(['Current Vendor'], ['Former Vendor'], IX), true);
  eq('  in the counterpart wording too',
    isDeparture(['Customer'], ['Former Customer'], IX), true);
  eq('  and from Preferred Partner, which is the same class',
    isDeparture(['Preferred Partner'], ['Former Vendor'], IX), true);
  // A dead evaluation displaced nobody. Asking who replaced them would collect
  // an answer to a question that was not asked.
  eq('evaluating to former is NOT a departure',
    isDeparture(['Evaluating'], ['Former Vendor'], IX), false);
  eq('  nor is an unclassified status going former',
    isDeparture(['Other'], ['Former Vendor'], IX), false);
  eq('  nor current to evaluating',
    isDeparture(['Current Vendor'], ['Evaluating'], IX), false);
  eq('  nor no change at all',
    isDeparture(['Current Vendor'], ['Current Vendor'], IX), false);
}

console.log('\n— the answers —');
{
  eq('four of them', SWITCH_ANSWERS, ['replacing', 'keeping', 'unknown', 'none']);
  // Only one means a vendor was displaced by another.
  eq('only replacing draws a connector', drawsConnector('replacing'), true);
  eq('  keeping does not', drawsConnector('keeping'), false);
  eq('  nor unknown', drawsConnector('unknown'), false);
  eq('  nor none', drawsConnector('none'), false);
  eq('  nor anything unrecognised', drawsConnector('replaced'), false);
  // Keeping and unknown are stored rather than discarded: a question answered
  // should not be asked again as though it never had, and "both, in parallel"
  // is its own competitive picture.
  const raw = readFileSync('lib/vendorSwitch.ts', 'utf8');
  eq('the module says why the other three are kept',
    /in parallel/.test(raw) && /asked again/.test(raw), true);
}

console.log('\n— what the workflow writes —');
{
  const on = new Date(2026, 2, 14);
  eq('the note names both ends and the date',
    switchNote('Red Moon', 'Nova Moon', on),
    'Switched from Red Moon to Nova Moon on 03/14/2026');
  eq('  zero-padded, so it sorts and reads the same every time',
    switchNote('A', 'B', new Date(2026, 0, 5)), 'Switched from A to B on 01/05/2026');

  // Every auto-change leaves a thread entry. Without one somebody opens a card
  // they did not touch and finds a status that moved with no author.
  eq('the departure entry says who replaced them',
    departureEntry('Nova Moon'), 'Marked former — replaced by Nova Moon on this account.');
  eq('  and says so plainly when nobody did',
    departureEntry(null), 'Marked former — no replacement recorded.');
  eq('the arrival entry names who was replaced',
    arrivalEntry('Red Moon'), 'Marked current — replacing Red Moon on this account.');

  // The note is not where the switch is recorded. A sentence in a free-text
  // field stops being a link the moment somebody edits it.
  const lib = strip('lib/vendorSwitch.ts');
  eq('the module says the note is not the record',
    /NOT where the switch is recorded/.test(readFileSync('lib/vendorSwitch.ts', 'utf8')), true);
}

console.log('\n— one set of rules, shared with the grid —');
{
  const lib = strip('lib/vendorSwitch.ts');
  const res = strip('lib/competitiveResolution.ts');
  // What counts as current, which end is the vendor and who is a competitor are
  // the same questions the grid asks. Two answers would be two answers.
  eq('the class comes from the shared resolver',
    /classOfStatuses/.test(lib) && /export function classOfStatuses/.test(res), true);
  eq('  so does the vendor end',
    /vendorEndOfStatuses/.test(lib) && /export function vendorEndOfStatuses/.test(res), true);
  eq('  and the competitor test',
    /export function makeIsCompetitor/.test(res), true);
  eq('the resolver uses them itself, rather than keeping a second copy',
    /const end = vendorEndOfStatuses\(row\.statuses, index\);/.test(res)
      && /const statusClass = classOfStatuses\(row\.statuses, index\);/.test(res), true);
  eq('  and its competitor test is the shared one',
    /const isCompetitor = makeIsCompetitor\(companies, competitorTypes\);/.test(res), true);
  // Rules only: no queries, no React, so every case above is testable without
  // a database or a browser.
  eq('the module runs no queries',
    /db\.execute|getDb|fetch\(/.test(lib), false);
  eq('  and renders nothing', /from 'react'|<\/|=> \(</.test(lib), false);
}

console.log('\n— the record the answer lands in —');
{
  const mig = strip('lib/db-migrations.ts');
  eq('there is a table for it',
    /CREATE TABLE IF NOT EXISTS vendor_switches/.test(mig), true);
  eq('  holding the account, both companies and the answer',
    ['account_company_id', 'incumbent_company_id', 'incoming_company_id', 'answer']
      .every(c => new RegExp(`${c} `).test(mig)), true);
  eq('  and both relationships, so a connector needs no lookup',
    /incumbent_relationship_id INTEGER/.test(mig)
      && /incoming_relationship_id INTEGER/.test(mig), true);
  eq('  attributed, like every other thing a person recorded',
    /recorded_by_user_id INTEGER/.test(mig), true);
  eq('  and dated', /created_at TEXT DEFAULT \(datetime\('now'\)\)/.test(mig), true);
  // A relationship can be deleted and what happened still happened, so the
  // company columns carry the answer on their own.
  eq('the incoming company is nullable, because nobody is an answer',
    /incoming_company_id INTEGER,/.test(mig), true);
  eq('  and the account and incumbent are not',
    /account_company_id INTEGER NOT NULL/.test(mig)
      && /incumbent_company_id INTEGER NOT NULL/.test(mig), true);
  eq('indexed by account, and by the pair for "did we already ask?"',
    /idx_vendor_switches_account/.test(mig) && /idx_vendor_switches_pair/.test(mig), true);
}

console.log('\n— what an answer actually does, against a database —');
{
  // The writes are the part regexes cannot check. A record that is not written,
  // a status moved in the wrong wording, a thread entry missing from a card
  // nobody opened — each one is invisible afterwards and each one is the whole
  // point of the feature.
  const { createRequire } = await import('node:module');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createClient } = createRequire(`${process.cwd()}/package.json`)('@libsql/client');
  const { applySwitch, loadSwitchContext } = await import('@/lib/vendorSwitchServer');

  const dir = mkdtempSync(join(tmpdir(), 'switch-'));
  const db = createClient({ url: `file:${join(dir, 'x.db')}` });
  const ex = (sql, args = []) => db.execute({ sql, args });

  await ex(`CREATE TABLE config_options (id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT, value TEXT, inverse_value TEXT, action_key TEXT)`);
  await ex(`CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT, company_type TEXT)`);
  await ex(`CREATE TABLE vendor_relationships (id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER, related_company_id INTEGER, rep_id INTEGER,
    relationship_status TEXT, strength TEXT, vendor_type TEXT, notes TEXT,
    updated_at TEXT, status_changed_at TEXT)`);
  await ex(`CREATE TABLE relationship_updates (id INTEGER PRIMARY KEY AUTOINCREMENT,
    relationship_id INTEGER, body TEXT, status_before TEXT, status_after TEXT,
    marked_stale INTEGER DEFAULT 0, author_user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')))`);
  await ex(`CREATE TABLE vendor_switches (id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_company_id INTEGER NOT NULL, incumbent_company_id INTEGER NOT NULL,
    incumbent_relationship_id INTEGER, incoming_company_id INTEGER,
    incoming_relationship_id INTEGER, answer TEXT NOT NULL,
    recorded_by_user_id INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
  for (const r of SEEDED) {
    await ex('INSERT INTO config_options (category, value, inverse_value, action_key) VALUES (?,?,?,?)',
      ['other_relationship_status', r.value, r.inverseValue, r.actionKey]);
  }
  await ex('INSERT INTO config_options (category, value, action_key) VALUES (?,?,?)',
    ['company_type', 'Competitor', 'competitor']);
  await ex(`INSERT INTO companies (id,name,company_type) VALUES
    (1,'Mission Health','Operator'),(20,'Red Moon','Competitor'),
    (21,'Nova Moon','Vendor'),(22,'Halden Care','Competitor')`);
  const ctx = await loadSwitchContext(db);
  const rows = async (sql) => (await ex(sql)).rows;

  // ── keeping: recorded, nothing moved ──
  await ex(`INSERT INTO vendor_relationships (id,company_id,related_company_id,relationship_status,vendor_type,notes)
            VALUES (1,1,20,'Current Vendor','EHR','x'),(2,1,21,'Current Vendor','EHR','y')`);
  await applySwitch(db, 9, {
    accountId: 1, incumbentCompanyId: 20, incumbentRelationshipId: 1,
    incomingCompanyId: 21, incomingRelationshipId: 2, answer: 'keeping',
  }, ctx);
  eq('keeping is recorded',
    (await rows('SELECT answer FROM vendor_switches')).map(r => r.answer), ['keeping']);
  eq('  and moves no status',
    (await rows('SELECT relationship_status FROM vendor_relationships ORDER BY id'))
      .map(r => r.relationship_status), ['Current Vendor', 'Current Vendor']);
  eq('  and writes no thread entry', (await rows('SELECT id FROM relationship_updates')).length, 0);
  eq('  attributed to the session user',
    (await rows('SELECT recorded_by_user_id FROM vendor_switches'))[0]?.recorded_by_user_id, 9);

  // ── unknown: recorded too ──
  await applySwitch(db, 9, {
    accountId: 1, incumbentCompanyId: 22, answer: 'unknown',
  }, ctx);
  eq('unknown is recorded as well',
    (await rows('SELECT answer FROM vendor_switches ORDER BY id')).map(r => r.answer),
    ['keeping', 'unknown']);

  // ── replacing: the incumbent moves, with an entry, and the type is added ──
  await ex('DELETE FROM vendor_switches');
  const res = await applySwitch(db, 9, {
    accountId: 1, incumbentCompanyId: 20, incumbentRelationshipId: 1,
    incomingCompanyId: 21, incomingRelationshipId: 2, answer: 'replacing',
    markCompetitor: true,
  }, ctx);
  eq('replacing moves the incumbent to former',
    ((await rows('SELECT relationship_status FROM vendor_relationships WHERE id = 1'))[0] ?? {})
      .relationship_status, 'Former Vendor');
  eq('  leaving a thread entry saying why',
    (await rows('SELECT body, status_before, status_after FROM relationship_updates')).map(r =>
      [r.body, r.status_before, r.status_after]),
    [['Marked former — replaced by Nova Moon on this account.', 'Current Vendor', 'Former Vendor']]);
  eq('  and stamping when the status changed',
    ((await rows('SELECT status_changed_at FROM vendor_relationships WHERE id = 1'))[0] ?? {})
      .status_changed_at != null, true);
  eq('  the incoming company gains the competitor type, keeping what it had',
    (await rows('SELECT company_type FROM companies WHERE id = 21'))[0]?.company_type,
    'Vendor,Competitor');
  eq('  and it is reported as changed', res.markedCompetitor, true);
  eq('  the record names both relationships',
    (await rows('SELECT incumbent_relationship_id, incoming_relationship_id FROM vendor_switches'))
      .map(r => [r.incumbent_relationship_id, r.incoming_relationship_id]), [[1, 2]]);

  // ── a relationship that does not exist yet is created ──
  await ex('DELETE FROM vendor_switches'); await ex('DELETE FROM relationship_updates');
  await ex('DELETE FROM vendor_relationships');
  // Logged on the COMPETITOR's page, so the wording has to be the counterpart.
  await ex(`INSERT INTO vendor_relationships (id,company_id,related_company_id,relationship_status,vendor_type,notes)
            VALUES (10,22,1,'Customer','EHR,Billing','z')`);
  const created = await applySwitch(db, 9, {
    accountId: 1, incumbentCompanyId: 22, incumbentRelationshipId: 10,
    incomingCompanyId: 21, answer: 'replacing', vendorType: ['EHR', 'Billing'],
  }, ctx);
  eq('the outgoing row keeps its own side\u2019s wording',
    ((await rows('SELECT relationship_status FROM vendor_relationships WHERE id = 10'))[0] ?? {})
      .relationship_status, 'Former Customer');
  eq('a relationship is created for the new vendor',
    created.createdRelationshipId != null, true);
  const made = (await rows('SELECT company_id, related_company_id, relationship_status, strength, vendor_type, notes FROM vendor_relationships WHERE id != 10'))[0] ?? {};
  eq('  on the account\u2019s side, as current',
    [made.company_id, made.related_company_id, made.relationship_status],
    [1, 21, 'Current Vendor']);
  eq('  with the vendor type carried over', made.vendor_type, 'EHR,Billing');
  eq('  strength left blank rather than guessed', made.strength, null);
  eq('  and the switch written into its notes',
    /^Switched from Halden Care to Nova Moon on \d{2}\/\d{2}\/\d{4}$/.test(String(made.notes)), true);
  eq('  the record points at the relationship it created',
    (await rows('SELECT incoming_relationship_id FROM vendor_switches'))[0]?.incoming_relationship_id,
    created.createdRelationshipId);

  // ── answering twice does not fill the thread with nothing ──
  const beforeEntries = (await rows('SELECT id FROM relationship_updates')).length;
  await applySwitch(db, 9, {
    accountId: 1, incumbentCompanyId: 22, incumbentRelationshipId: 10,
    incomingCompanyId: 21, answer: 'replacing',
  }, ctx);
  eq('a status already where it belongs writes no second entry',
    (await rows('SELECT id FROM relationship_updates')).length, beforeEntries);
  eq('  and an existing relationship is reused rather than duplicated',
    (await rows('SELECT id FROM vendor_relationships')).length, 2);

  await ex('DELETE FROM vendor_switches');
  rmSync(dir, { recursive: true, force: true });
}

console.log('\n— asked from all three doors, and only after the save —');
{
  const prompt = strip('components/VendorSwitchPrompt.tsx');
  const update = strip('components/RelationshipUpdateForm.tsx');
  const section = strip('components/VendorRelationshipsSection.tsx');
  const relRoute = strip('app/api/vendor-relationships/route.ts');
  const updRoute = strip('app/api/vendor-relationships/updates/route.ts');
  const server = strip('lib/vendorSwitchServer.ts');

  // Three forms can move a status. Every rule that has lived in three places
  // in this codebase has drifted, and here drifting means one entry path
  // recording no switches at all.
  eq('one prompt component, not three',
    /export function VendorSwitchPrompt/.test(prompt), true);
  eq('  the update form uses it', /<VendorSwitchPrompt/.test(update), true);
  eq('  and so does the add/edit form', /<VendorSwitchPrompt/.test(section), true);
  eq('one detector, not three',
    /export async function detectSwitchPrompt/.test(server), true);
  eq('  called from the create path', /relationshipId: id, before: \[\]/.test(relRoute), true);
  eq('  the edit path', /before: previousList/.test(relRoute), true);
  eq('  and the update path', /before: before \?/.test(updRoute), true);

  // Asked after the save. The relationship the rep came to record is already
  // written and is not held hostage to an answer about a different one.
  eq('the update form saves first, then asks',
    /onSaved\?\.\(data as SavedUpdate\);\s*\n\s*const prompt = \(data as SavedUpdate\)\.switch_prompt;/.test(update), true);
  eq('  and dismissing still closes the form',
    /onDone=\{\(\) => \{ setSwitchPrompt\(null\); onClose\(\); \}\}/.test(update), true);
  // A confirmation leaves the status alone and must not ask who replaced anyone.
  eq('a confirmation never asks', /const switch_prompt = changed/.test(updRoute), true);
  eq('  nor does an edit that left the status alone',
    /const switch_prompt = statusChanged/.test(relRoute), true);
  // Working out whether to ask must never fail a save that already happened.
  eq('detection failing cannot fail the save',
    (relRoute.match(/\.catch\(\(\) => null\)/g) || []).length >= 2
      && /\.catch\(\(\) => null\)/.test(updRoute), true);

  // The edit form now writes a thread entry when a status moves. It used to
  // record WHEN and never WHY.
  eq('the edit form writes a thread entry on a status change',
    /Status changed from the relationship form\./.test(relRoute), true);

  // Three answers on an arrival, four on a departure.
  eq('the arrival offers replacing, keeping and don\u2019t know',
    ["answer\\('replacing'\\)", "answer\\('keeping'\\)", "answer\\('unknown'\\)"]
      .every(re => new RegExp(re).test(prompt)), true);
  eq('  the departure offers nobody as well',
    /submit\('none'\)/.test(prompt) && /submit\('unknown'\)/.test(prompt), true);
  // Required would collect whatever was at the top of the list.
  eq('  and its picker is skippable',
    /disabled=\{saving \|\| !picked\}/.test(prompt), true);
  // One record per pair: two incumbents replaced at once is two facts, and
  // collapsing them leaves the grid unable to draw either line.
  eq('one record per incumbent, not one per prompt',
    /for \(const t of targets\)/.test(prompt), true);
  // Choosing for the rep on a multi-vendor account would be wrong more often
  // than right.
  eq('nothing is preselected when there is more than one incumbent',
    /prompt\.incumbents\.length === 1 \? \[prompt\.incumbents\[0\]\.id\] : \[\]/.test(prompt), true);

  // Company type drives more than this view, so it is offered rather than done.
  // Both prompts. One offering the choice and the other doing it silently is
  // the same bug with half the surface.
  eq('the competitor type is a checkbox, not a side effect',
    (prompt.match(/checked=\{markCompetitor\}/g) || []).length, 2);
  eq('  ticked by default, and only when it is not one already',
    /useState\(!prompt\.incomingIsCompetitor\)/.test(prompt)
      && /\{!prompt\.incomingIsCompetitor && \(/.test(prompt), true);
  eq('  and appended to the types it has, never replacing them',
    /\[\.\.\.raw, target\]\.join\(','\)/.test(server), true);
  // A guessed vendor type that is silent is a mislabelled vendor nobody
  // notices.
  eq('the created relationship\u2019s vendor type is shown and editable',
    /value=\{vendorType\.join\(', '\)\}/.test(prompt), true);
  // A guess there is a claim about a relationship that started five minutes
  // ago.
  eq('  and its strength is left blank rather than guessed',
    /VALUES \(\?, \?, \?, \?, NULL, \?, \?, datetime\('now'\)\)/.test(server), true);
}

console.log('\n— the writes an answer sets off —');
{
  const server = strip('lib/vendorSwitchServer.ts');
  const route = strip('app/api/vendor-relationships/switch/route.ts');

  // The record is written whatever the answer — that is the point of asking —
  // and only 'replacing' moves a status.
  eq('only replacing moves anything',
    /if \(input\.answer === 'replacing'\) \{/.test(server), true);
  eq('  the record is written either way',
    server.indexOf("if (input.answer === 'replacing')")
      < server.indexOf('INSERT INTO vendor_switches'), true);

  // Writing "Former Vendor" onto a row stored on the competitor's page would
  // say the ACCOUNT is the former vendor, silently reversing the ends.
  eq('a status is written in the wording its row uses',
    /const fromAccountSide = Number\(r\.company_id\) === accountId;/.test(server)
      && /statusValueFor\(ctx, target, fromAccountSide\)/.test(server), true);
  eq('  chosen by class, so a renamed status still works',
    /if \(cls !== target\) continue;/.test(server), true);
  eq('  in the spelling the option carries, not the lookup key',
    /ctx\.index\.original\.get\(value\) \?\? value/.test(server), true);

  // The rep did not open that card and will not remember touching it.
  eq('every auto-change leaves a thread entry',
    /INSERT INTO relationship_updates/.test(server), true);
  eq('  and its loss is logged, not swallowed',
    /console\.error\('vendor switch: thread entry failed'/.test(server), true);
  eq('  naming what happened',
    /departureEntry\(incomingName\)/.test(server) && /arrivalEntry\(incumbentName\)/.test(server), true);
  // Nothing moves when it is already there, so re-answering does not fill the
  // thread with entries saying nothing changed.
  eq('a status already where it belongs is left alone',
    /if \(!value \|\| before\.join\(\) === value\) return;/.test(server), true);

  // The switch has two ends and only one of them may exist.
  eq('a missing relationship is created rather than left out',
    /createRelationship\(db, ctx, \{/.test(server), true);
  eq('  on the account\u2019s side',
    /INSERT INTO vendor_relationships\s*\n\s*\(company_id, related_company_id/.test(server), true);
  eq('  with the switch written into its notes',
    /switchNote\(incumbentName, incomingName \?\? '', new Date\(\)\)/.test(server), true);
  eq('  after looking for one that already exists',
    /findRelationship\(db, input\.accountId, input\.incomingCompanyId\)/.test(server), true);

  // Attribution: an author the client can name is not attribution.
  eq('the answer is attributed to the session, not the body',
    /applySwitch\(db, authResult\.id,/.test(route), true);
  eq('  and an unknown answer is refused',
    /SWITCH_ANSWERS\.includes\(answer\)/.test(route), true);
  // Saying somebody replaced them without saying who records half a connector.
  eq('  replacing without a replacement is refused',
    /answer === 'replacing' && !incomingCompanyId/.test(route), true);
  // The whole book is thousands of rows nobody scrolls.
  eq('the picker leads with competitors and searches the rest',
    /isCompetitor\(c\.id\) \? competitors : others/.test(route)
      && /othersTruncated/.test(route), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
