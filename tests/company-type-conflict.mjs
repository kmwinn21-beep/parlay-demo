/**
 * A company type that differs from the one on file has to be asked about.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/company-type-conflict.mjs
 *
 * The rule, in the words it was asked for: if the system holds a company type
 * and the uploaded list holds a different one, the conflict modal surfaces. If
 * either side is blank, it does not — a blank in the system is filled in by the
 * file, and a blank in the file proposes nothing.
 *
 * The ordinary case already worked. The one that did not was a company reached
 * through a GUESSED name. The preflight asked "is this the same company?" and
 * then stopped, comparing none of its fields — so answering "Same company"
 * bound the uploaded rows to that record and the write path applied the file's
 * company type over the stored one with nobody asked. That is the one thing
 * this step exists to prevent, so the comparison now runs for a guessed match
 * too, with each row marked as conditional on the identity answer.
 *
 * Everything below runs the real route handlers against a real tenant
 * database: the rule is about what the matcher and the config-option
 * normaliser actually do to a file's values, and a hand-written stand-in for
 * either would prove nothing.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-cotype-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
delete process.env.CLERK_SECRET_KEY;
delete process.env.SMTP_HOST;
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const { createClient } = await import('@libsql/client');
const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

const ACCOUNT = 'acct-cotype';
const tenantUrl = `file:${join(dir, 'tenant.db')}`;
const tenant = createClient({ url: tenantUrl });
await seedFreshDb(tenant);
await db.execute({
  sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
        VALUES (?, 'Type Co', 'a@type.test', ?, '')`,
  args: [ACCOUNT, tenantUrl],
});
const cookie = `auth_token=${await signToken({
  id: 1300, email: 'rep@type.test', role: 'administrator', emailVerified: true, accountId: ACCOUNT,
})}`;

await tenant.execute({
  sql: `INSERT INTO conferences (id, name, start_date, end_date, location)
        VALUES (900, 'Probe Conf', '2026-11-02', '2026-11-04', 'Austin, TX')`,
});

const conflictsRoute = await import('@/app/api/conferences/[id]/attendees/upload/conflicts/route');
const uploadRoute = await import('@/app/api/conferences/[id]/attendees/upload/route');

const MAPPING = {
  first_name: 'First Name', last_name: 'Last Name', company: 'Company', company_type: 'Company Type',
};

/** A file, as the browser sends it: the sheet plus the column mapping. */
function form(rows, extra = {}) {
  const csv = ['First Name,Last Name,Company,Company Type',
    ...rows.map((r, i) => `Rep${i},Row${i},${r.company},${r.type ?? ''}`)].join('\n') + '\n';
  const fd = new FormData();
  fd.append('file', new File([csv], 'list.csv', { type: 'text/csv' }));
  fd.append('mapping', JSON.stringify(MAPPING));
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}

const post = async (route, fd) => {
  const res = await route.POST(
    new NextRequest('https://parlay.test/api/conferences/900/attendees/upload/conflicts', {
      method: 'POST', headers: { cookie }, body: fd,
    }),
    { params: { id: '900' } },
  );
  return { status: res.status, body: await res.json() };
};

/** Reset to one existing company, then ask the preflight about a file. */
async function askAbout({ existingType, companyName = 'Northstar Senior Living', rows }) {
  await tenant.execute('DELETE FROM attendees');
  await tenant.execute('DELETE FROM companies');
  await tenant.execute({
    sql: `INSERT INTO companies (name, company_type) VALUES (?, ?)`,
    args: [companyName, existingType ?? null],
  });
  const { body } = await post(conflictsRoute, form(rows));
  return body.conflicts ?? [];
}

const typeRows = cs => cs.filter(c => c.entityType === 'company' && c.field === 'company_type');
const identityRows = cs => cs.filter(c => c.entityType === 'company_identity');

// The options a fresh account has. 'Operator', 'Vendor' and 'Partner' are used
// below; asserted rather than assumed, because an uploaded value that is not
// one of them is normalised away and the comparison never happens.
const OPTIONS = (await tenant.execute(
  `SELECT value FROM config_options WHERE category = 'company_type'`,
)).rows.map(r => String(r.value));

console.log('\n— the fixture rests on these being configured types —');
eq('Operator, Vendor and Partner are all options',
  ['Operator', 'Vendor', 'Partner'].filter(t => !OPTIONS.includes(t)), []);

console.log('\n— two different types —');
{
  const got = await askAbout({ existingType: 'Operator', rows: [{ company: 'Northstar Senior Living', type: 'Vendor' }] });
  eq('one question, about the company type', typeRows(got).length, 1);
  eq('  naming the stored value and the file\'s',
    typeRows(got).map(c => [c.currentValue, c.proposedValue]), [['Operator', 'Vendor']]);
  eq('  against the existing company', typeRows(got).map(c => c.entityName), ['Northstar Senior Living']);
  eq('  labelled for a reader', typeRows(got).map(c => c.fieldLabel), ['Company Type']);
  // Nothing conditional about it: the name matched exactly.
  eq('  and unconditional', typeRows(got).map(c => c.detail ?? null), [null]);
}

console.log('\n— and the three ways there is nothing to ask —');
{
  const same = await askAbout({ existingType: 'Operator', rows: [{ company: 'Northstar Senior Living', type: 'Operator' }] });
  eq('the same type asks nothing', typeRows(same).length, 0);

  // Trimmed and case-insensitive: "operator " is not a different answer.
  const cased = await askAbout({ existingType: 'Operator', rows: [{ company: 'Northstar Senior Living', type: ' operator ' }] });
  eq('  nor does the same type in another case', typeRows(cased).length, 0);

  const blankSystem = await askAbout({ existingType: null, rows: [{ company: 'Northstar Senior Living', type: 'Vendor' }] });
  eq('a blank in the system asks nothing — the file fills it in', typeRows(blankSystem).length, 0);

  const blankFile = await askAbout({ existingType: 'Operator', rows: [{ company: 'Northstar Senior Living', type: '' }] });
  eq('a blank in the file asks nothing — nothing is proposed', typeRows(blankFile).length, 0);

  const bothBlank = await askAbout({ existingType: null, rows: [{ company: 'Northstar Senior Living', type: '' }] });
  eq('  and neither does two blanks', typeRows(bothBlank).length, 0);
}

console.log('\n— a company reached through a guessed name —');
{
  /*
   * The case that was silent. 'Brookdaale' is a typo, so the matcher proposes
   * rather than binds — and the preflight used to ask only whether the two
   * names were the same company, comparing none of its fields.
   */
  const got = await askAbout({
    existingType: 'Operator',
    companyName: 'Brookdale Senior Living',
    rows: [{ company: 'Brookdaale Senior Living', type: 'Vendor' }],
  });
  eq('the name is still queried', identityRows(got).length, 1);
  eq('  and now the type is too', typeRows(got).map(c => [c.currentValue, c.proposedValue]), [['Operator', 'Vendor']]);
  // The answer only bites if the two names turn out to be one company, and a
  // reader deciding it has to be told so.
  eq('  marked as conditional on that answer',
    typeRows(got).map(c => c.detail), ['Only if "Brookdaale Senior Living" is this company']);
}

console.log('\n— when one company is reached both ways —');
{
  /*
   * Each company is asked about once. An exact name and a guessed one both
   * landing on the same record must not let the guess claim that single slot:
   * its values may belong to a company that is not this one, and the exact
   * name's certainly do.
   */
  const got = await askAbout({
    existingType: 'Operator',
    companyName: 'Brookdale Senior Living',
    rows: [
      { company: 'Brookdale Senior Living', type: 'Vendor' },
      { company: 'Brookdaale Senior Living', type: 'Partner' },
    ],
  });
  eq('the type question belongs to the exact name',
    typeRows(got).map(c => [c.proposedValue, c.detail ?? null]), [['Vendor', null]]);
  eq('  and the guessed name still gets its own question', identityRows(got).length, 1);
}

console.log('\n— what the answers do —');
{
  /*
   * The preflight writes nothing, so the rule is only worth having if the
   * answer is honoured. Both paths are checked through the real upload route,
   * including the guessed-name one — where an UNANSWERED type used to be
   * applied over the stored value by COALESCE(?, field).
   */
  const upload = async (rows, resolutions) => {
    const res = await uploadRoute.POST(
      new NextRequest('https://parlay.test/api/conferences/900/attendees/upload', {
        method: 'POST', headers: { cookie },
        body: form(rows, { conflict_resolutions: JSON.stringify(resolutions) }),
      }),
      { params: { id: '900' } },
    );
    if (res.status >= 400) throw new Error(`upload failed: ${res.status} ${JSON.stringify(await res.json())}`);
    const row = await tenant.execute(`SELECT name, company_type FROM companies ORDER BY id`);
    return row.rows.map(r => [String(r.name), r.company_type == null ? null : String(r.company_type)]);
  };

  const setup = async (companyName, existingType) => {
    await tenant.execute('DELETE FROM attendees');
    await tenant.execute('DELETE FROM companies');
    /*
     * And the remembered answers, which are not scratch state — they are the
     * point of them. An answered identity question is stored in
     * company_name_links, and the matcher then treats that name as CONFIRMED
     * for every later upload: no question, a silent bind. Each scenario below
     * is a first upload, so each starts without them.
     */
    await tenant.execute('DELETE FROM company_name_links');
    await tenant.execute({
      sql: `INSERT INTO companies (id, name, company_type) VALUES (700, ?, ?)`,
      args: [companyName, existingType],
    });
  };

  await setup('Northstar Senior Living', 'Operator');
  eq('Ignore keeps the stored type',
    await upload([{ company: 'Northstar Senior Living', type: 'Vendor' }], { company_700_company_type: 'ignore' }),
    [['Northstar Senior Living', 'Operator']]);

  await setup('Northstar Senior Living', 'Operator');
  eq('Accept takes the file\'s',
    await upload([{ company: 'Northstar Senior Living', type: 'Vendor' }], { company_700_company_type: 'accept' }),
    [['Northstar Senior Living', 'Vendor']]);

  // The guessed name, answered "Same company" — the rows bind to the existing
  // record, and the type answer decides what it ends up holding.
  const { identityConflictField, deepNormalizeCompanyName } = await import('@/lib/matching');
  const identityKey = `company_identity_700_${identityConflictField(deepNormalizeCompanyName('Brookdaale Senior Living'))}`;

  await setup('Brookdale Senior Living', 'Operator');
  eq('a merged guess with the type ignored keeps the stored one',
    await upload([{ company: 'Brookdaale Senior Living', type: 'Vendor' }],
      { [identityKey]: 'accept', company_700_company_type: 'ignore' }),
    [['Brookdale Senior Living', 'Operator']]);

  await setup('Brookdale Senior Living', 'Operator');
  eq('  and with it accepted takes the file\'s',
    await upload([{ company: 'Brookdaale Senior Living', type: 'Vendor' }],
      { [identityKey]: 'accept', company_700_company_type: 'accept' }),
    [['Brookdale Senior Living', 'Vendor']]);

  await setup('Brookdale Senior Living', 'Operator');
  const asNew = await upload([{ company: 'Brookdaale Senior Living', type: 'Vendor' }],
    { [identityKey]: 'ignore', company_700_company_type: 'accept' });
  // Answered "New company", the existing record is not this file's to change,
  // so the type answer is inert — which is what lets the two questions sit in
  // one modal without the second one needing to know the first.
  eq('answered New company, the stored type is untouched',
    asNew.find(([n]) => n === 'Brookdale Senior Living'), ['Brookdale Senior Living', 'Operator']);
  eq('  and the file\'s name arrives as its own company with its own type',
    asNew.find(([n]) => n === 'Brookdaale Senior Living'), ['Brookdaale Senior Living', 'Vendor']);
}

console.log('\n— a name answered once stays answered —');
{
  /*
   * "Same company" is remembered in company_name_links, and the matcher then
   * treats that spelling as CONFIRMED rather than guessed. So the next upload
   * asks nothing about the name — and the type difference it carries becomes
   * an ordinary, unconditional question, which is the rule holding on the far
   * side of the merge rather than being skipped because of it.
   */
  await tenant.execute('DELETE FROM attendees');
  await tenant.execute('DELETE FROM companies');
  await tenant.execute('DELETE FROM company_name_links');
  await tenant.execute({
    sql: `INSERT INTO companies (id, name, company_type) VALUES (700, 'Brookdale Senior Living', 'Operator')`,
  });
  await tenant.execute({
    sql: `INSERT INTO company_name_links (normalized_name, company_id, decision)
          VALUES (?, 700, 'confirmed')`,
    args: [(await import('@/lib/matching')).deepNormalizeCompanyName('Brookdaale Senior Living')],
  });
  const { body } = await post(conflictsRoute, form([{ company: 'Brookdaale Senior Living', type: 'Vendor' }]));
  const got = body.conflicts ?? [];
  eq('the name is not asked about again', identityRows(got).length, 0);
  eq('  and the type question is no longer conditional',
    typeRows(got).map(c => [c.currentValue, c.proposedValue, c.detail ?? null]), [['Operator', 'Vendor', null]]);
}

console.log('\n— the reader can see the condition —');
{
  // The modal showed `detail` only on an identity row, so a conditional field
  // row would have carried its condition and displayed none of it.
  const modal = readFileSync('components/ConflictResolutionModal.tsx', 'utf8');
  eq('a field row\'s detail is appended to its subtitle',
    /\[`\$\{c\.fieldLabel\} · \$\{c\.entityType === 'attendee' \? 'Attendee' : 'Company'\}`, c\.detail\]/.test(modal), true);
  eq('  and both layouts render that one subtitle',
    (modal.match(/\{subtitle\}/g) ?? []).length, 2);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
